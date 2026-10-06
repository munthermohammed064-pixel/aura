"""Auto-settlement of matured investments.

On maturity (ends_at <= now) the principal moves invested -> available
automatically. Realized returns are credited separately by ops/admin —
never auto-fabricated. An investment marked completed before that move
still receives its principal once maturity arrives; the move is recorded
once, so a later tick cannot pay it again.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.finance import Investment, LedgerEntry
from app.models.platform import Notification
from app.services import ledger

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
