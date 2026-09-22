import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base
from app.models.user import utcnow


class LedgerEntry(Base):
    """Immutable double-entry ledger. Balance is derived — never updated directly."""

    __tablename__ = "ledger_entries"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(32), index=True)  # deposit|withdrawal|investment|return|commission|adjustment|fee
    direction: Mapped[str] = mapped_column(String(8))  # credit | debit
    bucket: Mapped[str] = mapped_column(String(16))  # available | pending | invested
    amount: Mapped[float] = mapped_column(Numeric(20, 8))
    reference_type: Mapped[str | None] = mapped_column(String(32), nullable=True)
    reference_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(128), unique=True, nullable=True)
    note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Package(Base):
    __tablename__ = "packages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="")
    min_deposit: Mapped[float] = mapped_column(Numeric(20, 8))
    max_deposit: Mapped[float] = mapped_column(Numeric(20, 8))
    yield_min_pct: Mapped[float] = mapped_column(Numeric(8, 4), default=0)   # estimated range only — never guaranteed
    yield_max_pct: Mapped[float] = mapped_column(Numeric(8, 4), default=0)
    # Estimated return range as absolute amount (e.g. $0.30 – $0.50). Estimates only — never guaranteed.
    return_min_amount: Mapped[float | None] = mapped_column(Numeric(20, 8), nullable=True)
    return_max_amount: Mapped[float | None] = mapped_column(Numeric(20, 8), nullable=True)
    duration_days: Mapped[int] = mapped_column()
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Investment(Base):
    __tablename__ = "investments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    package_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("packages.id"))
    amount: Mapped[float] = mapped_column(Numeric(20, 8))
    status: Mapped[str] = mapped_column(String(20), default="active")  # active | completed | cancelled
    realized_return: Mapped[float] = mapped_column(Numeric(20, 8), default=0)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Deposit(Base):
    __tablename__ = "deposits"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    amount: Mapped[float] = mapped_column(Numeric(20, 8))
    method: Mapped[str] = mapped_column(String(64))
    proof: Mapped[str] = mapped_column(Text, default="")  # txid / receipt ref
    screenshot: Mapped[str] = mapped_column(String(500), default="")  # uploaded proof image path — required
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | approved | rejected
    admin_note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class Withdrawal(Base):
    __tablename__ = "withdrawals"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    amount: Mapped[float] = mapped_column(Numeric(20, 8))
    fee: Mapped[float] = mapped_column(Numeric(20, 8), default=0)
    star_penalty: Mapped[float] = mapped_column(Numeric(20, 8), default=0)  # deduction from missing stars (25% each)
    address: Mapped[str] = mapped_column(String(255))
    status: Mapped[str] = mapped_column(String(20), default="pending")  # pending | approved | rejected | paid
    txid: Mapped[str] = mapped_column(String(255), default="")
    admin_note: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ReferralCommission(Base):
    __tablename__ = "referral_commissions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    referrer_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    referred_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"))
    source_type: Mapped[str] = mapped_column(String(32))  # deposit | investment | return
    source_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    level: Mapped[int] = mapped_column(default=1)
    pct: Mapped[float] = mapped_column(Numeric(8, 4))
    amount: Mapped[float] = mapped_column(Numeric(20, 8))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class PaymentMethod(Base):
    __tablename__ = "payment_methods"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(120))
    details: Mapped[str] = mapped_column(Text, default="")  # address / instructions shown to user
    qr_image: Mapped[str] = mapped_column(String(500), default="")  # QR/barcode image path shown to users
    min_amount: Mapped[float] = mapped_column(Numeric(20, 8), default=0)
    max_amount: Mapped[float] = mapped_column(Numeric(20, 8), default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)


class TradingCode(Base):
    """Admin-published daily trading code. Users redeem it to collect today's
    per-package return — the admin picks each package's amount inside its closed
    range and sets a free TTL when publishing."""

    __tablename__ = "trading_codes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(32), unique=True, index=True)
    amounts: Mapped[dict] = mapped_column(JSON, default=dict)  # {package_id: amount}
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class CodeRedemption(Base):
    """One redemption per user per code — enforced by the unique constraint."""

    __tablename__ = "code_redemptions"
    __table_args__ = (UniqueConstraint("code_id", "user_id", name="uq_code_user"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    code_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("trading_codes.id"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), index=True)
    amount: Mapped[float] = mapped_column(Numeric(20, 8), default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
