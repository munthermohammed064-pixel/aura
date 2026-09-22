import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, UploadFile
from slowapi import Limiter
from slowapi.util import get_remote_address
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

limiter = Limiter(key_func=get_remote_address)

from app.core.deps import get_current_user
from app.database import get_db
from app.models.finance import CodeRedemption, Deposit, Investment, LedgerEntry, PaymentMethod, TradingCode, Withdrawal
from app.models.user import User
from app.schemas import (
    DepositIn, DepositOut, WalletOut, WithdrawalOut, WithdrawIn,
)
from app.services import ledger
from app.services.cache import get_or_set
from app.services.settings import get_setting

router = APIRouter(tags=["wallet"])

UPLOAD_DIR = Path("uploads")
UPLOAD_DIR.mkdir(exist_ok=True)
ALLOWED_IMG = {"image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp"}
MAX_UPLOAD = 5 * 1024 * 1024


def _sniff_image(data: bytes, mime: str) -> bool:
    """Magic-byte check — a script renamed image/png stays a script."""
    if mime == "image/png":
        return data[:8] == b"\x89PNG\r\n\x1a\n"
    if mime == "image/jpeg":
        return data[:3] == b"\xff\xd8\xff"
    if mime == "image/webp":
        return data[:4] == b"RIFF" and data[8:12] == b"WEBP"
    return False


@router.post("/uploads", status_code=201)
@limiter.limit("10/minute")
async def upload_image(request: Request, file: UploadFile, user: User = Depends(get_current_user)):
    """Upload a proof screenshot (or admin QR image). Returns the public path."""
    if file.content_type not in ALLOWED_IMG:
        raise HTTPException(400, "Only PNG/JPEG/WebP images are allowed")
    # Read capped at limit+1 — a multi-GB body can't exhaust server memory.
    data = await file.read(MAX_UPLOAD + 1)
    if not data or len(data) > MAX_UPLOAD:
        raise HTTPException(400, "File empty or larger than 5MB")
    if not _sniff_image(data, file.content_type):
        raise HTTPException(400, "File content is not a valid image")
    name = f"{uuid.uuid4().hex}{ALLOWED_IMG[file.content_type]}"
    (UPLOAD_DIR / name).write_bytes(data)
    return {"path": f"/uploads/{name}"}


@router.get("/wallet", response_model=WalletOut)
def wallet(user: User = Depends(get_current_user)):
    return user.wallet


@router.get("/wallet/transactions")
def transactions(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(LedgerEntry)
        .filter(LedgerEntry.user_id == user.id)
        .order_by(LedgerEntry.created_at.desc())
        .limit(100)
        .all()
    )
    return rows


@router.get("/payment-methods")
def payment_methods(db: Session = Depends(get_db)):
    def produce():
        rows = db.query(PaymentMethod).filter(PaymentMethod.is_active.is_(True)).all()
        # detach plain dicts so no ORM objects are held in cache
        return [
            {"id": str(m.id), "name": m.name, "details": m.details, "qr_image": m.qr_image,
             "min_amount": float(m.min_amount), "max_amount": float(m.max_amount), "is_active": m.is_active}
            for m in rows
        ]
    return get_or_set("payment-methods:public", 30, produce)


