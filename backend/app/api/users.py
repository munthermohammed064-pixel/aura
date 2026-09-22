import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.orm import Session

from app.core.deps import bearer, get_current_user
from app.core.security import decode_token, hash_password, verify_password
from app.database import get_db
from app.models.platform import AddressRequest
from app.models.user import Session as UserSession
from app.models.user import User
from app.services.notify import notify_admins

from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter(prefix="/profile", tags=["profile"])
limiter = Limiter(key_func=get_remote_address)


class PasswordChange(BaseModel):
    current: str
    new: str = Field(min_length=12, max_length=72)


class ProfileUpdate(BaseModel):
    full_name: str | None = None


class WithdrawAddressIn(BaseModel):
    address: str = Field(min_length=8, max_length=255)
    qr_image: str | None = Field(None, max_length=500)

    @field_validator("qr_image")
    @classmethod
    def _own_uploads_only(cls, v: str | None) -> str | None:
        if v and not v.startswith("/uploads/"):
            raise ValueError("Invalid image path")
        return v


@router.put("")
def update_profile(data: ProfileUpdate, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if data.full_name is not None:
        user.full_name = data.full_name
    db.commit()
    return {"ok": True}


@router.post("/withdraw-address")
@limiter.limit("10/minute")
def set_withdraw_address(request: Request, data: WithdrawAddressIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """One-time withdrawal address + wallet barcode setup. Locks permanently —
    afterwards only an admin can change it."""
    if user.default_withdraw_address:
        raise HTTPException(400, "Withdrawal address is locked. Contact support to change it.")
    user.default_withdraw_address = data.address
    if data.qr_image:
        user.withdraw_qr_image = data.qr_image
    db.commit()
    return {"ok": True}


ADDRESS_CHANGE_FEE = 5.0


@router.post("/withdraw-address/request", status_code=201)
@limiter.limit("10/minute")
def request_address_change(request: Request, data: WithdrawAddressIn, user: User = Depends(get_current_user),
                           db: Session = Depends(get_db)):
    """Request a withdrawal-address change. The flat fee is charged from the
    user's available balance only when an admin approves."""
    if not user.default_withdraw_address:
        raise HTTPException(400, "Set your address first — the first setup is free")
    if data.address == user.default_withdraw_address:
        raise HTTPException(400, "New address must differ from the current one")
    pending = db.query(AddressRequest).filter(
        AddressRequest.user_id == user.id,
        AddressRequest.status == "pending").first()
    if pending:
        raise HTTPException(400, "A change request is already pending review")
    req = AddressRequest(user_id=user.id, new_address=data.address,
                         qr_image=data.qr_image or "", fee=ADDRESS_CHANGE_FEE)
    db.add(req)
    notify_admins(db, "admin_address_request", {"serial": user.serial})
    db.commit()
    return {"ok": True, "fee": ADDRESS_CHANGE_FEE}


@router.get("/withdraw-address/request")
def my_address_request(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    req = (db.query(AddressRequest)
           .filter(AddressRequest.user_id == user.id, AddressRequest.status == "pending")
           .order_by(AddressRequest.created_at.desc()).first())
    if not req:
        return None
    return {"id": str(req.id), "new_address": req.new_address,
            "fee": float(req.fee), "created_at": req.created_at.isoformat() if req.created_at else None}


@router.post("/password")
@limiter.limit("10/minute")
def change_password(request: Request, data: PasswordChange, creds: HTTPAuthorizationCredentials = Depends(bearer),
                    user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not verify_password(data.current, user.password_hash):
        raise HTTPException(400, "Current password incorrect")
    user.password_hash = hash_password(data.new)
    # Revoke every OTHER session — a password change means the user suspects
    # compromise (or just rotated); stolen sessions must die instantly.
    try:
        keep_sid = uuid.UUID(decode_token(creds.credentials).get("sid", ""))
    except Exception:
        keep_sid = None
    db.query(UserSession).filter(
        UserSession.user_id == user.id, UserSession.id != keep_sid
    ).update({"revoked": True})
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
