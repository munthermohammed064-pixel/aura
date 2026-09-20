"""Auto-settlement of matured investments.

On maturity (ends_at <= now) the principal moves invested -> available
automatically. Realized returns are credited separately by ops/admin —
never auto-fabricated.
"""

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.finance import Investment
from app.models.platform import Notification
from app.services import ledger


def settle_matured(db: Session) -> int:
    matured = (
        db.query(Investment)
        .filter(Investment.status == "active", Investment.ends_at <= datetime.now(timezone.utc))
        .all()
    )
    count = 0
    for inv in matured:
        try:
            ledger.move(
                db, user_id=inv.user_id, kind="investment", amount=float(inv.amount),
                from_bucket="invested", to_bucket="available",
                reference_type="investment", reference_id=inv.id,
                note="Investment matured — principal returned",
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
