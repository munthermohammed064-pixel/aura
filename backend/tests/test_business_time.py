from datetime import datetime, timedelta, timezone
import importlib.util
from pathlib import Path
import uuid

from alembic.migration import MigrationContext
from alembic.operations import Operations
from sqlalchemy import create_engine, text

from app.database import Base
from app.models.finance import Investment, LedgerEntry, Package, Withdrawal
from app.models.platform import Notification
from app.models.user import User
from app.services.business_time import add_working_time, working_cutoff
from app.services.settle import remind_pending_withdrawals
from app.services.withdrawals import timing, summary
from sqlalchemy.orm import Session


def dt(day, hour=0):
    return datetime(2026, 10, day, hour, tzinfo=timezone.utc)


def test_friday_withdrawal_warning_and_deadline_pause_over_weekend():
    w = Withdrawal(created_at=dt(23, 10), status="pending")
    assert timing(w, dt(26, 9))["urgency"] == "scheduled"
    assert timing(w, dt(27, 10))["urgency"] == "due_soon"
    assert timing(w, dt(28, 10))["urgency"] == "overdue"
    assert datetime.fromisoformat(timing(w, dt(24))["alert_at"]) == dt(27, 10)
    assert datetime.fromisoformat(timing(w, dt(24))["due_at"]) == dt(28, 10)


def test_ninety_working_days_and_weekend_activation():
    # Monday + 18 working weeks = Monday at the same hour.
    start = dt(26, 10)
    assert add_working_time(start, timedelta(days=90)) == start + timedelta(days=126)
    assert add_working_time(dt(24, 10), timedelta(days=1)) == dt(27)
    assert add_working_time(dt(23, 10).replace(tzinfo=None), timedelta(hours=72)) == dt(28, 10)


def test_cutoffs_match_deadlines_even_at_weekend_midnight():
    # Validate the indexed SQL cutoff against forward arithmetic, across two weeks.
    start = dt(19)
    for hour in range(14 * 24):
        now = start + timedelta(hours=hour)
        for hours in (48, 72):
            cutoff = working_cutoff(now, timedelta(hours=hours))
            for delta in (-timedelta(microseconds=1), timedelta(0), timedelta(microseconds=1)):
                created = cutoff + delta
                assert (created <= cutoff) == (add_working_time(created, timedelta(hours=hours)) <= now)


def test_weekend_summary_filters_and_notifications():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(email="weekend@test.local", password_hash="unused", referral_code="WEEKEND", role="owner")
        db.add(user); db.flush()
        w = Withdrawal(user_id=user.id, amount=100, fee=0, star_penalty=0,
                       address="wallet", status="approved", created_at=dt(23, 10))
        db.add(w); db.commit()
        for now in (dt(24, 12), dt(25, 12), dt(26, 9)):
            counts = summary(db.query(Withdrawal), now)
            assert counts["due_soon_count"] == counts["overdue_count"] == 0
            remind_pending_withdrawals(db, now)
            assert db.query(Notification).count() == 0
        remind_pending_withdrawals(db, dt(27, 10))
        assert db.query(Notification).one().kind == "admin_withdrawal_due_soon"
        remind_pending_withdrawals(db, dt(28, 10))
        assert db.query(Notification).count() == 2
    engine.dispose()


def test_migration_preserves_returned_terms_and_uses_original_duration():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    ids = [uuid.uuid4() for _ in range(4)]
    with Session(engine) as db:
        user = User(email="migration@test.local", password_hash="unused", referral_code="MIGRATE")
        # Package has since been edited: do not use its present duration.
        pkg = Package(name="N0", min_deposit=1, max_deposit=100, duration_days=365)
        db.add_all([user, pkg]); db.flush()
        for ident, status in zip(ids, ("active", "completed", "cancelled", "completed")):
            db.add(Investment(id=ident, user_id=user.id, package_id=pkg.id, amount=10,
                              status=status, started_at=dt(26, 10), ends_at=dt(26, 10) + timedelta(days=90)))
        db.add(LedgerEntry(user_id=user.id, kind="investment", direction="credit", bucket="available", amount=10,
                           idempotency_key=f"principal-in:{ids[1]}"))
        db.commit()
    path = Path(__file__).parents[1] / "alembic/versions/i9j0k1l2m3n4_working_day_terms.py"
    spec = importlib.util.spec_from_file_location("working_day_migration", path)
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with engine.begin() as connection:
        migration.op = Operations(MigrationContext.configure(connection))
        migration.upgrade()
        def dates():
            return dict(connection.execute(text("select id, ends_at from investments")).all())
        values = dates()
        assert values[ids[0].hex].startswith("2027-03-01 10:00:00")
        assert values[ids[3].hex] == values[ids[0].hex]
        assert values[ids[1].hex].startswith("2027-01-24 10:00:00")
        assert values[ids[2].hex] == values[ids[1].hex]
        migration.downgrade()
        assert len(set(dates().values())) == 1
        migration.upgrade()
        assert dates() == values
    engine.dispose()


def test_invest_api_uses_working_term_and_preserves_principal(monkeypatch):
    from fastapi.testclient import TestClient
    from sqlalchemy.pool import StaticPool
    from app.api import packages
    from app.core.deps import get_current_user
    from app.database import get_db
    from app.main import app
    from app.models.user import Wallet
    from app.services import ledger

    class Clock(datetime):
        @classmethod
        def now(cls, tz=None):
            return dt(23, 10)

    monkeypatch.setattr(packages, "datetime", Clock)
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as db:
            user = User(email="invest@test.local", password_hash="unused", referral_code="INVEST")
            pkg = Package(name="N0", min_deposit=10, max_deposit=100, duration_days=90)
            db.add_all([user, pkg]); db.flush()
            db.add(Wallet(user_id=user.id)); db.flush()
            ledger.post(db, user_id=user.id, kind="deposit", direction="credit", bucket="available", amount=100)
            db.commit()
            app.dependency_overrides[get_db] = lambda: db
            app.dependency_overrides[get_current_user] = lambda: user
            packages.limiter._storage.reset()
            response = TestClient(app).post("/api/invest", json={
                "package_id": str(pkg.id), "amount": 50, "acknowledge_risk": True,
            })
            assert response.status_code == 201, response.text
            data = TestClient(app).get("/api/investments").json()[0]
            assert datetime.fromisoformat(data["started_at"]) == dt(23, 10)
            assert datetime.fromisoformat(data["ends_at"]) == add_working_time(dt(23, 10), timedelta(days=90))
            assert float(user.wallet.available) == float(user.wallet.invested) == 50
    finally:
        app.dependency_overrides.clear()
        engine.dispose()
