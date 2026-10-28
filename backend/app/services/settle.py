"""Auto-settlement of matured investments.

On maturity (ends_at <= now) the principal moves invested -> available
automatically. Realized returns are credited separately by ops/admin —
never auto-fabricated. An investment marked completed before that move
still receives its principal once maturity arrives; the move is recorded
once, so a later tick cannot pay it again.
"""

from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.finance import Investment, LedgerEntry, Withdrawal
from app.models.platform import Notification
from app.services import ledger
from app.models.user import User
from app.services.business_time import working_cutoff, utc
from app.services.withdrawals import ALERT_AFTER, OPEN_STATUSES, timing

_PRINCIPAL_NOTE = "Investment matured — principal returned"


def principal_returned(db: Session, inv: Investment) -> bool:
    """True once the maturity move has been posted, including rows written
    before the idempotency keys existed."""
    if db.query(LedgerEntry.id).filter(
        LedgerEntry.idempotency_key == f"principal-in:{inv.id}"
    ).first():
        return True
    return db.query(LedgerEntry.id).filter(
        LedgerEntry.reference_id == inv.id,
        LedgerEntry.direction == "credit",
        LedgerEntry.bucket == "available",
        LedgerEntry.note == _PRINCIPAL_NOTE,
    ).first() is not None


def settle_matured(db: Session) -> int:
    now = datetime.now(timezone.utc)
    due = (
        db.query(Investment)
        .filter(
            Investment.status.in_(("active", "completed")),
            Investment.ends_at <= now,
        )
        .all()
    )
    count = 0
    for inv in due:
        if principal_returned(db, inv):
            if inv.status != "completed":
                inv.status = "completed"
                count += 1
            continue
        try:
            # Separate keys: move() would reuse one key on both legs and the
            # second insert would collide.
            ledger.post(
                db, user_id=inv.user_id, kind="investment", direction="debit",
                bucket="invested", amount=float(inv.amount),
                reference_type="investment", reference_id=inv.id,
                idempotency_key=f"principal-out:{inv.id}",
                note=_PRINCIPAL_NOTE,
            )
            ledger.post(
                db, user_id=inv.user_id, kind="investment", direction="credit",
                bucket="available", amount=float(inv.amount),
                reference_type="investment", reference_id=inv.id,
                idempotency_key=f"principal-in:{inv.id}",
                note=_PRINCIPAL_NOTE,
            )
        except ledger.LedgerError:
            continue  # inconsistent state — skip, admin reviews manually
        inv.status = "completed"
        db.add(Notification(
            user_id=inv.user_id, kind="info",
            title="Investment matured",
            body=f"Your principal of ${float(inv.amount):.2f} has been returned to your wallet.",
        ))
        count += 1
    if count:
        db.commit()
    return count


def remind_pending_withdrawals(db: Session, now: datetime | None = None) -> None:
    """One alert per staff member/request at 48h, then one escalation at 72h.

    Delivery pauses on weekends; the deadline clock also pauses. After downtime, only the current stage is sent.
    A unique key makes retries and concurrent workers safe.
    """
    now = utc(now or datetime.now(timezone.utc))
    if now.weekday() >= 5:
        return
    admins = db.query(User).filter(
        User.role.in_(("admin", "owner")), User.is_active.is_(True), User.is_frozen.is_(False),
    ).all()
    if not admins:
        return
    requests = db.query(Withdrawal, User).outerjoin(User, Withdrawal.user_id == User.id).filter(
        Withdrawal.status.in_(OPEN_STATUSES), Withdrawal.created_at <= working_cutoff(now, ALERT_AFTER),
    ).all()
    for w, user in requests:
        info = timing(w, now)
        event = f"admin_withdrawal_{info['urgency']}"
        for admin in admins:
            key = f"{event}:{w.id}:{admin.id}"
            if db.query(Notification.id).filter(Notification.dedup_key == key).first():
                continue
            try:
                with db.begin_nested():
                    db.add(Notification(
                        user_id=admin.id, kind=event, dedup_key=key,
                        params={
                            "withdrawal_id": str(w.id), "user_id": str(w.user_id),
                            "serial": user.serial if user else "",
                            "name": (user.full_name or user.email) if user else "",
                            "amount": f"{float(w.amount) - float(w.fee or 0) - float(w.star_penalty or 0):.2f}",
                            "due_at": info["due_at"],
                        },
                        created_at=now,
                    ))
                    db.flush()
            except IntegrityError:
                pass  # Another worker delivered this same stage first.
    db.commit()
