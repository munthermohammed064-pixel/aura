"""Trading-code lifecycle: TTL is honoured exactly, timestamps serialize
with an explicit UTC offset, forgiving input matching, expiry/close/dup."""
import re
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.config import settings
from app.core.security import hash_password
from app.database import Base, get_db
from app.main import app
from app.models.finance import LedgerEntry, Package, TradingCode, Withdrawal
from app.models.user import User


@pytest.fixture()
def env():
    engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False},
                           poolclass=StaticPool)
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    admin = User(email="admin@internal.local", login_id="nx-admin-test",
                 password_hash=hash_password("AdminPassw0rd!"),
                 role="owner", full_name="Admin", referral_code="ADM01")
    pkg = Package(name="N0", min_deposit=15, max_deposit=15,
                  return_min_amount=0.3, return_max_amount=0.5,
                  duration_days=365, is_active=True, sort_order=0)
    session.add_all([admin, pkg])
    session.commit()
    def _override():
        yield session
    app.dependency_overrides[get_db] = _override
    # each router module owns its Limiter instance — clear the auth and admin
    # stores so per-test windows don't carry over (register/login caps are 10/min).
    from app.api import auth as auth_api, admin as admin_api, wallet as wallet_api
    for mod in (auth_api, admin_api, wallet_api):
        try:
            mod.limiter._storage.reset()
        except Exception:
            mod.limiter._storage.storage.clear()
    yield TestClient(app), session, admin, pkg
    app.dependency_overrides.clear()
    session.close()


PANEL = {"X-Panel-Key": settings.ADMIN_PANEL_KEY}


def _admin(client):
    r = client.post("/api/auth/login",
                    json={"identifier": "admin@internal.local", "password": "AdminPassw0rd!"},
                    headers=PANEL)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", **PANEL}


def _invested_user(client, session, pkg, admin_h, email):
    r = client.post("/api/auth/register",
                    json={"email": email, "password": "UserPassw0rd!!", "full_name": "Test User One"})
    assert r.status_code == 201, r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    uid = client.get("/api/auth/me", headers=h).json()["id"]
    assert client.post(f"/api/admin/users/{uid}/adjust",
                       json={"amount": 500, "note": "seed"}, headers=admin_h).status_code == 200
    r = client.post("/api/invest", json={"package_id": str(pkg.id), "amount": float(pkg.min_deposit),
                                         "acknowledge_risk": True}, headers=h)
    assert r.status_code == 201, r.text
    return h


def test_create_redeem_ttl_and_tz(env):
    client, session, admin, pkg = env
    ah = _admin(client)
    uh = _invested_user(client, session, pkg, ah, "u1@t.io")

    r = client.post("/api/admin/codes",
                    json={"ttl_hours": 2, "amounts": {str(pkg.id): float(pkg.return_min_amount)}},
                    headers=ah)
    assert r.status_code == 201, r.text
    body = r.json()
    # serialized with explicit UTC offset so browsers don't parse it as local time
    assert body["expires_at"].endswith("+00:00"), body["expires_at"]
    dt = datetime.fromisoformat(body["expires_at"])
    hours = (dt - datetime.now(timezone.utc)).total_seconds() / 3600
    assert 1.9 < hours < 2.1, hours  # admin picked 2h → code lives 2h

    r = client.post("/api/wallet/redeem-code", json={"code": body["code"]}, headers=uh)
    assert r.status_code == 200, r.text
    assert float(r.json()["credited"]) == float(pkg.return_min_amount)

    # duplicate redemption rejected
    r = client.post("/api/wallet/redeem-code", json={"code": body["code"]}, headers=uh)
    assert r.status_code == 400 and "redeemed" in r.text.lower()


def test_forgiving_code_input(env):
    client, session, admin, pkg = env
    ah = _admin(client)
    uh = _invested_user(client, session, pkg, ah, "u2@t.io")
    client.post("/api/admin/codes",
                json={"ttl_hours": 1, "code": "NX-TEST99",
                      "amounts": {str(pkg.id): float(pkg.return_min_amount)}}, headers=ah)
    # lowercase + space + dropped dash still match the stored code
    r = client.post("/api/wallet/redeem-code", json={"code": " nx test99"}, headers=uh)
    assert r.status_code == 200, r.text


