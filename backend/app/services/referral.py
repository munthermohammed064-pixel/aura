"""Invitation rewards — paid on actual activity (package activations),
never a promised profit. Levels and percentages come from admin settings;
default config is single-level with a fixed percentage."""

import uuid

from sqlalchemy.orm import Session

from app.models.finance import ReferralCommission
from app.models.user import User
from app.services import ledger
from app.services.notify import notify_user
from app.services.settings import get_setting


def award_commission(
    db: Session,
    *,
    referred_user: User,
    source_type: str,
    source_id: uuid.UUID,
    base_amount: float,
) -> list[ReferralCommission]:
    cfg = get_setting(db, "referral")
    levels = int(cfg.get("levels", 1))
    pcts = [float(cfg.get(f"l{i}_pct", 0)) for i in range(1, levels + 1)]

    commissions: list[ReferralCommission] = []
    current = referred_user
    for level, pct in enumerate(pcts, start=1):
        if pct <= 0 or not current.referred_by_id:
            break
        referrer = db.get(User, current.referred_by_id)
        if not referrer or not referrer.is_active:
            break
        amount = round(base_amount * pct / 100, 8)
        if amount <= 0:
            break
        entry = ledger.post(
            db, user_id=referrer.id, kind="commission", direction="credit",
            bucket="available", amount=amount,
            reference_type=source_type, reference_id=source_id,
            idempotency_key=f"commission:{source_type}:{source_id}:l{level}",
            note=f"Invitation reward L{level} ({pct}%) on {source_type}",
        )
        commissions.append(ReferralCommission(
            referrer_id=referrer.id, referred_id=referred_user.id,
            source_type=source_type, source_id=source_id,
            level=level, pct=pct, amount=amount,
        ))
        db.add(commissions[-1])
        notify_user(db, referrer.id, "invitation_reward",
                    {"amount": float(amount), "pct": pct, "from": referred_user.serial or referred_user.email})
        current = referrer
    return commissions
