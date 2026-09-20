from sqlalchemy.orm import Session

from app.models.platform import Setting

DEFAULTS: dict[str, dict] = {
    "platform": {"name": "Los Angeles", "maintenance_mode": False},
    "deposit": {"min": 10, "max": 100000},
    "withdrawal": {"min": 10, "max": 50000, "fee_pct": 20, "fee_flat": 0},
    "referral": {"levels": 1, "l1_pct": 15, "l2_pct": 0, "l3_pct": 0},
    "wheel": {"enabled": False, "daily_spins": 1, "prizes": []},
    "faq": {
        "items": [
            {"q": "How do deposits work?", "a": "Choose a payment method, send the transfer to the shown QR/address, upload your receipt screenshot, and your balance is credited once an admin verifies it."},
            {"q": "How does the invitation reward work?", "a": "When someone you invited activates a package, 15% of its value is gifted to your wallet automatically — paid by the platform, never deducted from their purchase."},
            {"q": "When can I withdraw?", "a": "Anytime, subject to platform minimums. A service fee applies to each withdrawal."},
            {"q": "How do I contact support?", "a": "Open a ticket from the Support page and our team will reply as soon as possible."},
        ]
    },
    "legal": {
        "terms": "By using this platform you agree to these terms. Deposits are credited after verification. Withdrawals are processed to your registered address and carry a service fee. Invitation rewards are credited automatically when invited users activate packages. The platform may suspend accounts that violate these terms.",
        "privacy": "We collect only the data needed to operate your account: email, name, and transaction records. We never sell your data.\n\nRisk disclosure: No returns are fixed or guaranteed. Displayed percentages are estimates and may rise, fall, or result in loss of capital. Your capital is at risk — you may lose part or all of it.",
    },
}


def get_setting(db: Session, key: str) -> dict:
    row = db.get(Setting, key)
    if row:
        return {**DEFAULTS.get(key, {}), **(row.value or {})}
    return dict(DEFAULTS.get(key, {}))


def set_setting(db: Session, key: str, value: dict) -> Setting:
    row = db.get(Setting, key)
    if not row:
        row = Setting(key=key, value=value)
        db.add(row)
    else:
        row.value = value
    db.flush()
    return row
