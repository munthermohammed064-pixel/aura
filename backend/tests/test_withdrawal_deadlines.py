"""Full member history and the 48h warning / 72h payment deadline."""
from datetime import datetime, timedelta, timezone
import asyncio

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.api import admin as admin_api
from app.core.deps import get_admin, get_current_user
from app.database import Base, get_db
from app.main import app
from app.models.finance import Withdrawal
from app.models.platform import Notification
from app.models.user import User
from app.services.settle import remind_pending_withdrawals
from app.services.withdrawals import timing

NOW = datetime(2026, 10, 24, 12, tzinfo=timezone.utc)  # Saturday: clock never pauses.


class FrozenDateTime(datetime):
    @classmethod
    def now(cls, tz=None):
        return NOW if tz else NOW.replace(tzinfo=None)


@pytest.fixture()
def env(monkeypatch):
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    db = sessionmaker(bind=engine)()
    owner = User(email="owner@test.local", password_hash="unused", role="owner", referral_code="OWNER")
    user = User(email="member@test.local", full_name="First Member Name", serial_no=42, password_hash="unused", referral_code="MEMBER")
    db.add_all([owner, user]); db.commit()
    app.dependency_overrides[get_db] = lambda: db
    app.dependency_overrides[get_admin] = lambda: owner
    admin_api.limiter._storage.reset()
    monkeypatch.setattr(admin_api, "datetime", FrozenDateTime)
    yield TestClient(app), db, owner, user
    app.dependency_overrides.clear()
    db.close(); engine.dispose()


def add_request(db, user, age, status="pending", **kwargs):
    row = Withdrawal(user_id=user.id, amount=100, fee=20, star_penalty=25,
                     address="test-wallet-address", status=status, created_at=NOW - age, **kwargs)
    db.add(row); db.flush()
    return row


def test_exact_boundaries_and_closed_requests(env):
    _, db, _, user = env
    cases = [
        (timedelta(hours=48) - timedelta(seconds=1), "scheduled"),
        (timedelta(hours=48), "due_soon"),
        (timedelta(hours=72) - timedelta(seconds=1), "due_soon"),
        (timedelta(hours=72), "overdue"),
    ]
    for age, expected in cases:
        w = add_request(db, user, age)
        # SQLite returns naive timestamps; deadlines still serialize in UTC.
        db.expire(w)
        result = timing(w, NOW)
        assert result["urgency"] == expected
        assert datetime.fromisoformat(result["due_at"]) == NOW - age + timedelta(hours=72)
        assert result["due_at"].endswith("+00:00")
    for status in ("paid", "rejected"):
        assert timing(add_request(db, user, timedelta(hours=90), status), NOW)["urgency"] is None


def test_weekend_alerts_once_per_stage_and_recipient(env):
    _, db, owner, user = env
    operator = User(email="operator@test.local", password_hash="unused", role="admin", referral_code="OP")
    inactive = User(email="inactive@test.local", password_hash="unused", role="admin", is_active=False, referral_code="OFF")
    frozen = User(email="frozen@test.local", password_hash="unused", role="admin", is_frozen=True, referral_code="FROZEN")
    db.add_all([operator, inactive, frozen]); db.flush()
    w = add_request(db, user, timedelta(hours=48), "approved")
    add_request(db, user, timedelta(hours=80), "paid")
    add_request(db, user, timedelta(hours=80), "rejected")
    db.commit()
    remind_pending_withdrawals(db, NOW)
    remind_pending_withdrawals(db, NOW + timedelta(minutes=1))
    notes = db.query(Notification).all()
    assert len(notes) == 2
    assert {n.user_id for n in notes} == {owner.id, operator.id}
    assert {n.kind for n in notes} == {"admin_withdrawal_due_soon"}
    assert all(n.params["withdrawal_id"] == str(w.id) and n.params["amount"] == "55.00" for n in notes)
    assert all(n.params["serial"] == "LA0042" for n in notes)
    remind_pending_withdrawals(db, NOW + timedelta(hours=24))
    remind_pending_withdrawals(db, NOW + timedelta(hours=25))
    assert db.query(Notification).count() == 4
    assert db.query(Notification).filter(Notification.kind == "admin_withdrawal_overdue").count() == 2


def test_no_alert_before_48h_or_after_payment_and_catchup(env):
    _, db, _, user = env
    w = add_request(db, user, timedelta(hours=48) - timedelta(seconds=1))
    db.commit()
    remind_pending_withdrawals(db, NOW)
    assert db.query(Notification).count() == 0
    w.status = "paid"; db.commit()
    remind_pending_withdrawals(db, NOW + timedelta(hours=30))
    assert db.query(Notification).count() == 0
    add_request(db, user, timedelta(hours=80)); db.commit()
    remind_pending_withdrawals(db, NOW)
    assert db.query(Notification).one().kind == "admin_withdrawal_overdue"


