import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.deps import get_current_user
from app.core.security import hash_password, verify_password
from app.database import get_db
from app.models.user import Session as UserSession
from app.models.user import User

router = APIRouter(prefix="/profile", tags=["profile"])


class PasswordChange(BaseModel):
    current: str
    new: str = Field(min_length=8)


class ProfileUpdate(BaseModel):
    full_name: str | None = None


class WithdrawAddressIn(BaseModel):
    address: str = Field(min_length=8, max_length=255)
    qr_image: str | None = Field(None, max_length=500)


@router.put("")
def update_profile(data: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.full_name is not None:
        user.full_name = data.full_name
    db.commit()
    return {"ok": True}


@router.post("/withdraw-address")
def set_withdraw_address(data: WithdrawAddressIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """One-time withdrawal address + wallet barcode setup. Locks permanently —
    afterwards only an admin can change it."""
    if user.default_withdraw_address:
        raise HTTPException(400, "Withdrawal address is locked. Contact support to change it.")
    user.default_withdraw_address = data.address
    if data.qr_image:
        user.withdraw_qr_image = data.qr_image
    db.commit()
    return {"ok": True}


@router.post("/password")
def change_password(data: PasswordChange, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current, user.password_hash):
        raise HTTPException(400, "Current password incorrect")
    user.password_hash = hash_password(data.new)
    db.commit()
    return {"ok": True}


@router.get("/sessions")
def sessions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(UserSession).filter(
        UserSession.user_id == user.id, UserSession.revoked.is_(False)
    ).order_by(UserSession.created_at.desc()).all()


@router.delete("/sessions/{session_id}")
def revoke_session(session_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        s = db.get(UserSession, uuid.UUID(session_id))
    except ValueError:
        s = None
    if s and s.user_id == user.id:
        s.revoked = True
        db.commit()
    return {"ok": True}