def test_expired_closed_bounds_and_no_investment(env):
    client, session, admin, pkg = env
    ah = _admin(client)
    uh = _invested_user(client, session, pkg, ah, "u3@t.io")

    dead = TradingCode(code="DEAD99", amounts={str(pkg.id): 0.3},
                       expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
                       is_active=True, created_by=admin.id)
    session.add(dead)
    session.commit()
    r = client.post("/api/wallet/redeem-code", json={"code": "dead99"}, headers=uh)
    assert r.status_code == 400 and "invalid" in r.text.lower()

    r = client.post("/api/admin/codes",
                    json={"ttl_hours": 1, "code": "CLOSEME1",
                          "amounts": {str(pkg.id): 0.4}}, headers=ah)
    cid = r.json()["id"]
    assert client.post(f"/api/admin/codes/{cid}/close", headers=ah).status_code == 200
    r = client.post("/api/wallet/redeem-code", json={"code": "closeme1"}, headers=uh)
    assert r.status_code == 400 and "invalid" in r.text.lower()

    assert client.post("/api/admin/codes", json={"ttl_hours": 0, "amounts": {str(pkg.id): 0.4}},
                       headers=ah).status_code == 422
    assert client.post("/api/admin/codes", json={"ttl_hours": 999, "amounts": {str(pkg.id): 0.4}},
                       headers=ah).status_code == 422

    r = client.post("/api/auth/register",
                    json={"email": "u4@t.io", "password": "UserPassw0rd!!", "full_name": "Test User Four"})
    h4 = {"Authorization": f"Bearer {r.json()['access_token']}"}
    client.post("/api/admin/codes",
                json={"ttl_hours": 1, "code": "NOINV1",
                      "amounts": {str(pkg.id): 0.4}}, headers=ah)
    r = client.post("/api/wallet/redeem-code", json={"code": "NOINV1"}, headers=h4)
    assert r.status_code == 400 and "package" in r.text.lower()


def test_utc_offset_everywhere(env):
    """Every datetime the API emits must carry +00:00 — naive ISO makes
    browsers parse it as local time and shifts every timestamp by the
    viewer's offset (the code-expiry bug's root cause)."""
    client, session, admin, pkg = env
    ah = _admin(client)
    uh = _invested_user(client, session, pkg, ah, "u5@t.io")

    client.post("/api/tickets", json={"subject": "hi", "body": "b"}, headers=uh)
    tk = client.get("/api/tickets", headers=uh).json()[0]
    assert tk["created_at"].endswith("+00:00"), tk["created_at"]

    s = client.get("/api/profile/sessions", headers=uh).json()
    assert s and s[0]["created_at"].endswith("+00:00")
    assert "refresh_token_hash" not in s[0]  # never leak token hashes

    inv = client.get("/api/investments", headers=uh).json()[0]
    assert inv["started_at"].endswith("+00:00") and inv["ends_at"].endswith("+00:00")

    refs = client.get("/api/referrals", headers=uh).json()
    # commissions list may be empty; referred/joined covered when present
    for c in refs["commissions"]:
        assert c["created_at"].endswith("+00:00")

    deps = client.get("/api/deposits", headers=uh).json()
    for d in deps:
        assert d["created_at"].endswith("+00:00")


def test_ttl_boundary(env):
    """A code must work right up to its expiry — and fail the moment after."""
    client, session, admin, pkg = env
    ah = _admin(client)
    uh = _invested_user(client, session, pkg, ah, "u6@t.io")
    client.post("/api/admin/codes",
                json={"ttl_hours": 1, "code": "EDGE1",
                      "amounts": {str(pkg.id): float(pkg.return_min_amount)}}, headers=ah)
    tc = session.query(TradingCode).filter_by(code="EDGE1").one()
    tc.expires_at = datetime.now(timezone.utc) + timedelta(seconds=30)
    session.commit()
    r = client.post("/api/wallet/redeem-code", json={"code": "edge1"}, headers=uh)
    assert r.status_code == 200, r.text  # 30s before expiry → still valid


