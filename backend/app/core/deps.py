import uuid

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.security import decode_token
from app.database import get_db
from app.models.user import Session as UserSession
from app.models.user import User

bearer = HTTPBearer()


def get_current_user(
    creds: HTTPAuthorizationCredentials = Depends(bearer),
    db: Session = Depends(get_db),
) -> User:
    try:
        payload = decode_token(creds.credentials)
        if payload.get("type") != "access":
            raise ValueError
        user_id = uuid.UUID(payload["sub"])
        session_id = uuid.UUID(payload["sid"])
    except Exception:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token")
    # Access tokens are bound to their server-side session: logout, password
    # change, admin freeze or stolen-token revocation kills the token instantly
    # instead of letting it live out its expiry window.
    sess = db.get(UserSession, session_id)
    if not sess or sess.revoked or sess.user_id != user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session revoked")
    user = db.get(User, user_id)
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User inactive or not found")
    if user.is_frozen:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Account frozen")
    return user


STAFF_ROLES = ("admin", "owner")


def get_admin(user: User = Depends(get_current_user)) -> User:
    """Day-to-day operations access: deposits, withdrawals, users, packages."""
    if user.role not in STAFF_ROLES:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin access required")
    return user


def get_owner(user: User = Depends(get_current_user)) -> User:
    """Company-control access: payment methods, settings, audit, staff."""
    if user.role != "owner":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Owner access required")
    return user
