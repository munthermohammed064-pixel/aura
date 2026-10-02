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
from app.models.finance import Package, TradingCode
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
                    json={"email": email, "password": "UserPassw0rd!!", "name": "U"})
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
                    json={"email": "u4@t.io", "password": "UserPassw0rd!!", "name": "U4"})
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
