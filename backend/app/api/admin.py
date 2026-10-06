"""Admin API — full operational control: packages, deposits, withdrawals,
users (freeze/adjust/fee/withdraw-address), methods, settings, tickets,
investments, audit log. Every action is audited; users are notified."""

import re
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

from app.core.deps import STAFF_ROLES, get_admin, get_owner
from app.database import get_db
from app.models.finance import (
    CodeRedemption, Deposit, Investment, LedgerEntry, Package, PaymentMethod,
    ReferralCommission, TradingCode, Withdrawal,
)
from app.models.platform import (
    AuditLog, AddressRequest, Notification, Raffle, RaffleEntry, Setting,
    Ticket, TicketReply, WheelSpin,
)
from app.models.user import Session as UserSession
from app.models.user import User, Wallet
from app.schemas import (
    BalanceAdjustIn, PackageIn, PaymentMethodIn, SettleIn, SettingIn,
    WithdrawalProcessIn, ser_dt, ser_model,
)
from app.services import ledger, mailer
from app.services.cache import bust
from app.services.notify import notify_user
from app.services.settings import get_setting, set_setting

router = APIRouter(prefix="/admin", tags=["admin"])


def audit(db: Session, admin: User, action: str, target_type: str = "",
          target_id: object = "", details: dict | None = None) -> None:
    db.add(AuditLog(admin_id=admin.id, action=action, target_type=target_type,
                    target_id=str(target_id), details=details or {}))


def _tag(u: User | None) -> dict:
    return {"user_email": u.email if u else None, "user_serial": u.serial if u else None}


def _net_payout(w: Withdrawal) -> float:
    """Amount sent to the user's withdrawal address. The service fee was
    already removed from their wallet and is not paid to the admin."""
    return float(w.amount) - float(w.fee or 0) - float(w.star_penalty or 0)


def _refund_withdrawal_cuts(db: Session, w: Withdrawal) -> None:
    """Give back a service fee or star penalty that was debited at request
    time. Older requests have no such rows."""
    for key, note in (
        (f"withdrawal-fee:{w.id}", "Withdrawal rejected — service fee returned"),
        (f"withdrawal-star:{w.id}", "Withdrawal rejected — star penalty returned"),
    ):
        row = db.query(LedgerEntry).filter(LedgerEntry.idempotency_key == key).first()
        if not row:
            continue
        ledger.post_idempotent(
            db, idempotency_key=f"{key}:refund", user_id=w.user_id, kind="fee",
            direction="credit", bucket="available", amount=float(row.amount),
            reference_type="withdrawal", reference_id=w.id, note=note,
        )


def _held_amount(db: Session, w: Withdrawal) -> float:
    """Funds sitting in pending for this request. New requests lock the
    payout only. Older ones locked the full amount, or amount + fee."""
    row = (
        db.query(LedgerEntry)
        .filter(
            LedgerEntry.reference_type == "withdrawal",
            LedgerEntry.reference_id == w.id,
            LedgerEntry.bucket == "pending",
            LedgerEntry.direction == "credit",
            LedgerEntry.note == "Withdrawal request hold",
        )
        .first()
    )
    return float(row.amount) if row else float(w.amount)


def _mail_and_notify(db: Session, user_id, event: str, params: dict | None = None,
                     mail_subject: str = "", mail_body: str = "") -> None:
    notify_user(db, user_id, event, params)
    u = db.get(User, user_id)
    if u:
        mailer.send(u.email, mail_subject or event, mail_body)


