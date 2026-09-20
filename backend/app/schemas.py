import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


# ---- Auth ----
class RegisterIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    full_name: str = ""
    referral_code: str | None = None


class LoginIn(BaseModel):
    identifier: str = Field(min_length=1)  # user email OR admin login_id
    password: str


class TokenOut(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshIn(BaseModel):
    refresh_token: str


class ForgotIn(BaseModel):
    email: EmailStr


class ResetIn(BaseModel):
    token: str
    new_password: str = Field(min_length=8)


class VerifyIn(BaseModel):
    token: str


# ---- Users ----
class UserOut(BaseModel):
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


class WalletOut(BaseModel):
    available: float
    pending: float
    invested: float

    model_config = {"from_attributes": True}


# ---- Packages / Investments ----
class PackageIn(BaseModel):
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


class PackageOut(PackageIn):
    id: uuid.UUID
    model_config = {"from_attributes": True}


class InvestIn(BaseModel):
    package_id: uuid.UUID
    amount: float = Field(gt=0)
    acknowledge_risk: bool  # must be True — "I understand returns are not guaranteed"


class InvestmentOut(BaseModel):
    id: uuid.UUID
    package_id: uuid.UUID
    amount: float
    status: str
    realized_return: float
    started_at: datetime
    ends_at: datetime
    model_config = {"from_attributes": True}


# ---- Deposits / Withdrawals ----
class DepositIn(BaseModel):
    amount: float = Field(gt=0)
    method: str
    proof: str = ""
    screenshot: str = Field(min_length=1)  # uploaded image path — mandatory


class DepositOut(BaseModel):
    id: uuid.UUID
    amount: float
    method: str
    screenshot: str
    status: str
    created_at: datetime
    model_config = {"from_attributes": True}


class WithdrawIn(BaseModel):
    amount: float = Field(gt=0)
    address: str = Field(min_length=4)


class WithdrawalOut(BaseModel):
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
class TicketIn(BaseModel):
    subject: str
    body: str


class ReplyIn(BaseModel):
    body: str


# ---- Admin ----
class SettingIn(BaseModel):
    value: dict


class AdminActionIn(BaseModel):
    note: str = ""


class WithdrawalProcessIn(BaseModel):
    action: str  # approve | reject | paid
    txid: str = ""
    note: str = ""


class SettleIn(BaseModel):
    return_amount: float = Field(ge=0)  # realized return credited to the user (may be 0)


class BalanceAdjustIn(BaseModel):
    amount: float
    bucket: str = "available"
    note: str


class PaymentMethodIn(BaseModel):
    name: str
    details: str = ""
    qr_image: str = ""
    min_amount: float = 0
    max_amount: float = 0
    is_active: bool = True