def test_complete_user_history_search_totals_and_timestamps(env):
    client, db, _, user = env
    # The member's history is older than 200 other requests: it must remain reachable.
    paid_at = NOW - timedelta(days=20)
    target = add_request(db, user, timedelta(days=21), "paid", processed_at=paid_at, txid="paid-tx")
    add_request(db, user, timedelta(hours=49), "approved")
    other = User(email="other@test.local", full_name="Other Member Name", serial_no=43, password_hash="unused", referral_code="OTHER")
    db.add(other); db.flush()
    for i in range(205):
        add_request(db, other, timedelta(minutes=i), "paid")
    db.commit()
    result = client.get(f"/api/admin/withdrawals/history?user_id={user.id}&status=all").json()
    assert result["total"] == 2
    assert result["summary"]["paid_net"] == 55
    assert result["summary"]["open_net"] == 55
    assert result["summary"]["due_soon_count"] == 1
    record = next(r for r in result["items"] if r["id"] == str(target.id))
    assert record["processed_at"] == paid_at.isoformat()
    assert record["txid"] == "paid-tx" and record["user_id"] == str(user.id)
    for search in ("LA0042", "42", "First Member", "member@test.local"):
        assert client.get("/api/admin/withdrawals/history", params={"q": search}).json()["total"] == 2
    page1 = client.get("/api/admin/withdrawals/history?limit=100").json()
    page3 = client.get("/api/admin/withdrawals/history?limit=100&offset=200").json()
    assert page1["total"] == 207 and len(page1["items"]) == 100 and len(page3["items"]) == 7
    assert not ({r["id"] for r in page1["items"]} & {r["id"] for r in page3["items"]})


def test_priority_filters_stats_and_payment_removes_alert(env):
    client, db, _, user = env
    fresh = add_request(db, user, timedelta(hours=1))
    soon = add_request(db, user, timedelta(hours=48), "approved")
    late = add_request(db, user, timedelta(hours=72))
    add_request(db, user, timedelta(hours=90), "paid")
    db.commit()
    urgent = client.get("/api/admin/withdrawals/history?status=urgent").json()
    assert [r["id"] for r in urgent["items"]] == [str(late.id), str(soon.id)]
    assert client.get("/api/admin/withdrawals/history?status=overdue").json()["total"] == 1
    assert client.get("/api/admin/withdrawals/history?status=due_soon").json()["total"] == 1
    assert client.get("/api/admin/withdrawals/history?status=open").json()["total"] == 3
    stats = client.get("/api/admin/stats").json()
    assert stats["withdrawals_due_soon"] == 1 and stats["withdrawals_overdue"] == 1
    assert stats["withdrawals_urgent_net"] == 110
    late.status = "paid"; soon.status = "rejected"; db.commit()
    assert client.get("/api/admin/withdrawals/history?status=urgent").json()["total"] == 0
    assert client.get("/api/admin/stats").json()["withdrawals_urgent_net"] == 0
    assert timing(fresh, NOW)["urgency"] == "scheduled"


def test_history_validation_and_staff_only(env):
    client, _, _, user = env
    for query in ("offset=-1", "limit=101", "user_id=invalid"):
        assert client.get(f"/api/admin/withdrawals/history?{query}").status_code == 422
    assert client.get("/api/admin/withdrawals/history?status=bogus").status_code == 400
    assert client.get("/api/admin/withdrawals/history", params={"q": "9" * 120}).status_code == 200
    del app.dependency_overrides[get_admin]
    app.dependency_overrides[get_current_user] = lambda: user
    assert client.get("/api/admin/withdrawals/history").status_code == 403


def test_deadline_check_runs_even_if_investment_settlement_fails(monkeypatch):
    from app import main
    calls = []

    class Session:
        def close(self):
            calls.append("closed")

    def broken_settlement(db):
        raise RuntimeError("unrelated settlement failure")

    async def stop_after_tick(seconds):
        assert seconds == 60
        raise asyncio.CancelledError

    monkeypatch.setattr(main, "SessionLocal", Session)
    monkeypatch.setattr(main, "settle_matured", broken_settlement)
    monkeypatch.setattr(main, "remind_pending_withdrawals", lambda db: calls.append("deadline checked"))
    monkeypatch.setattr(main.asyncio, "sleep", stop_after_tick)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(main._settlement_loop())
    assert calls == ["closed", "deadline checked", "closed"]