def test_package_lifecycle_guards(env):
    """Deleting a package with investments, or an inverted range, must be
    refused — both silently broke the platform before."""
    client, session, admin, pkg = env
    ah = _admin(client)
    _invested_user(client, session, pkg, ah, "u7@t.io")  # active investment on pkg

    r = client.delete(f"/api/admin/packages/{pkg.id}", headers=ah)
    assert r.status_code == 409 and "investment" in r.text.lower(), r.text

    # live code referencing a package (no investments) also blocks deletion
    p2 = Package(name="N9", min_deposit=10, max_deposit=10,
                 return_min_amount=0.1, return_max_amount=1.0,
                 duration_days=30, is_active=True, sort_order=9)
    session.add(p2); session.commit()
    r = client.post("/api/admin/codes",
                    json={"ttl_hours": 1, "amounts": {str(p2.id): 0.4}}, headers=ah)
    assert r.status_code == 201
    code_id = r.json()["id"]
    r = client.delete(f"/api/admin/packages/{p2.id}", headers=ah)
    assert r.status_code == 409 and "code" in r.text.lower(), r.text
    # once the code is closed the package deletes cleanly
    client.post(f"/api/admin/codes/{code_id}/close", headers=ah)
    assert client.delete(f"/api/admin/packages/{p2.id}", headers=ah).status_code == 200

    # deactivate → invest blocked
    body = {"name": pkg.name, "min_deposit": 15, "max_deposit": 15,
            "return_min_amount": 0.3, "return_max_amount": 0.5,
            "duration_days": 365, "is_active": False}
    r = client.put(f"/api/admin/packages/{pkg.id}", json=body, headers=ah)
    assert r.status_code == 200 and r.json()["is_active"] is False
    uh2 = {"Authorization": f"Bearer {client.post('/api/auth/register', json={'email': 'u8@t.io', 'password': 'UserPassw0rd!!', 'full_name': 'Test User Eight'}).json()['access_token']}"}
    r = client.post("/api/invest", json={"package_id": str(pkg.id), "amount": 15,
                                         "acknowledge_risk": True}, headers=uh2)
    assert r.status_code == 404  # deactivated package can't be invested into

    # inverted ranges refused on update and create
    bad = {**body, "min_deposit": 100, "max_deposit": 50}
    assert client.put(f"/api/admin/packages/{pkg.id}", json=bad, headers=ah).status_code == 400
    assert client.post("/api/admin/packages", json=bad, headers=ah).status_code == 400
    bad2 = {**body, "return_min_amount": 9, "return_max_amount": 1}
    assert client.put(f"/api/admin/packages/{pkg.id}", json=bad2, headers=ah).status_code == 400


def test_three_part_name_required(env):
    client, session, *_ = env
    # too short / empty / whitespace-only names refused
    for bad in ["", "  ", "Ahmad", "Ahmad Ali"]:
        r = client.post("/api/auth/register",
                        json={"email": f"n{len(bad)}@t.io", "password": "UserPassw0rd!!",
                              "full_name": bad})
        assert r.status_code == 400 and "three-part" in r.text, (bad, r.text)
    # three words pass — and messy whitespace gets normalized on save
    r = client.post("/api/auth/register",
                    json={"email": "good@t.io", "password": "UserPassw0rd!!",
                          "full_name": "  Ahmad   Ali  Husseini "})
    assert r.status_code == 201, r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = client.get("/api/auth/me", headers=h).json()
    assert me["full_name"] == "Ahmad Ali Husseini"
    # profile update enforces the same rule
    assert client.put("/api/profile", json={"full_name": "Just Two"},
                      headers=h).status_code == 400
    assert client.put("/api/profile", json={"full_name": "A B C"},
                      headers=h).status_code == 200


