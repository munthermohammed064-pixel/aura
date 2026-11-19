import uuid
from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import ValidationError
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.config import settings
from app.core.deps import get_current_user, panel_key_ok
from app.core.security import (create_access_token, hash_password, verify_password,
                               hash_refresh_token, verify_refresh_token)
from app.database import Base
from app.models.user import User, Session as UserSession
from app.schemas import WithdrawIn, InvestIn
from app.services.ledger import post, LedgerError


def test_refresh_hash_checks_bytes_beyond_bcrypt_limit():
    prefix = "a" * 100
    hashed = hash_refresh_token(prefix + "one")
    assert verify_refresh_token(prefix + "one", hashed)
    assert not verify_refresh_token(prefix + "two", hashed)
    assert verify_refresh_token("legacy-token", hash_password("legacy-token"))


def test_new_password_hash_does_not_truncate_utf8_passwords():
    password = "ع" * 50
    hashed = hash_password(password + "one")
    assert verify_password(password + "one", hashed)
    assert not verify_password(password + "two", hashed)


def test_old_bcrypt_passwords_still_work():
    from passlib.hash import bcrypt
    hashed = bcrypt.hash("ExistingPassword123!")
    assert verify_password("ExistingPassword123!", hashed)
    assert not verify_password("wrong", hashed)


@pytest.mark.parametrize("amount", [float("nan"), float("inf"), -float("inf")])
def test_nonfinite_money_rejected_before_database_write(amount):
    with pytest.raises(ValidationError):
        WithdrawIn(amount=amount, address="address")
    with pytest.raises(ValidationError):
        InvestIn(amount=amount, package_id=uuid.uuid4(), acknowledge_risk=True)
    with pytest.raises(LedgerError):
        post(None, user_id=uuid.uuid4(), kind="deposit", direction="credit",
             bucket="available", amount=amount)


def test_non_ascii_panel_header_fails_closed(monkeypatch):
    monkeypatch.setattr(settings, "ADMIN_PANEL_KEY", "test-panel-secret")
    request = Request({"type": "http", "headers": [(b"x-panel-key", b"\xff")]})
    assert panel_key_ok(request) is False


def test_access_token_cannot_outlive_database_session():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(email="expired@example.com", password_hash="unused", referral_code="EXP")
        db.add(user)
        db.flush()
        session = UserSession(user_id=user.id, refresh_token_hash="unused",
                              expires_at=datetime.now(timezone.utc) - timedelta(seconds=1))
        db.add(session)
        db.commit()
        token = create_access_token(user.id, user.role, session.id)
        credentials = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        with pytest.raises(HTTPException) as exc:
            get_current_user(credentials, db)
        assert exc.value.status_code == 401
        session.expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
        db.commit()
        assert get_current_user(credentials, db).id == user.id
