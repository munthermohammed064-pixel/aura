"""Seed the owner-managed platform defaults, admin account, and packages."""

import os
import secrets

from app.core.security import hash_password
from app.database import Base, SessionLocal, engine
from app.models.finance import Package
from app.models.platform import Setting
from app.models.user import User, Wallet
from app.services.settings import DEFAULTS

ADMIN_ID = os.getenv("ADMIN_ID", "admin")          # console login ID — not an email
ADMIN_EMAIL = os.getenv("ADMIN_EMAIL", "admin@internal.local")  # record only, never used to log in
ADMIN_PASSWORD = os.getenv("ADMIN_PASSWORD", "admin1234")


def run():
    Base.metadata.create_all(engine)
    db = SessionLocal()

    for key, value in DEFAULTS.items():
        if not db.get(Setting, key):
            db.add(Setting(key=key, value=value))

    admin = db.query(User).filter(User.role.in_(("admin", "owner"))).first()
    if not admin:
        admin = User(
            email=ADMIN_EMAIL,
            login_id=ADMIN_ID,
            password_hash=hash_password(ADMIN_PASSWORD),
            full_name="Admin",
            role="owner",
            email_verified=True,
            referral_code=secrets.token_hex(4).upper(),
        )
        db.add(admin)
        db.flush()
        db.add(Wallet(user_id=admin.id))
        print(f"Admin created: ID={ADMIN_ID} / {ADMIN_PASSWORD}")
    else:
        # Keep existing admin in sync with env (idempotent re-seed after changes)
        if ADMIN_ID and admin.login_id != ADMIN_ID:
            admin.login_id = ADMIN_ID
        if os.getenv("ADMIN_PASSWORD"):
            admin.password_hash = hash_password(ADMIN_PASSWORD)

    # Backfill serials for users created before serials existed (admin excluded — LA0001 = first customer)
    missing = db.query(User).filter(User.serial_no.is_(None), User.role != "admin").order_by(User.created_at).all()
    if missing:
        from sqlalchemy import func
        next_serial = (db.query(func.max(User.serial_no)).scalar() or 0) + 1
        for u in missing:
            u.serial_no = next_serial
            next_serial += 1

    if not db.query(Package).count():
        # Tiers: (name, price, daily_profit_min, daily_profit_max).
        # 365-day contracts, returns accruing every day incl. weekends.
        # The from–to range is disclosed only in the privacy policy; the UI
        # shows "> floor". Estimates only — never fixed or guaranteed.
        tiers = [
            ("N0", 15, 0.30, 0.50), ("N1", 30, 0.60, 1.00),
            ("N2", 60, 1.20, 2.00), ("N3", 120, 2.40, 4.00),
            ("N4", 240, 4.80, 8.00), ("N5", 480, 9.60, 16.00),
            ("N6", 960, 22.80, 38.00), ("N7", 1450, 39.00, 57.00),
            ("N8", 2800, 66.00, 110.00),
        ]
        for i, (name, price, dmin, dmax) in enumerate(tiers):
            db.add(Package(
                name=name, description=f"Tier {name} — 365-day structured package",
                min_deposit=price, max_deposit=price,
                return_min_amount=dmin, return_max_amount=dmax,
                duration_days=365, sort_order=i,
            ))

    db.commit()
    print("Seed complete.")


if __name__ == "__main__":
    run()