def test_withdrawal_fee_auto_counted(env, monkeypatch):
    client, session, *_ = env
    monkeypatch.setattr("app.services.mailer.send", lambda *a, **k: True)
    ah = _admin(client)
    # pin "now" to a Tuesday so the weekend rule never flakes the test
    import app.api.wallet as wapi
    class _Tue(datetime):
        @classmethod
        def now(cls, tz=None): return cls(2026, 10, 6, 12, tzinfo=timezone.utc)
    monkeypatch.setattr(wapi, "datetime", _Tue)

    r = client.post("/api/auth/register",
                    json={"email": "w@t.io", "password": "UserPassw0rd!!",
                          "full_name": "Wallet Test User"})
    assert r.status_code == 201, r.text
    uh = {"Authorization": f"Bearer {r.json()['access_token']}"}
    uid = client.get("/api/auth/me", headers=uh).json()["id"]
    client.post("/api/profile/withdraw-address", json={"address": "0xTESTADDR"}, headers=uh)
    assert client.post(f"/api/admin/users/{uid}/adjust",
                       json={"amount": 100, "note": "seed"}, headers=ah).status_code == 200

    # Admin max (default 50000) is the only ceiling. The 20% fee is removed
    # from the wallet as a normal fee. It is not credited to the admin.
    r = client.post("/api/withdrawals", json={"amount": 100, "address": "0xTESTADDR"}, headers=uh)
    assert r.status_code == 201, r.text
    wid = r.json()["id"]
    assert float(r.json()["fee"]) == 20
    from app.models.user import Wallet
    import uuid as _uuid
    wallet = session.query(Wallet).filter(Wallet.user_id == _uuid.UUID(uid)).one()
    assert float(wallet.available) == 0
    assert float(wallet.pending) == 80
    fee_row = session.query(LedgerEntry).filter(LedgerEntry.kind == "fee", LedgerEntry.user_id == wallet.user_id).one()
    assert fee_row.direction == "debit" and float(fee_row.amount) == 20
    assert session.query(LedgerEntry).filter(LedgerEntry.kind == "fee", LedgerEntry.direction == "credit").count() == 0
    txs = client.get("/api/wallet/transactions", headers=uh)
    assert txs.status_code == 200, txs.text
    assert all(row["bucket"] == "available" for row in txs.json())
    assert any(row["kind"] == "fee" and row["direction"] == "debit" for row in txs.json())
    # paying sends the net and does not put the fee anywhere
    paid = client.post(f"/api/admin/withdrawals/{wid}/process",
                       json={"action": "paid", "txid": "TX1"}, headers=ah)
    assert paid.status_code == 200, paid.text
    session.expire_all()
    wallet = session.query(Wallet).filter(Wallet.user_id == _uuid.UUID(uid)).one()
    assert float(wallet.available) == 0
    assert float(wallet.pending) == 0
    assert session.query(LedgerEntry).filter(
        LedgerEntry.kind == "fee", LedgerEntry.direction == "credit").count() == 0
    # a rejected request gives the fee and the payout back
    assert client.post(f"/api/admin/users/{uid}/adjust",
                       json={"amount": 50, "note": "more"}, headers=ah).status_code == 200
    r = client.post("/api/withdrawals", json={"amount": 40, "address": "0xTESTADDR"}, headers=uh)
    assert r.status_code == 201, r.text
    rej = client.post(f"/api/admin/withdrawals/{r.json()['id']}/process",
                      json={"action": "reject", "note": "no"}, headers=ah)
    assert rej.status_code == 200, rej.text
    session.expire_all()
    wallet = session.query(Wallet).filter(Wallet.user_id == _uuid.UUID(uid)).one()
    assert float(wallet.available) == 50
    assert float(wallet.pending) == 0
    # above the admin maximum is refused by that limit, not by a fee formula
    r = client.post("/api/withdrawals", json={"amount": 60000, "address": "0xTESTADDR"}, headers=uh)
    assert r.status_code == 400 and "between" in r.text.lower(), r.text


def test_legacy_stacked_fee_is_returned_once(env, monkeypatch):
    """Older requests locked amount+fee. Paying them must not take the fee twice."""
    client, session, *_ = env
    monkeypatch.setattr("app.services.mailer.send", lambda *a, **k: True)
    ah = _admin(client)
    r = client.post("/api/auth/register",
                    json={"email": "old@t.io", "password": "UserPassw0rd!!",
                          "full_name": "Legacy Fee User"})
    assert r.status_code == 201, r.text
    uh = {"Authorization": f"Bearer {r.json()['access_token']}"}
    uid = client.get("/api/auth/me", headers=uh).json()["id"]
    assert client.post(f"/api/admin/users/{uid}/adjust",
                       json={"amount": 100, "note": "seed"}, headers=ah).status_code == 200
    import uuid as _uuid
    from app.models.user import Wallet
    from app.services import ledger
    user_id = _uuid.UUID(uid)
    w = Withdrawal(user_id=user_id, amount=20, fee=4, address="TOLD", status="pending")
    session.add(w)
    session.flush()
    ledger.post(session, user_id=user_id, kind="withdrawal", direction="debit",
                bucket="available", amount=24, reference_type="withdrawal", reference_id=w.id,
                note="Withdrawal request hold")
    ledger.post(session, user_id=user_id, kind="withdrawal", direction="credit",
                bucket="pending", amount=24, reference_type="withdrawal", reference_id=w.id,
                note="Withdrawal request hold")
    session.commit()
    paid = client.post(f"/api/admin/withdrawals/{w.id}/process",
                       json={"action": "paid", "txid": "OLD1"}, headers=ah)
    assert paid.status_code == 200, paid.text
    session.expire_all()
    wallet = session.query(Wallet).filter(Wallet.user_id == user_id).one()
    assert float(wallet.pending) == 0
    assert float(wallet.available) == 80