# ---------- Stats ----------
@router.get("/stats")
@limiter.limit("30/minute")
def stats(request: Request, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    return {
        "users": db.query(func.count(User.id)).filter(User.role == "user").scalar() or 0,
        "deposits_pending": db.query(func.count(Deposit.id)).filter(Deposit.status == "pending").scalar() or 0,
        "deposits_approved_total": float(db.query(func.coalesce(func.sum(Deposit.amount), 0))
                                         .filter(Deposit.status == "approved").scalar() or 0),
        "withdrawals_pending": db.query(func.count(Withdrawal.id)).filter(Withdrawal.status == "pending").scalar() or 0,
        "withdrawals_actionable": db.query(func.count(Withdrawal.id))
            .filter(Withdrawal.status.in_(["pending", "approved"])).scalar() or 0,
        "tickets_open": db.query(func.count(Ticket.id)).filter(Ticket.status != "closed").scalar() or 0,
        "address_requests_pending": db.query(func.count(AddressRequest.id))
            .filter(AddressRequest.status == "pending").scalar() or 0,
        "investments_active": db.query(func.count(Investment.id)).filter(Investment.status == "active").scalar() or 0,
        "commissions_total": float(db.query(func.coalesce(func.sum(ReferralCommission.amount), 0)).scalar() or 0),
    }


# ---------- Packages ----------
@router.get("/packages")
@limiter.limit("30/minute")
def list_packages(request: Request, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    return [ser_model(p) for p in db.query(Package).order_by(Package.sort_order, Package.min_deposit).all()]


def _check_package_ranges(data: PackageIn):
    # An inverted range bricks the package silently: no invest can pass
    # min<=amount<=max and no code can pass the return bounds.
    if data.min_deposit > data.max_deposit:
        raise HTTPException(400, "Minimum deposit cannot exceed maximum deposit")
    if (data.return_min_amount is not None and data.return_max_amount is not None
            and data.return_min_amount > data.return_max_amount):
        raise HTTPException(400, "Minimum return cannot exceed maximum return")


@router.post("/packages", status_code=201)
@limiter.limit("10/minute")
def create_package(request: Request, data: PackageIn, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    _check_package_ranges(data)
    p = Package(**data.model_dump())
    db.add(p)
    db.flush()
    audit(db, admin, "package.create", "package", p.id, {"name": p.name})
    db.commit()
    db.refresh(p)
    bust("packages:")
    return p


@router.put("/packages/{pkg_id}")
@limiter.limit("10/minute")
def update_package(request: Request, pkg_id: str, data: PackageIn, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    p = db.get(Package, uuid.UUID(pkg_id))
    if not p:
        raise HTTPException(404, "Package not found")
    _check_package_ranges(data)
    for k, v in data.model_dump(exclude={"i18n"}).items():
        setattr(p, k, v)
    # i18n is merged, not replaced — a PUT without it must not wipe translations
    if data.i18n is not None:
        p.i18n = {**(p.i18n or {}), **data.i18n}
    audit(db, admin, "package.update", "package", p.id, {"name": p.name})
    db.commit()
    db.refresh(p)
    bust("packages:")
    return p


@router.delete("/packages/{pkg_id}")
@limiter.limit("10/minute")
def delete_package(request: Request, pkg_id: str, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    p = db.get(Package, uuid.UUID(pkg_id))
    if not p:
        raise HTTPException(404, "Package not found")
    # Deleting a package users invested in orphans those rows (names and
    # ranges disappear from every list). Deactivation exists for that.
    if db.query(Investment.id).filter(Investment.package_id == p.id).first():
        raise HTTPException(409, "Package has investments — deactivate it instead of deleting")
    # …and a live code carrying this package would redeem to "doesn't apply"
    # for every holder — close it first instead of surprising users.
    now = datetime.now(timezone.utc)
    for tc in db.query(TradingCode).filter(TradingCode.is_active.is_(True)).all():
        exp = tc.expires_at
        if exp and exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if str(p.id) in (tc.amounts or {}) and exp and exp > now:
            raise HTTPException(409, "A live trading code uses this package — close the code or deactivate the package")
    audit(db, admin, "package.delete", "package", p.id, {"name": p.name})
    db.delete(p)
    db.commit()
    bust("packages:")
    return {"ok": True}


# ---------- Deposits ----------
@router.get("/deposits")
@limiter.limit("30/minute")
def list_deposits(request: Request, status: str | None = None, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    q = db.query(Deposit, User).outerjoin(User, Deposit.user_id == User.id)
    if status:
        q = q.filter(Deposit.status == status)
    rows = q.order_by(Deposit.created_at.desc()).limit(200).all()
    return [
        {"id": str(d.id), "amount": float(d.amount), "method": d.method, "proof": d.proof,
         "screenshot": d.screenshot, "status": d.status, "admin_note": d.admin_note,
         "created_at": ser_dt(d.created_at),
         **_tag(u)}
        for d, u in rows
    ]


@router.post("/deposits/{dep_id}/approve")
@limiter.limit("20/minute")
def approve_deposit(request: Request, dep_id: str, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    d = db.get(Deposit, uuid.UUID(dep_id))
    if not d:
        raise HTTPException(404, "Deposit not found")
    if d.status != "pending":
        raise HTTPException(400, f"Deposit already {d.status}")
    try:
        ledger.post_idempotent(
            db, idempotency_key=f"deposit:{d.id}", user_id=d.user_id, kind="deposit",
            direction="credit", bucket="available", amount=float(d.amount),
            reference_type="deposit", reference_id=d.id,
            note=f"Deposit approved ({d.method})")
    except ledger.LedgerError as e:
        raise HTTPException(400, str(e))
    d.status = "approved"
    d.processed_at = datetime.now(timezone.utc)
    _mail_and_notify(db, d.user_id, "deposit_approved", {"amount": float(d.amount)},
                     "Deposit approved",
                     f"Your deposit of ${float(d.amount):,.2f} has been approved and credited to your wallet.")
    audit(db, admin, "deposit.approve", "deposit", d.id, {"amount": float(d.amount)})
    db.commit()
    return {"ok": True}


@router.post("/deposits/{dep_id}/reject")
@limiter.limit("20/minute")
def reject_deposit(request: Request, dep_id: str, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    d = db.get(Deposit, uuid.UUID(dep_id))
    if not d:
        raise HTTPException(404, "Deposit not found")
    if d.status != "pending":
        raise HTTPException(400, f"Deposit already {d.status}")
    d.status = "rejected"
    d.processed_at = datetime.now(timezone.utc)
    _mail_and_notify(db, d.user_id, "deposit_rejected", {"amount": float(d.amount)},
                     "Deposit rejected",
                     f"Your deposit of ${float(d.amount):,.2f} was rejected. Contact support for details.")
    audit(db, admin, "deposit.reject", "deposit", d.id, {"amount": float(d.amount)})
    db.commit()
    return {"ok": True}


# ---------- Withdrawals ----------
@router.get("/withdrawals")
@limiter.limit("30/minute")
def list_withdrawals(request: Request, status: str | None = None, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    q = db.query(Withdrawal, User).outerjoin(User, Withdrawal.user_id == User.id)
    if status:
        q = q.filter(Withdrawal.status == status)
    rows = q.order_by(Withdrawal.created_at.desc()).limit(200).all()
    return [
        {"id": str(w.id), "amount": float(w.amount), "fee": float(w.fee),
         "star_penalty": float(w.star_penalty or 0),
         "net_payout": _net_payout(w),
         "address": w.address,
         "status": w.status, "txid": w.txid, "admin_note": w.admin_note,
         "created_at": ser_dt(w.created_at),
         **_tag(u)}
        for w, u in rows
    ]


@router.post("/withdrawals/{w_id}/process")
@limiter.limit("20/minute")
def process_withdrawal(request: Request, w_id: str, data: WithdrawalProcessIn,
                       admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    w = db.get(Withdrawal, uuid.UUID(w_id))
    if not w:
        raise HTTPException(404, "Withdrawal not found")
    total = _held_amount(db, w)
    net = _net_payout(w)

    if data.action == "approve":
        if w.status != "pending":
            raise HTTPException(400, f"Withdrawal already {w.status}")
        w.status = "approved"
        notify_user(db, w.user_id, "withdrawal_approved", {"amount": float(w.amount)})
    elif data.action == "paid":
        if w.status not in ("pending", "approved"):
            raise HTTPException(400, f"Withdrawal already {w.status}")
        try:
            ledger.post_idempotent(
                db, idempotency_key=f"withdrawal-paid:{w.id}", user_id=w.user_id, kind="withdrawal",
                direction="debit", bucket="pending", amount=total,
                reference_type="withdrawal", reference_id=w.id,
                note="Withdrawal paid out")
            # Requests made before the fee was its own debit locked amount+fee.
            # Give the stacked extra back so the fee is taken once.
            fee_taken = db.query(LedgerEntry).filter(
                LedgerEntry.idempotency_key == f"withdrawal-fee:{w.id}").first()
            star_taken = db.query(LedgerEntry).filter(
                LedgerEntry.idempotency_key == f"withdrawal-star:{w.id}").first()
            extra = round(total - float(w.amount), 8)
            if fee_taken is None and star_taken is None and extra > 1e-6:
                ledger.post_idempotent(
                    db, idempotency_key=f"withdrawal-unstuck:{w.id}", user_id=w.user_id,
                    kind="withdrawal", direction="credit", bucket="available", amount=extra,
                    reference_type="withdrawal", reference_id=w.id,
                    note="Withdrawal paid — stacked fee returned")
        except ledger.LedgerError as e:
            raise HTTPException(400, str(e))
        w.status = "paid"
        w.txid = data.txid
        _mail_and_notify(db, w.user_id, "withdrawal_paid", {"amount": net},
                         "Withdrawal paid",
                         f"Your withdrawal of ${net:,.2f} has been sent to your wallet address.")
    elif data.action == "reject":
        if w.status not in ("pending", "approved"):
            raise HTTPException(400, f"Withdrawal already {w.status}")
        try:
            ledger.post_idempotent(
                db, idempotency_key=f"withdrawal-refund:{w.id}", user_id=w.user_id, kind="withdrawal",
                direction="credit", bucket="available", amount=total,
                reference_type="withdrawal", reference_id=w.id,
                note="Withdrawal rejected — funds released")
            ledger.post_idempotent(
                db, idempotency_key=f"withdrawal-release:{w.id}", user_id=w.user_id, kind="withdrawal",
                direction="debit", bucket="pending", amount=total,
                reference_type="withdrawal", reference_id=w.id,
                note="Withdrawal rejected — hold released")
            _refund_withdrawal_cuts(db, w)
        except ledger.LedgerError as e:
            raise HTTPException(400, str(e))
        w.status = "rejected"
        w.admin_note = data.note
        _mail_and_notify(db, w.user_id, "withdrawal_rejected", {"amount": float(w.amount)},
                         "Withdrawal rejected",
                         f"Your withdrawal of ${float(w.amount):,.2f} was rejected. Funds were returned to your wallet.")
    else:
        raise HTTPException(400, "Invalid action")

    w.processed_at = datetime.now(timezone.utc)
    audit(db, admin, f"withdrawal.{data.action}", "withdrawal", w.id,
          {"amount": float(w.amount), "txid": data.txid, "note": data.note})
    db.commit()
    return {"ok": True}


# ---------- Users ----------
@router.get("/users")
@limiter.limit("30/minute")
def list_users(request: Request, q: str | None = None, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    from sqlalchemy.orm import joinedload
    query = db.query(User).options(joinedload(User.wallet)).filter(User.role == "user")
    if q:
        like = f"%{q}%"
        cond = (User.email.ilike(like)) | (User.full_name.ilike(like))
        digits = re.sub(r"\D", "", q)  # "LA0012" / "12" → serial_no 12
        if digits:
            cond = cond | (User.serial_no == int(digits))
        query = query.filter(cond)
    rows = query.order_by(User.serial_no).limit(300).all()
    return [
        {"id": str(u.id), "email": u.email, "serial": u.serial, "full_name": u.full_name,
         "role": u.role, "is_frozen": u.is_frozen, "is_active": u.is_active,
         "email_verified": u.email_verified, "stars": int(u.stars or 0),
         "default_withdraw_address": u.default_withdraw_address,
         "withdraw_qr_image": u.withdraw_qr_image,
         "withdraw_fee_pct": float(u.withdraw_fee_pct) if u.withdraw_fee_pct is not None else None,
         "wallet": {"available": float(u.wallet.available), "pending": float(u.wallet.pending),
                    "invested": float(u.wallet.invested)} if u.wallet else None}
        for u in rows
    ]


@router.get("/users/{user_id}/detail")
@limiter.limit("30/minute")
def user_detail(request: Request, user_id: str, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    """Everything about one user in a single call — powers the admin drill-down panel."""
    u = db.get(User, uuid.UUID(user_id))
    if not u:
        raise HTTPException(404, "User not found")

    deps = (db.query(Deposit).filter(Deposit.user_id == u.id)
            .order_by(Deposit.created_at.desc()).limit(25).all())
    wds = (db.query(Withdrawal).filter(Withdrawal.user_id == u.id)
           .order_by(Withdrawal.created_at.desc()).limit(25).all())
    invs = (db.query(Investment, Package.name)
            .outerjoin(Package, Investment.package_id == Package.id)
            .filter(Investment.user_id == u.id)
            .order_by(Investment.started_at.desc()).limit(25).all())
    ledger_rows = (db.query(LedgerEntry).filter(LedgerEntry.user_id == u.id)
                   .order_by(LedgerEntry.created_at.desc()).limit(40).all())
    referred_count = db.query(func.count(User.id)).filter(User.referred_by_id == u.id).scalar() or 0
    inviter = db.get(User, u.referred_by_id) if u.referred_by_id else None

    return {
        "user": {
            "id": str(u.id), "email": u.email, "full_name": u.full_name, "serial": u.serial,
            "role": u.role, "is_frozen": u.is_frozen, "is_active": u.is_active,
            "email_verified": u.email_verified, "stars": int(u.stars or 0),
            "default_withdraw_address": u.default_withdraw_address,
            "withdraw_qr_image": u.withdraw_qr_image,
            "withdraw_fee_pct": float(u.withdraw_fee_pct) if u.withdraw_fee_pct is not None else None,
            "created_at": ser_dt(u.created_at),
        },
        "inviter": _tag(inviter),
        "referred_count": referred_count,
        "wallet": {"available": float(u.wallet.available), "pending": float(u.wallet.pending),
                   "invested": float(u.wallet.invested)} if u.wallet else None,
        "deposits": [
            {"id": str(d.id), "amount": float(d.amount), "method": d.method, "proof": d.proof,
             "screenshot": d.screenshot, "status": d.status,
             "created_at": ser_dt(d.created_at)}
            for d in deps],
        "withdrawals": [
            {"id": str(w.id), "amount": float(w.amount), "fee": float(w.fee),
             "star_penalty": float(w.star_penalty or 0),
             "net_payout": _net_payout(w),
             "address": w.address, "status": w.status, "txid": w.txid,
             "created_at": ser_dt(w.created_at)}
            for w in wds],
        "investments": [
            {"id": str(i.id), "amount": float(i.amount), "status": i.status,
             "realized_return": float(i.realized_return), "package_name": pname,
             "ends_at": ser_dt(i.ends_at)}
            for i, pname in invs],
        "ledger": [
            {"id": str(e.id), "kind": e.kind, "direction": e.direction, "bucket": e.bucket,
             "amount": float(e.amount), "note": e.note,
             "created_at": ser_dt(e.created_at)}
            for e in ledger_rows],
    }


@router.post("/users/{user_id}/freeze")
@limiter.limit("10/minute")
def freeze_user(request: Request, user_id: str, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    u = db.get(User, uuid.UUID(user_id))
    if not u:
        raise HTTPException(404, "User not found")
    if u.role in STAFF_ROLES:
        # Freezing staff kills their session mid-request — a misclick here
        # locks the whole console. Staff are managed via /operators only.
        raise HTTPException(403, "Staff accounts cannot be frozen")
    u.is_frozen = not u.is_frozen
    audit(db, admin, "user.freeze" if u.is_frozen else "user.unfreeze", "user", u.id, {"email": u.email})
    db.commit()
    return {"ok": True, "is_frozen": u.is_frozen}


@router.post("/users/{user_id}/adjust")
@limiter.limit("10/minute")
def adjust_balance(request: Request, user_id: str, data: BalanceAdjustIn,
                   admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    u = db.get(User, uuid.UUID(user_id))
    if not u:
        raise HTTPException(404, "User not found")
    try:
        ledger.post(
            db, user_id=u.id, kind="adjustment",
            direction="credit" if data.amount >= 0 else "debit",
            bucket=data.bucket, amount=abs(data.amount),
            reference_type="admin", reference_id=admin.id,
            idempotency_key=None, note=f"Admin adjustment: {data.note}")
    except ledger.LedgerError as e:
        raise HTTPException(400, str(e))
    audit(db, admin, "user.adjust", "user", u.id,
          {"amount": data.amount, "bucket": data.bucket, "note": data.note})
    notify_user(db, u.id, "balance_adjusted", {"amount": data.amount, "note": data.note})
    db.commit()
    return {"ok": True}


@router.post("/users/{user_id}/zero")
@limiter.limit("5/minute")
def zero_user(request: Request, user_id: str, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    """Reset an account to zero — for test/junk accounts. Every wallet bucket
    is debited to 0 through the ledger (auditable), open investments are
    cancelled, and pending or approved withdrawals are closed in place.
    Approved holds already sit in the pending bucket, which this reset
    zeroes, so leaving them approved made Pay and Reject fail afterwards.
    Nothing is credited back."""
    u = db.get(User, uuid.UUID(user_id))
    if not u or u.role != "user":
        raise HTTPException(404, "User not found")
    w = u.wallet
    if not w:
        raise HTTPException(404, "Wallet not found")
    try:
        for bucket in ("available", "pending", "invested"):
            bal = float(getattr(w, bucket))
            if bal > 0:
                ledger.post(db, user_id=u.id, kind="adjustment", direction="debit",
                            bucket=bucket, amount=bal, reference_type="admin",
                            reference_id=admin.id, note="Admin account reset (zero)")
    except ledger.LedgerError as e:
        raise HTTPException(400, str(e))
    n_inv = db.query(Investment).filter(
        Investment.user_id == u.id, Investment.status == "active"
    ).update({"status": "cancelled"}, synchronize_session=False)
    n_dep = db.query(Deposit).filter(
        Deposit.user_id == u.id, Deposit.status == "pending"
    ).update({"status": "rejected"}, synchronize_session=False)
    n_wd = db.query(Withdrawal).filter(
        Withdrawal.user_id == u.id, Withdrawal.status.in_(("pending", "approved"))
    ).update({"status": "rejected"}, synchronize_session=False)
    audit(db, admin, "user.zero", "user", u.id,
          {"email": u.email, "cancelled_investments": n_inv,
           "rejected_deposits": n_dep, "rejected_withdrawals": n_wd})
    notify_user(db, u.id, "account_zeroed")
    db.commit()
    return {"ok": True}


class FeeIn(BaseModel):
    fee_pct: float | None = Field(None, ge=0, le=100)  # null → global setting


@router.post("/users/{user_id}/fee")
@limiter.limit("10/minute")
def set_user_fee(request: Request, user_id: str, data: FeeIn, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    """Per-user withdrawal fee override — admin controls each user's service fee %."""
    u = db.get(User, uuid.UUID(user_id))
    if not u:
        raise HTTPException(404, "User not found")
    u.withdraw_fee_pct = data.fee_pct
    audit(db, admin, "user.fee", "user", u.id, {"fee_pct": data.fee_pct, "email": u.email})
    db.commit()
    return {"ok": True, "fee_pct": data.fee_pct}


class StarsIn(BaseModel):
    stars: int = Field(ge=0, le=4)
    reason: str = ""


@router.post("/users/{user_id}/stars")
@limiter.limit("10/minute")
def set_user_stars(request: Request, user_id: str, data: StarsIn, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    """Star discipline system: 4 stars full, each deducted star cuts 25% off
    the user's withdrawal payouts. Admin deducts for terms violations."""
    u = db.get(User, uuid.UUID(user_id))
    if not u:
        raise HTTPException(404, "User not found")
    old = int(u.stars or 0)
    u.stars = data.stars
    audit(db, admin, "user.stars", "user", u.id,
          {"old": old, "new": data.stars, "reason": data.reason, "email": u.email})
    if data.stars < old:
        notify_user(db, u.id, "star_deducted", {"stars": data.stars, "old": old, "reason": data.reason})
    elif data.stars > old:
        notify_user(db, u.id, "star_restored", {"stars": data.stars, "old": old})
    db.commit()
    return {"ok": True, "stars": data.stars}


class AdminWithdrawAddressIn(BaseModel):
    address: str = Field(min_length=8, max_length=255)


@router.post("/users/{user_id}/withdraw-address")
@limiter.limit("10/minute")
def admin_set_withdraw_address(request: Request, user_id: str, data: AdminWithdrawAddressIn,
                               admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    """Only an admin can change a user's locked withdrawal address."""
    u = db.get(User, uuid.UUID(user_id))
    if not u:
        raise HTTPException(404, "User not found")
    old = u.default_withdraw_address
    u.default_withdraw_address = data.address
    audit(db, admin, "user.withdraw_address", "user", u.id,
          {"old": old, "new": data.address, "email": u.email})
    notify_user(db, u.id, "address_updated")
    db.commit()
    return {"ok": True}


@router.delete("/users/{user_id}")
@limiter.limit("5/minute")
def delete_user(request: Request, user_id: str, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    """Permanently remove a user and every row they own. Financial history
    goes with them — the audit log keeps the who/what. Staff and self are
    refused; staff are managed through /operators."""
    u = db.get(User, uuid.UUID(user_id))
    if not u or u.role != "user":
        raise HTTPException(404, "User not found")

    # Uploaded files to unlink once the transaction commits — failure to
    # delete a file must not abort the account deletion.
    files = [d.screenshot for d in db.query(Deposit).filter(Deposit.user_id == u.id)]
    files += [r.qr_image for r in db.query(AddressRequest).filter(AddressRequest.user_id == u.id)]
    files.append(u.withdraw_qr_image)

    ticket_ids = [t.id for t in db.query(Ticket.id).filter(Ticket.user_id == u.id)]
    db.query(TicketReply).filter(TicketReply.author_id == u.id).delete(synchronize_session=False)
    if ticket_ids:
        db.query(TicketReply).filter(TicketReply.ticket_id.in_(ticket_ids)).delete(synchronize_session=False)
    db.query(Ticket).filter(Ticket.user_id == u.id).delete(synchronize_session=False)
    for model in (Notification, UserSession, LedgerEntry, Investment, Deposit,
                  Withdrawal, AddressRequest, CodeRedemption, RaffleEntry, WheelSpin):
        db.query(model).filter(model.user_id == u.id).delete(synchronize_session=False)
    db.query(ReferralCommission).filter(
        (ReferralCommission.referrer_id == u.id) | (ReferralCommission.referred_id == u.id)
    ).delete(synchronize_session=False)
    db.query(Wallet).filter(Wallet.user_id == u.id).delete(synchronize_session=False)
    # Back-references that must outlive the user.
    db.query(User).filter(User.referred_by_id == u.id).update(
        {"referred_by_id": None}, synchronize_session=False)
    db.query(TradingCode).filter(TradingCode.created_by == u.id).update(
        {"created_by": None}, synchronize_session=False)
    db.query(Raffle).filter(Raffle.winner_id == u.id).update(
        {"winner_id": None}, synchronize_session=False)

    audit(db, admin, "user.delete", "user", u.id,
          {"email": u.email, "serial": u.serial})
    db.delete(u)
    db.commit()

    for f in files:
        if f and f.startswith("/uploads/"):
            try:
                (Path("uploads") / f.rsplit("/", 1)[-1]).unlink(missing_ok=True)
            except OSError:
                pass
    return {"ok": True}


# ---------- Address change requests ($5 fee on approval) ----------
@router.get("/address-requests")
@limiter.limit("30/minute")
def list_address_requests(request: Request, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    rows = (db.query(AddressRequest)
            .order_by(AddressRequest.created_at.desc()).limit(100).all())
    users = {u.id: u for u in db.query(User).filter(
        User.id.in_([r.user_id for r in rows])).all()} if rows else {}
    return [{
        "id": str(r.id), "new_address": r.new_address, "qr_image": r.qr_image,
        "status": r.status, "fee": float(r.fee),
        "created_at": ser_dt(r.created_at),
        "user_email": users[r.user_id].email if r.user_id in users else "",
        "user_serial": users[r.user_id].serial if r.user_id in users else "",
        "current_address": users[r.user_id].default_withdraw_address if r.user_id in users else "",
    } for r in rows]


@router.post("/address-requests/{r_id}/approve")
@limiter.limit("20/minute")
def approve_address_request(request: Request, r_id: str, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    """Apply the new address and charge the flat change fee from the user's
    available balance through the ledger."""
    req = db.get(AddressRequest, uuid.UUID(r_id))
    if not req or req.status != "pending":
        raise HTTPException(404, "Request not found")
    u = db.get(User, req.user_id)
    if not u:
        raise HTTPException(404, "User not found")
    try:
        ledger.post(db, user_id=u.id, kind="fee", direction="debit", bucket="available",
                    amount=float(req.fee), reference_type="address_request",
                    reference_id=req.id, idempotency_key=f"addrreq:{req.id}",
                    note="Withdrawal address change fee")
    except ledger.LedgerError as e:
        raise HTTPException(400, str(e))
    old = u.default_withdraw_address
    u.default_withdraw_address = req.new_address
    if req.qr_image:
        u.withdraw_qr_image = req.qr_image
    req.status = "approved"
    req.reviewed_at = datetime.now(timezone.utc)
    audit(db, admin, "address_request.approve", "address_request", req.id,
          {"old": old, "new": req.new_address, "fee": float(req.fee), "email": u.email})
    notify_user(db, u.id, "address_change_approved", {"amount": float(req.fee)})
    db.commit()
    return {"ok": True}


@router.post("/address-requests/{r_id}/reject")
@limiter.limit("20/minute")
def reject_address_request(request: Request, r_id: str, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    req = db.get(AddressRequest, uuid.UUID(r_id))
    if not req or req.status != "pending":
        raise HTTPException(404, "Request not found")
    req.status = "rejected"
    req.reviewed_at = datetime.now(timezone.utc)
    audit(db, admin, "address_request.reject", "address_request", req.id,
          {"address": req.new_address})
    notify_user(db, req.user_id, "address_change_rejected")
    db.commit()
    return {"ok": True}


# ---------- Payment methods ----------
@router.get("/payment-methods")
@limiter.limit("30/minute")
def list_methods(request: Request, owner: User = Depends(get_owner), db: Session = Depends(get_db)):
    return db.query(PaymentMethod).order_by(PaymentMethod.name).all()


@router.post("/payment-methods", status_code=201)
@limiter.limit("10/minute")
def create_method(request: Request, data: PaymentMethodIn, owner: User = Depends(get_owner), db: Session = Depends(get_db)):
    m = PaymentMethod(**data.model_dump())
    db.add(m)
    db.flush()
    audit(db, owner, "method.create", "payment_method", m.id, {"name": m.name})
    db.commit()
    db.refresh(m)
    bust("payment-methods")
    return m


@router.put("/payment-methods/{m_id}")
@limiter.limit("10/minute")
def update_method(request: Request, m_id: str, data: PaymentMethodIn, owner: User = Depends(get_owner), db: Session = Depends(get_db)):
    m = db.get(PaymentMethod, uuid.UUID(m_id))
    if not m:
        raise HTTPException(404, "Method not found")
    for k, v in data.model_dump(exclude={"i18n"}).items():
        setattr(m, k, v)
    # merge — a PUT without i18n must not wipe stored translations
    if data.i18n is not None:
        m.i18n = {**(m.i18n or {}), **data.i18n}
    audit(db, owner, "method.update", "payment_method", m.id, {"name": m.name})
    db.commit()
    bust("payment-methods")
    return m


@router.delete("/payment-methods/{m_id}")
@limiter.limit("10/minute")
def delete_method(request: Request, m_id: str, owner: User = Depends(get_owner), db: Session = Depends(get_db)):
    m = db.get(PaymentMethod, uuid.UUID(m_id))
    if not m:
        raise HTTPException(404, "Method not found")
    audit(db, owner, "method.delete", "payment_method", m.id, {"name": m.name})
    db.delete(m)
    db.commit()
    bust("payment-methods")
    return {"ok": True}


# ---------- Settings ----------
@router.get("/settings")
@limiter.limit("30/minute")
def all_settings(request: Request, owner: User = Depends(get_owner), db: Session = Depends(get_db)):
    from app.services.settings import DEFAULTS
    keys = set(DEFAULTS) | set(db.scalars(db.query(Setting.key)).all())
    return {k: get_setting(db, k) for k in sorted(keys)}


@router.put("/settings/{key}")
@limiter.limit("10/minute")
def update_setting(request: Request, key: str, data: SettingIn, owner: User = Depends(get_owner), db: Session = Depends(get_db)):
    v = data.value or {}
    # A min>max limits pair would block every deposit/withdrawal — refuse.
    if isinstance(v.get("min"), (int, float)) and isinstance(v.get("max"), (int, float)):
        if v["min"] > v["max"] or v["min"] < 0:
            raise HTTPException(400, "Invalid limits: min must be 0 or more and cannot exceed max")
    set_setting(db, key, data.value)
    audit(db, owner, "settings.update", "setting", key, data.value)
    db.commit()
    bust("config:"); bust("legal:"); bust("faq:")
    return {"ok": True}


# ---------- Investments ----------
@router.get("/investments")
@limiter.limit("30/minute")
def list_investments(request: Request, status: str | None = None, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    q = (db.query(Investment, User, Package)
         .outerjoin(User, Investment.user_id == User.id)
         .outerjoin(Package, Investment.package_id == Package.id))
    if status:
        q = q.filter(Investment.status == status)
    rows = q.order_by(Investment.started_at.desc()).limit(300).all()
    ids = [str(i.id) for i, _, _ in rows]
    settled: set[str] = set()
    if ids:
        settled = {
            row[0] for row in db.query(AuditLog.target_id).filter(
                AuditLog.action == "investment.settle",
                AuditLog.target_type == "investment",
                AuditLog.target_id.in_(ids),
            ).all()
        }
    return [
        {"id": str(i.id), "amount": float(i.amount), "status": i.status,
         "realized_return": float(i.realized_return),
         "return_settled": str(i.id) in settled,
         "started_at": ser_dt(i.started_at),
         "ends_at": ser_dt(i.ends_at),
         "package_name": p.name if p else "",
         **_tag(u)}
        for i, u, p in rows
    ]


@router.post("/investments/{inv_id}/settle")
@limiter.limit("20/minute")
def settle_investment(request: Request, inv_id: str, data: SettleIn, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    """Credit the realized return once. Principal stays invested until maturity;
    closing the row here used to skip that return of capital."""
    inv = db.get(Investment, uuid.UUID(inv_id))
    if not inv:
        raise HTTPException(404, "Investment not found")
    if inv.status not in ("active", "completed"):
        raise HTTPException(400, "Investment is not open")
    already = db.query(AuditLog.id).filter(
        AuditLog.action == "investment.settle",
        AuditLog.target_type == "investment",
        AuditLog.target_id == str(inv.id),
    ).first()
    if already:
        raise HTTPException(400, "Return already recorded")
    credited = data.return_amount
    if data.return_amount > 0:
        try:
            entry = ledger.post_idempotent(
                db, idempotency_key=f"return:{inv.id}", user_id=inv.user_id, kind="return",
                direction="credit", bucket="available", amount=data.return_amount,
                reference_type="investment", reference_id=inv.id,
                note="Realized return credited")
        except ledger.LedgerError as e:
            raise HTTPException(400, str(e))
        # The key posts once. A repeat that won the race keeps the amount
        # that actually landed in the wallet.
        if entry is not None:
            credited = float(entry.amount)
    inv.realized_return = credited
    _mail_and_notify(db, inv.user_id, "investment_settled", {"amount": credited},
                     "Investment settled",
                     f"Your investment realized a return of ${credited:,.2f}, credited to your wallet.")
    audit(db, admin, "investment.settle", "investment", inv.id, {"return_amount": credited})
    db.commit()
    return {"ok": True}


# ---------- Tickets ----------
@router.get("/tickets")
@limiter.limit("30/minute")
def list_tickets(request: Request, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    rows = (db.query(Ticket, User).outerjoin(User, Ticket.user_id == User.id)
            .order_by(Ticket.created_at.desc()).limit(200).all())
    return [
        {"id": str(t.id), "subject": t.subject, "status": t.status,
         "created_at": ser_dt(t.created_at),
         **_tag(u)}
        for t, u in rows
    ]


@router.post("/tickets/{ticket_id}/close")
@limiter.limit("20/minute")
def close_ticket(request: Request, ticket_id: str, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    t = db.get(Ticket, uuid.UUID(ticket_id))
    if not t:
        raise HTTPException(404, "Ticket not found")
    t.status = "closed"
    audit(db, admin, "ticket.close", "ticket", t.id)
    notify_user(db, t.user_id, "ticket_closed", {"subject": t.subject})
    db.commit()
    return {"ok": True}


# ---------- Audit ----------
@router.get("/audit")
@limiter.limit("30/minute")
def audit_log(request: Request, owner: User = Depends(get_owner), db: Session = Depends(get_db)):
    rows = db.query(AuditLog).order_by(AuditLog.created_at.desc()).limit(300).all()
    return [{"id": str(a.id), "action": a.action, "target_type": a.target_type,
             "target_id": a.target_id, "details": a.details,
             "created_at": ser_dt(a.created_at)} for a in rows]


# ---------- Operators (owner-only staff management) ----------
class OperatorIn(BaseModel):
    login_id: str = Field(min_length=4, max_length=64)
    password: str = Field(min_length=12, max_length=72)
    full_name: str = ""


def _op_out(u: User) -> dict:
    return {"id": str(u.id), "login_id": u.login_id, "full_name": u.full_name,
            "role": u.role, "is_active": u.is_active,
            "created_at": ser_dt(u.created_at)}


@router.get("/operators")
@limiter.limit("30/minute")
def list_operators(request: Request, owner: User = Depends(get_owner), db: Session = Depends(get_db)):
    rows = db.query(User).filter(User.role.in_(("admin", "owner"))).order_by(User.created_at).all()
    return [_op_out(u) for u in rows]


@router.post("/operators", status_code=201)
@limiter.limit("10/minute")
def create_operator(request: Request, data: OperatorIn, owner: User = Depends(get_owner), db: Session = Depends(get_db)):
    import secrets as _secrets
    from app.core.security import hash_password
    if db.query(User).filter(User.login_id == data.login_id).first():
        raise HTTPException(400, "Login ID already in use")
    op = User(login_id=data.login_id,
              email=f"{data.login_id}@ops.internal",  # operators never log in by email
              full_name=data.full_name, referral_code=_secrets.token_hex(8),
              password_hash=hash_password(data.password), role="admin",
              is_active=True, email_verified=True)
    db.add(op)
    db.flush()
    audit(db, owner, "operator.create", "user", op.id, {"login_id": op.login_id})
    db.commit()
    return _op_out(op)


@router.post("/operators/{op_id}/toggle")
@limiter.limit("10/minute")
def toggle_operator(request: Request, op_id: str, owner: User = Depends(get_owner), db: Session = Depends(get_db)):
    op = db.get(User, uuid.UUID(op_id))
    if not op or op.role not in ("admin", "owner"):
        raise HTTPException(404, "Operator not found")
    if op.id == owner.id:
        raise HTTPException(400, "Cannot deactivate your own account")
    if op.role == "owner":
        raise HTTPException(403, "Owner accounts cannot be modified")
    op.is_active = not op.is_active
    if not op.is_active:
        # Kill every live session so deactivation is instant.
        db.query(UserSession).filter(UserSession.user_id == op.id).update({"revoked": True})
    audit(db, owner, "operator.toggle", "user", op.id, {"is_active": op.is_active})
    db.commit()
    return _op_out(op)


# ---------- Trading codes (daily return distribution) ----------
_CODE_RE = re.compile(r"^[A-Z0-9-]{3,32}$")


class CodeCreateIn(BaseModel):
    code: str = Field("", max_length=32)          # blank → auto-generate NX-XXXXXX
    ttl_hours: int = Field(24, ge=1, le=72)       # validity in HOURS: 1h → 3 days (admins think in hours)
    amounts: dict[str, float] = {}                # {package_id: amount} — each inside the package's closed range


@router.post("/codes", status_code=201)
def create_code(data: CodeCreateIn, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    amounts = {str(k): round(float(v), 8) for k, v in (data.amounts or {}).items() if v and float(v) > 0}
    if not amounts:
        raise HTTPException(400, "Set an amount for at least one package")
    pkgs = {str(p.id): p for p in db.query(Package).all()}
    for pid, amt in amounts.items():
        p = pkgs.get(pid)
        if not p:
            raise HTTPException(400, f"Unknown package {pid}")
        lo = float(p.return_min_amount) if p.return_min_amount is not None else None
        hi = float(p.return_max_amount) if p.return_max_amount is not None else None
        if lo is not None and amt < lo or hi is not None and amt > hi:
            rng = f"${lo:g}–${hi:g}" if lo is not None and hi is not None else (f"≤ ${hi:g}" if hi is not None else f"≥ ${lo:g}")
            raise HTTPException(400, f"{p.name}: amount must stay inside its range ({rng})")

    code = data.code.strip().upper() or f"NX-{secrets.token_hex(3).upper()}"
    if not _CODE_RE.match(code):
        raise HTTPException(400, "Code must be 3–32 chars: A–Z, 0–9, dash")
    if db.query(TradingCode).filter(TradingCode.code == code).first():
        raise HTTPException(400, "Code already exists")

    tc = TradingCode(code=code, amounts=amounts,
                     expires_at=datetime.now(timezone.utc) + timedelta(hours=data.ttl_hours),
                     created_by=admin.id)
    db.add(tc)
    audit(db, admin, "code.create", "trading_code", code, {"amounts": amounts, "ttl_hours": data.ttl_hours})
    db.commit()
    return _code_out(db, tc)


def _code_out(db: Session, tc: TradingCode) -> dict:
    used, paid = db.query(func.count(CodeRedemption.id),
                          func.coalesce(func.sum(CodeRedemption.amount), 0)).filter(
                          CodeRedemption.code_id == tc.id).first()
    return {"id": str(tc.id), "code": tc.code, "amounts": tc.amounts,
            "expires_at": ser_dt(tc.expires_at),
            "is_active": tc.is_active, "created_at": ser_dt(tc.created_at),
            "redemptions": int(used), "total_paid": float(paid)}


@router.get("/codes")
def list_codes(admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    rows = db.query(TradingCode).order_by(TradingCode.created_at.desc()).limit(30).all()
    return [_code_out(db, tc) for tc in rows]


@router.post("/codes/{code_id}/close")
def close_code(code_id: str, admin: User = Depends(get_admin), db: Session = Depends(get_db)):
    tc = db.get(TradingCode, uuid.UUID(code_id))
    if not tc:
        raise HTTPException(404, "Code not found")
    tc.is_active = False
    audit(db, admin, "code.close", "trading_code", tc.code)
    db.commit()
    return {"ok": True}
