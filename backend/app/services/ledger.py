"""Ledger service — all balance changes go through here.

Rules:
- No direct wallet mutation outside this module.
- Every movement writes an immutable LedgerEntry.
- Idempotency: callers pass a stable idempotency_key; duplicates are no-ops.
- Row locking: wallet row is locked with SELECT ... FOR UPDATE inside the transaction.
"""

import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.finance import LedgerEntry
from app.models.user import Wallet


class LedgerError(Exception):
    pass


def _lock_wallet(db: Session, user_id: uuid.UUID) -> Wallet:
    wallet = (
        db.query(Wallet)
        .filter(Wallet.user_id == user_id)
        .with_for_update()
        .first()
    )
    if not wallet:
        raise LedgerError("Wallet not found")
    return wallet


def post(
    db: Session,
    *,
    user_id: uuid.UUID,
    kind: str,
    direction: str,  # credit | debit
    bucket: str,     # available | pending | invested
    amount: float,
    reference_type: str | None = None,
    reference_id: uuid.UUID | None = None,
    idempotency_key: str | None = None,
    note: str = "",
) -> LedgerEntry:
    amount = Decimal(str(amount))
    if amount <= 0:
        raise LedgerError("Amount must be positive")
    if direction not in ("credit", "debit"):
        raise LedgerError("Invalid direction")
    if bucket not in ("available", "pending", "invested"):
        raise LedgerError("Invalid bucket")

    wallet = _lock_wallet(db, user_id)
    current = getattr(wallet, bucket)
    if direction == "debit" and current < amount:
        raise LedgerError(f"Insufficient {bucket} balance")

    entry = LedgerEntry(
        user_id=user_id, kind=kind, direction=direction, bucket=bucket,
        amount=amount, reference_type=reference_type, reference_id=reference_id,
        idempotency_key=idempotency_key, note=note,
    )
    # Savepoint: a duplicate idempotency key must not roll back the caller's
    # outer transaction (e.g. a deposit row being approved in the same tx).
    with db.begin_nested():
        db.add(entry)
        db.flush()

    setattr(wallet, bucket, current + amount if direction == "credit" else current - amount)
    db.flush()
    return entry


def post_idempotent(db: Session, *, idempotency_key: str, **kwargs) -> LedgerEntry | None:
    """Post only if key unseen. Returns existing entry on duplicate, None-safe."""
    existing = db.query(LedgerEntry).filter(LedgerEntry.idempotency_key == idempotency_key).first()
    if existing:
        return existing
    return post(db, idempotency_key=idempotency_key, **kwargs)


def move(db: Session, *, user_id: uuid.UUID, kind: str, amount: float,
         from_bucket: str, to_bucket: str, **kw) -> None:
    """Transfer between buckets (e.g. available -> invested)."""
    post(db, user_id=user_id, kind=kind, direction="debit", bucket=from_bucket, amount=amount, **kw)
    post(db, user_id=user_id, kind=kind, direction="credit", bucket=to_bucket, amount=amount, **kw)
