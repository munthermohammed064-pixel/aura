"""Seed: admin account, placeholder packages, payment methods, default settings.
All placeholder data is safe to delete — nothing is hardcoded in the frontend."""

import os
import secrets

from app.core.security import hash_password
from app.database import Base, SessionLocal, engine
from app.models.finance import Package, PaymentMethod
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

    admin = db.query(User).filter(User.role == "admin").first()
    if not admin:
        admin = User(
            email=ADMIN_EMAIL,
            login_id=ADMIN_ID,
            password_hash=hash_password(ADMIN_PASSWORD),
            full_name="Admin",
            role="admin",
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
        # Tiers: (name, price, estimated_return_max). Displayed range = 80%–100% of max.
        # All figures are estimates shown "from–to" — never fixed or guaranteed.
        tiers = [
            ("N0", 15, 0.5), ("N1", 30, 1), ("N2", 60, 2), ("N3", 120, 4),
            ("N4", 240, 8), ("N5", 480, 17), ("N6", 960, 38), ("N7", 1450, 57),
            ("N8", 2800, 110),
        ]
        for i, (name, price, ret_max) in enumerate(tiers):
            db.add(Package(
                name=name, description=f"Tier {name} — 30-day structured package",
                min_deposit=price, max_deposit=price,
                return_min_amount=round(ret_max * 0.8, 2),
                return_max_amount=ret_max,
                duration_days=30, sort_order=i,
            ))

    if not db.query(PaymentMethod).count():
        db.add(PaymentMethod(name="USDT (TRC20)", details="Wallet address set via admin panel",
                             min_amount=10, max_amount=100000))

    db.commit()
    print("Seed complete.")


if __name__ == "__main__":
    run()
