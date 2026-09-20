from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import Session

limiter = Limiter(key_func=get_remote_address)

from app.core.deps import get_current_user
from app.database import get_db
from app.models.finance import Investment, Package
from app.models.user import User
from app.schemas import InvestIn, InvestmentOut, PackageOut
from app.services import ledger
from app.services.cache import get_or_set
from app.services.referral import award_commission

router = APIRouter(tags=["packages"])


@router.get("/packages", response_model=list[PackageOut])
def list_packages(db: Session = Depends(get_db)):
    def produce():
        rows = (
            db.query(Package)
            .filter(Package.is_active.is_(True))
            .order_by(Package.sort_order, Package.min_deposit)
            .all()
        )
        return [PackageOut.model_validate(r) for r in rows]
    return get_or_set("packages:public", 30, produce)


@router.post("/invest", response_model=InvestmentOut, status_code=201)
@limiter.limit("10/minute")
def invest(request: Request, data: InvestIn, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not data.acknowledge_risk:
        raise HTTPException(400, "You must accept the terms to continue")
    pkg = db.get(Package, data.package_id)
    if not pkg or not pkg.is_active:
        raise HTTPException(404, "Package not found")
    if not (pkg.min_deposit <= data.amount <= pkg.max_deposit):
        raise HTTPException(400, f"Amount must be between {pkg.min_deposit} and {pkg.max_deposit}")
    inv = Investment(
        user_id=user.id, package_id=pkg.id, amount=data.amount,
        ends_at=datetime.now(timezone.utc) + timedelta(days=pkg.duration_days),
    )
    db.add(inv)
    db.flush()
    try:
        ledger.move(db, user_id=user.id, kind="investment", amount=data.amount,
                    from_bucket="available", to_bucket="invested",
                    reference_type="investment", reference_id=inv.id,
                    note=f"Investment in {pkg.name}")
    except ledger.LedgerError as e:
        raise HTTPException(400, str(e))
    # Referral reward on package activation — paid by the platform,
    # never deducted from the buyer's purchase.
    if user.referred_by_id:
        award_commission(db, referred_user=user, source_type="investment",
                         source_id=inv.id, base_amount=data.amount)
    from app.services.notify import notify_admins, notify_user
    notify_user(db, user.id, "investment_started", {"amount": data.amount, "package": pkg.name})
    notify_admins(db, "admin_investment_new",
                  {"serial": user.serial, "email": user.email, "amount": data.amount, "package": pkg.name})
    db.commit()
    db.refresh(inv)
    return inv


@router.get("/investments")
def my_investments(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(Investment, Package)
        .join(Package, Investment.package_id == Package.id)
        .filter(Investment.user_id == user.id)
        .order_by(Investment.started_at.desc())
        .all()
    )
    return [
        {
            "id": str(i.id), "package_id": str(i.package_id), "package_name": p.name,
            "amount": float(i.amount), "status": i.status,
            "realized_return": float(i.realized_return),
            "started_at": i.started_at, "ends_at": i.ends_at,
            "return_min_amount": float(p.return_min_amount) if p.return_min_amount is not None else None,
            "return_max_amount": float(p.return_max_amount) if p.return_max_amount is not None else None,
        }
        for i, p in rows
    ]