@router.post("/deposits", response_model=DepositOut, status_code=201)
def create_deposit(data: DepositIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    limits = get_setting(db, "deposit")
    if not (limits["min"] <= data.amount <= limits["max"]):
        raise HTTPException(400, f"Amount must be between {limits['min']} and {limits['max']}")
    method = db.query(PaymentMethod).filter(
        PaymentMethod.name == data.method, PaymentMethod.is_active.is_(True)
    ).first()
    if not method:
        raise HTTPException(400, "Invalid payment method")
    dep = Deposit(user_id=user.id, amount=data.amount, method=data.method,
                  proof=data.proof, screenshot=data.screenshot)
    db.add(dep)
    db.flush()
    from app.services.notify import notify_admins, notify_user
    notify_user(db, user.id, "deposit_received", {"amount": data.amount})
    notify_admins(db, "admin_deposit_new",
                  {"amount": data.amount, "serial": user.serial, "email": user.email, "method": data.method})
    db.commit()
    db.refresh(dep)
    return dep


@router.get("/deposits", response_model=list[DepositOut])
def my_deposits(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Deposit).filter(Deposit.user_id == user.id).order_by(Deposit.created_at.desc()).all()


@router.post("/withdrawals", response_model=WithdrawalOut, status_code=201)
@limiter.limit("5/minute")
def create_withdrawal(request: Request, data: WithdrawIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.default_withdraw_address:
        raise HTTPException(400, "Set your withdrawal wallet address in your profile first")
    if data.address != user.default_withdraw_address:
        raise HTTPException(400, "Withdrawals are only allowed to your registered wallet address")
    if datetime.now(timezone.utc).weekday() >= 5:
        raise HTTPException(400, "Withdrawals are not processed on weekends (Saturday–Sunday)")
    cfg = get_setting(db, "withdrawal")
    if not (cfg["min"] <= data.amount <= cfg["max"]):
        raise HTTPException(400, f"Amount must be between {cfg['min']} and {cfg['max']}")
    fee_pct = float(user.withdraw_fee_pct) if user.withdraw_fee_pct is not None else float(cfg.get("fee_pct", 0))
    fee = round(data.amount * fee_pct / 100 + float(cfg.get("fee_flat", 0)), 8)
    # Star system: each missing star cuts 25% off the payout. The hold is still
    # amount + service fee; the admin pays out (amount - star_penalty) and the
    # platform keeps the penalty.
    missing_stars = max(0, 4 - int(user.stars or 0))
    star_penalty = round(data.amount * missing_stars * 0.25, 8)
    total = data.amount + fee
    w = Withdrawal(user_id=user.id, amount=data.amount, fee=fee,
                   star_penalty=star_penalty, address=data.address)
    db.add(w)
    db.flush()
    from app.services.notify import notify_admins, notify_user
    notify_user(db, user.id, "withdrawal_received", {"amount": data.amount})
    notify_admins(db, "admin_withdrawal_new",
                  {"amount": data.amount, "serial": user.serial, "email": user.email, "fee": fee})
    try:
        # hold funds: available -> pending
        ledger.move(db, user_id=user.id, kind="withdrawal", amount=total,
                    from_bucket="available", to_bucket="pending",
                    reference_type="withdrawal", reference_id=w.id,
                    idempotency_key=None, note="Withdrawal request hold")
    except ledger.LedgerError as e:
        raise HTTPException(400, str(e))
    db.commit()
    db.refresh(w)
    return w


@router.get("/withdrawals", response_model=list[WithdrawalOut])
def my_withdrawals(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(Withdrawal).filter(Withdrawal.user_id == user.id).order_by(Withdrawal.created_at.desc()).all()


class CodeIn(BaseModel):
    code: str = Field(min_length=3, max_length=32)


@router.post("/wallet/redeem-code")
@limiter.limit("10/minute")
def redeem_code(request: Request, data: CodeIn, user: User = Depends(get_current_user),
                db: Session = Depends(get_db)):
    """Redeem an admin-published trading code: every active investment collects
    the amount the admin set for its package. Atomic — the redemption row's
    unique constraint wins any double-submit race before money moves."""
    tc = db.query(TradingCode).filter(TradingCode.code == data.code.strip().upper()).first()
    now = datetime.now(timezone.utc)
    exp = tc.expires_at
    if exp and exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if not tc or not tc.is_active or not exp or exp <= now:
        raise HTTPException(400, "Invalid or expired code")

    invs = db.query(Investment).filter(
        Investment.user_id == user.id, Investment.status == "active").all()
    if not invs:
        raise HTTPException(400, "You need an active package to redeem a code")

    amounts = tc.amounts or {}
    try:
        red = CodeRedemption(code_id=tc.id, user_id=user.id, amount=0)
        db.add(red)
        db.flush()  # reserves (code_id, user_id) — a parallel retry dies here
        total = 0.0
        for inv in invs:
            amt = amounts.get(str(inv.package_id))
            if not amt or float(amt) <= 0:
                continue
            amt = float(amt)
            ledger.post(db, user_id=user.id, kind="return", direction="credit",
                        bucket="available", amount=amt, reference_type="trading_code",
                        reference_id=tc.id, idempotency_key=f"code:{tc.id}:{inv.id}",
                        note=f"Trading code {tc.code}")
            inv.realized_return += amt
            total += amt
        if total <= 0:
            raise HTTPException(400, "This code does not apply to your packages")
        red.amount = total
        from app.services.notify import notify_user
        notify_user(db, user.id, "code_redeemed", {"amount": f"${total:.2f}"})
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(400, "Code already redeemed")
    except ledger.LedgerError as e:
        db.rollback()
        raise HTTPException(400, str(e))
    return {"ok": True, "credited": round(total, 2)}
