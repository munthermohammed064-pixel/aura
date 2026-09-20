import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import func
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

limiter = Limiter(key_func=get_remote_address)

from app.core.deps import get_current_user
from app.core.security import (
    create_access_token, create_refresh_token, decode_token,
    hash_password, verify_password,
)
from app.database import get_db
from app.models.user import Session as UserSession
from app.models.user import User, Wallet
from app.services import mailer
from app.schemas import (
    ForgotIn, LoginIn, RefreshIn, RegisterIn, ResetIn, TokenOut, UserOut, VerifyIn,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _issue_tokens(db: Session, user: User, request: Request) -> TokenOut:
    session = UserSession(
        user_id=user.id,
        refresh_token_hash="",
        user_agent=request.headers.get("user-agent", "")[:255],
        ip=request.client.host if request.client else "",
        expires_at=datetime.now(timezone.utc) + timedelta(days=30),
    )
    db.add(session)
    db.flush()
    refresh = create_refresh_token(user.id, session.id)
    session.refresh_token_hash = hash_password(refresh)
    db.commit()
    return TokenOut(access_token=create_access_token(user.id, user.role), refresh_token=refresh)


@router.post("/register", response_model=TokenOut, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
def register(data: RegisterIn, request: Request, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(409, "Email already registered")
    referrer = None
    if data.referral_code:
        ref = data.referral_code.strip().upper()
        referrer = db.query(User).filter(User.referral_code == ref).first()
        if not referrer and ref.startswith("LA") and ref[2:].isdigit():
            referrer = db.query(User).filter(User.serial_no == int(ref[2:])).first()
    from sqlalchemy.exc import IntegrityError
    user = None
    for _ in range(3):  # retry if two registrations race for the same serial
        next_serial = (db.query(func.max(User.serial_no)).scalar() or 0) + 1
        user = User(
            serial_no=next_serial,
            email=data.email,
            password_hash=hash_password(data.password),
            full_name=data.full_name,
            referral_code=secrets.token_hex(4).upper(),
            referred_by_id=referrer.id if referrer else None,
        )
        db.add(user)
        try:
            db.flush()
            break
        except IntegrityError:
            db.rollback()
            user = None
            if db.query(User).filter(User.email == data.email).first():
                raise HTTPException(409, "Email already registered")
    if user is None:
        raise HTTPException(500, "Could not allocate user serial")
    db.add(Wallet(user_id=user.id))
    from app.services.notify import notify_user
    notify_user(db, user.id, "welcome", {"serial": user.serial})
    db.commit()
    return _issue_tokens(db, user, request)


@router.post("/login", response_model=TokenOut)
@limiter.limit("10/minute")
def login(data: LoginIn, request: Request, db: Session = Depends(get_db)):
    ident = data.identifier.strip()
    if "@" in ident:
        user = db.query(User).filter(User.email == ident).first()
        # Admin accounts never authenticate by email — only via their login_id
        # on the hidden console route. Email-guessing an admin gets a plain 401.
        if user and user.role == "admin":
            user = None
    else:
        user = db.query(User).filter(User.login_id == ident).first() if ident else None
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    if user.is_frozen or not user.is_active:
        raise HTTPException(403, "Account disabled")
    return _issue_tokens(db, user, request)


@router.post("/refresh", response_model=TokenOut)
def refresh(data: RefreshIn, request: Request, db: Session = Depends(get_db)):
    try:
        payload = decode_token(data.refresh_token)
        if payload.get("type") != "refresh":
            raise ValueError
        session = db.get(UserSession, uuid.UUID(payload["sid"]))
        user = db.get(User, uuid.UUID(payload["sub"]))
    except Exception:
        raise HTTPException(401, "Invalid refresh token")
    if not session or session.revoked or not user or not user.is_active or user.is_frozen:
        raise HTTPException(401, "Session revoked")
    if not verify_password(data.refresh_token, session.refresh_token_hash):
        raise HTTPException(401, "Invalid refresh token")
    # Session-theft guard: a stolen refresh token is useless from a different
    # browser fingerprint. Admin sessions additionally bind to the login IP.
    ua = request.headers.get("user-agent", "")[:255]
    ip = request.client.host if request.client else ""
    if (session.user_agent and ua and session.user_agent != ua) or \
       (user.role == "admin" and session.ip and ip and session.ip != ip):
        session.revoked = True
        db.commit()
        raise HTTPException(401, "Session revoked")
    session.revoked = True  # rotation
    return _issue_tokens(db, user, request)


@router.post("/logout")
def logout(data: RefreshIn, db: Session = Depends(get_db)):
    try:
        payload = decode_token(data.refresh_token)
        session = db.get(UserSession, uuid.UUID(payload["sid"]))
        if session:
            session.revoked = True
            db.commit()
    except Exception:
        pass
    return {"ok": True}


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)):
    return user


@router.post("/forgot")
@limiter.limit("5/minute")
def forgot_password(data: ForgotIn, request: Request, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    # Always return ok — don't leak whether the email exists
    if not user:
        return {"ok": True}
    token = secrets.token_urlsafe(32)
    user.reset_token_hash = hash_password(token)
    user.reset_expires_at = datetime.now(timezone.utc) + timedelta(hours=1)
    db.commit()
    sent = mailer.send_reset(user.email, token)
    # Dev convenience: echo token only when SMTP is not configured
    return {"ok": True, "dev_token": None if sent else token}


@router.post("/reset")
def reset_password(data: ResetIn, db: Session = Depends(get_db)):
    candidates = db.query(User).filter(
        User.reset_token_hash.isnot(None),
        User.reset_expires_at > datetime.now(timezone.utc),
    ).all()
    user = next((u for u in candidates if verify_password(data.token, u.reset_token_hash)), None)
    if not user:
        raise HTTPException(400, "Invalid or expired reset token")
    user.password_hash = hash_password(data.new_password)
    user.reset_token_hash = None
    user.reset_expires_at = None
    db.commit()
    return {"ok": True}


@router.post("/send-verification")
@limiter.limit("5/minute")
def send_verification(request: Request, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    code = f"{secrets.randbelow(1000000):06d}"
    user.verify_token_hash = hash_password(code)
    db.commit()
    sent = mailer.send_verification(user.email, code)
    return {"ok": True, "dev_token": None if sent else code}


@router.post("/verify-email")
def verify_email(data: VerifyIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.verify_token_hash or not verify_password(data.token, user.verify_token_hash):
        raise HTTPException(400, "Invalid verification token")
    user.email_verified = True
    user.verify_token_hash = None
    db.commit()
    return {"ok": True}
