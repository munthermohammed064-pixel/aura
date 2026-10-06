"""Admin return credit must not swallow the principal, and zeroing an account
must close an approved withdrawal so Pay/Reject are not left pointing at an
empty hold."""
import uuid
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
from app.models.finance import Investment, Package, Withdrawal
from app.models.user import User, Wallet
from app.services.settle import settle_matured


@pytest.fixture()
def env(monkeypatch):
    monkeypatch.setattr("app.services.mailer.send", lambda *a, **k: True)
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
    from app.api import admin as admin_api, auth as auth_api, packages as packages_api
    for mod in (auth_api, admin_api, packages_api):
        try:
            mod.limiter._storage.reset()
        except Exception:
            mod.limiter._storage.storage.clear()
    yield TestClient(app), session, pkg
    app.dependency_overrides.clear()
    session.close()


PANEL = {"X-Panel-Key": settings.ADMIN_PANEL_KEY}


def _admin(client):
    r = client.post("/api/auth/login",
                    json={"identifier": "admin@internal.local", "password": "AdminPassw0rd!"},
                    headers=PANEL)
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}", **PANEL}


def _user_with_investment(client, session, pkg, admin_h):
    r = client.post("/api/auth/register",
                    json={"email": "holder@t.io", "password": "UserPassw0rd!!",
                          "full_name": "Test User One"})
    assert r.status_code == 201, r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    me = client.get("/api/auth/me", headers=h).json()
    assert client.post(f"/api/admin/users/{me['id']}/adjust",
                       json={"amount": 500, "note": "seed"}, headers=admin_h).status_code == 200
    r = client.post("/api/invest", json={"package_id": str(pkg.id), "amount": 15,
                                         "acknowledge_risk": True}, headers=h)
    assert r.status_code == 201, r.text
    session.expire_all()
    uid = uuid.UUID(me["id"])
    inv = session.query(Investment).filter(Investment.user_id == uid).one()
    user = session.get(User, uid)
    return h, inv, user


def test_admin_return_leaves_principal_until_maturity(env):
    client, session, pkg = env
    ah = _admin(client)
    _, inv, user = _user_with_investment(client, session, pkg, ah)

    r = client.post(f"/api/admin/investments/{inv.id}/settle",
                    json={"return_amount": 2}, headers=ah)
    assert r.status_code == 200, r.text
    session.expire_all()
    inv = session.get(Investment, inv.id)
    user = session.get(User, user.id)
    assert inv.status == "active"
    assert float(inv.realized_return) == 2
    assert float(user.wallet.invested) == 15
    assert float(user.wallet.available) == 487  # 500 - 15 + 2

    again = client.post(f"/api/admin/investments/{inv.id}/settle",
                        json={"return_amount": 9}, headers=ah)
    assert again.status_code == 400
    session.expire_all()
    assert float(session.get(User, user.id).wallet.available) == 487

    listed = client.get("/api/admin/investments", headers=ah).json()
    row = next(x for x in listed if x["id"] == str(inv.id))
    assert row["return_settled"] is True
    assert row["status"] == "active"

    inv.ends_at = datetime.now(timezone.utc) - timedelta(minutes=1)
    session.commit()
    assert settle_matured(session) == 1
    session.expire_all()
    inv = session.get(Investment, inv.id)
    user = session.get(User, user.id)
    assert inv.status == "completed"
    assert float(user.wallet.invested) == 0
    assert float(user.wallet.available) == 502  # principal 15 came back
    assert settle_matured(session) == 0
    session.expire_all()
    assert float(session.get(User, user.id).wallet.available) == 502


def test_completed_investment_still_gets_principal_once(env):
    """A settle that already closed the row must not keep the capital stuck,
    and must not pay that capital twice."""
    client, session, pkg = env
    user = User(email="stuck@t.io", password_hash="x", referral_code="STUCK1", full_name="Stuck User One")
    session.add(user)
    session.flush()
    session.add(Wallet(user_id=user.id, available=0, invested=40))
    inv = Investment(user_id=user.id, package_id=pkg.id, amount=40, status="completed",
                     ends_at=datetime.now(timezone.utc) - timedelta(days=1))
    session.add(inv)
    session.commit()

    assert settle_matured(session) == 1
    session.expire_all()
    user = session.get(User, user.id)
    assert float(user.wallet.invested) == 0
    assert float(user.wallet.available) == 40
    assert settle_matured(session) == 0
    session.expire_all()
    assert float(session.get(User, user.id).wallet.available) == 40


def test_principal_waits_for_maturity(env):
    client, session, pkg = env
    user = User(email="early@t.io", password_hash="x", referral_code="EARLY1", full_name="Early User One")
    session.add(user)
    session.flush()
    session.add(Wallet(user_id=user.id, available=0, invested=10))
    session.add(Investment(user_id=user.id, package_id=pkg.id, amount=10, status="active",
                           ends_at=datetime.now(timezone.utc) + timedelta(days=3)))
    session.commit()
    assert settle_matured(session) == 0
    session.expire_all()
    assert float(session.get(User, user.id).wallet.invested) == 10


def test_zero_closes_approved_withdrawal(env):
    client, session, pkg = env
    ah = _admin(client)
    r = client.post("/api/auth/register",
                    json={"email": "wd@t.io", "password": "UserPassw0rd!!",
                          "full_name": "Withdraw User One"})
    assert r.status_code == 201, r.text
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    uid = uuid.UUID(client.get("/api/auth/me", headers=h).json()["id"])
    session.expire_all()
    user = session.get(User, uid)
    user.wallet.pending = 25
    wd = Withdrawal(user_id=user.id, amount=20, fee=5, address="TAddr123456", status="approved")
    session.add(wd)
    session.commit()
    wid = wd.id

    assert client.post(f"/api/admin/users/{uid}/zero", headers=ah).status_code == 200
    session.expire_all()
    wd = session.get(Withdrawal, wid)
    user = session.get(User, uid)
    assert wd.status == "rejected"
    assert float(user.wallet.pending) == 0

    paid = client.post(f"/api/admin/withdrawals/{wid}/process",
                       json={"action": "paid", "txid": "abc"}, headers=ah)
    assert paid.status_code == 400
    session.expire_all()
    assert float(session.get(User, user.id).wallet.available) == 0
