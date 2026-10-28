"""Exclude weekends from existing, unreturned investment terms.

Revision ID: i9j0k1l2m3n4
Revises: h8i9j0k1l2m3
"""
from datetime import timedelta, timezone

from alembic import op
import sqlalchemy as sa

revision = "i9j0k1l2m3n4"
down_revision = "h8i9j0k1l2m3"
branch_labels = None
depends_on = None


def _extend(start, end):
    # Freeze this migration's arithmetic independently of future app changes.
    duration = end - start
    current = start.replace(tzinfo=timezone.utc) if start.tzinfo is None else start
    while current.weekday() >= 5:
        current = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    while duration > timedelta(0):
        boundary = (current + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)
        step = min(duration, boundary - current)
        current += step
        duration -= step
        if duration:
            while current.weekday() >= 5:
                current += timedelta(days=1)
    return current


def upgrade():
    backup = op.create_table(
        "investment_working_day_dates",
        sa.Column("investment_id", sa.Uuid(), primary_key=True),
        sa.Column("old_ends_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("new_ends_at", sa.DateTime(timezone=True), nullable=False),
    )
    connection = op.get_bind()
    metadata = sa.MetaData()
    investments = sa.Table("investments", metadata,
        sa.Column("id", sa.Uuid()), sa.Column("status", sa.String()),
        sa.Column("started_at", sa.DateTime(timezone=True)), sa.Column("ends_at", sa.DateTime(timezone=True)))
    ledger = sa.Table("ledger_entries", metadata,
        sa.Column("id", sa.Uuid()), sa.Column("reference_id", sa.Uuid()),
        sa.Column("idempotency_key", sa.String()), sa.Column("direction", sa.String()),
        sa.Column("bucket", sa.String()), sa.Column("note", sa.String()))
    # Never extend an investment whose principal was already returned.
    returned = sa.exists(sa.select(ledger.c.id).where(
        sa.or_(
            sa.func.replace(ledger.c.idempotency_key, "-", "") == sa.literal("principalin:") + sa.func.replace(sa.cast(investments.c.id, sa.String), "-", ""),
            sa.and_(ledger.c.reference_id == investments.c.id,
                    ledger.c.direction == "credit", ledger.c.bucket == "available",
                    ledger.c.note == "Investment matured — principal returned"),
        )
    ))
    rows = connection.execute(sa.select(investments).where(
        investments.c.status.in_(("active", "completed")), ~returned,
    )).mappings().all()
    for row in rows:
        if row["ends_at"] <= row["started_at"]:
            continue
        new_end = _extend(row["started_at"], row["ends_at"])
        connection.execute(backup.insert().values(
            investment_id=row["id"], old_ends_at=row["ends_at"], new_ends_at=new_end,
        ))
        connection.execute(investments.update().where(investments.c.id == row["id"]).values(ends_at=new_end))


def downgrade():
    connection = op.get_bind()
    metadata = sa.MetaData()
    investments = sa.Table("investments", metadata,
        sa.Column("id", sa.Uuid()), sa.Column("status", sa.String()),
        sa.Column("started_at", sa.DateTime(timezone=True)), sa.Column("ends_at", sa.DateTime(timezone=True)))
    backup = sa.Table("investment_working_day_dates", metadata,
        sa.Column("investment_id", sa.Uuid()), sa.Column("old_ends_at", sa.DateTime(timezone=True)),
        sa.Column("new_ends_at", sa.DateTime(timezone=True)))
    for row in connection.execute(sa.select(backup)).mappings().all():
        # Preserve any explicit date edits made after the upgrade.
        connection.execute(investments.update().where(
            investments.c.id == row["investment_id"], investments.c.ends_at == row["new_ends_at"],
        ).values(ends_at=row["old_ends_at"]))
    op.drop_table("investment_working_day_dates")
