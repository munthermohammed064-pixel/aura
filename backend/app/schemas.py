import uuid
from datetime import datetime, timezone

from pydantic import BaseModel, EmailStr, Field, field_validator, model_serializer


def ser_dt(d: datetime | None) -> str | None:
    """Serialize a DB datetime as explicit-UTC ISO. Without the offset suffix,
    browsers parse the string as *local* time and every timestamp the API
    returns lands shifted by the viewer's timezone (codes looked like they
    died hours early in Baghdad while the console claimed otherwise)."""
    if d is None:
        return None
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.isoformat()


class NxBase(BaseModel):
    """Every response schema inherits this — naive datetimes coming out of
    SQLite get their UTC marker so client-side Date parsing is exact."""

    @model_serializer(mode="wrap")
    def _serialize(self, nxt):
        def fix(v):
            if isinstance(v, datetime):
                return ser_dt(v)
            if isinstance(v, dict):
                return {k: fix(x) for k, x in v.items()}
            if isinstance(v, list):
                return [fix(x) for x in v]
            return v
        d = nxt(self)
        return {k: fix(v) for k, v in d.items()} if isinstance(d, dict) else d


# ---- Auth ----
class RegisterIn(NxBase):
    email: EmailStr
    password: str = Field(min_length=12, max_length=72)  # bcrypt truncates at 72 bytes
    full_name: str = ""
    referral_code: str | None = None


class LoginIn(NxBase):
    identifier: str = Field(min_length=1)  # user email OR admin login_id
    password: str


class TokenOut(NxBase):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    verification_sent: bool = False


class RefreshIn(NxBase):
    refresh_token: str


class ForgotIn(NxBase):
    email: EmailStr


class ResetIn(NxBase):
    token: str
    new_password: str = Field(min_length=12, max_length=72)


class VerifyIn(NxBase):
    token: str


# ---- Users ----
class UserOut(NxBase):
    id: uuid.UUID
    email: str
    serial: str
    full_name: str
    role: str
    referral_code: str
    email_verified: bool
    default_withdraw_address: str | None
    withdraw_qr_image: str | None = None
    withdraw_fee_pct: float | None = None
    stars: int = 4
    created_at: datetime

    model_config = {"from_attributes": True}


class WalletOut(NxBase):
    available: float
    pending: float
    invested: float

    model_config = {"from_attributes": True}


# ---- Packages / Investments ----
class PackageIn(NxBase):
    name: str
    description: str = ""
    min_deposit: float = Field(gt=0)
    max_deposit: float = Field(gt=0)
    yield_min_pct: float = 0
    yield_max_pct: float = 0
    return_min_amount: float | None = None
    return_max_amount: float | None = None
    duration_days: int = Field(gt=0)
    is_active: bool = True
    sort_order: int = 0
    # {"lang": {"name": "…", "description": "…"}} — optional per-language copy
    i18n: dict[str, dict[str, str]] | None = None


class PackageOut(PackageIn):
    id: uuid.UUID
    model_config = {"from_attributes": True}


class InvestIn(NxBase):
    package_id: uuid.UUID
    amount: float = Field(gt=0)
    acknowledge_risk: bool  # must be True — "I understand returns are not guaranteed"


class InvestmentOut(NxBase):
    id: uuid.UUID
    package_id: uuid.UUID
    amount: float
    status: str
    realized_return: float
    started_at: datetime
    ends_at: datetime
    model_config = {"from_attributes": True}


# ---- Deposits / Withdrawals ----
def _upload_path(v: str | None) -> str | None:
    """User-supplied image fields must reference our own uploads dir — an
    external URL would load attacker content inside the admin console."""
    if v and not v.startswith("/uploads/"):
        raise ValueError("Invalid image path")
    return v


class DepositIn(NxBase):
    amount: float = Field(gt=0)
    method: str
    proof: str = ""
    screenshot: str = Field(min_length=1)  # uploaded image path — mandatory

    _v_shot = field_validator("screenshot")(_upload_path)


class DepositOut(NxBase):
    id: uuid.UUID
    amount: float
    method: str
    screenshot: str
    status: str
    created_at: datetime
    model_config = {"from_attributes": True}


class WithdrawIn(NxBase):
    amount: float = Field(gt=0)
    address: str = Field(min_length=4)


class WithdrawalOut(NxBase):
    id: uuid.UUID
    amount: float
    fee: float
    star_penalty: float = 0
    address: str
    status: str
    txid: str
    created_at: datetime
    model_config = {"from_attributes": True}


# ---- Support / Notifications ----
class TicketIn(NxBase):
    subject: str
    body: str


class ReplyIn(NxBase):
    body: str


# ---- Admin ----
class SettingIn(NxBase):
    value: dict


class AdminActionIn(NxBase):
    note: str = ""


class WithdrawalProcessIn(NxBase):
    action: str  # approve | reject | paid
    txid: str = ""
    note: str = ""


class SettleIn(NxBase):
    return_amount: float = Field(ge=0)  # realized return credited to the user (may be 0)


class BalanceAdjustIn(NxBase):
    amount: float
    bucket: str = "available"
    note: str


class PaymentMethodIn(NxBase):
    name: str
    details: str = ""
    qr_image: str = ""

    _v_qr = field_validator("qr_image")(_upload_path)
    min_amount: float = 0
    max_amount: float = 0
    is_active: bool = True
    # {"lang": {"name": "…", "details": "…"}} — optional per-language copy
    i18n: dict[str, dict[str, str]] | None = None
