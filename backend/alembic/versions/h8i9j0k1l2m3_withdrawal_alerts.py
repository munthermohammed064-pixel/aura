"""Deduplicate deadline alerts across retries and multiple workers.

Revision ID: h8i9j0k1l2m3
Revises: g7h8i9j0k1l2
"""
from alembic import op
import sqlalchemy as sa

revision = "h8i9j0k1l2m3"
down_revision = "g7h8i9j0k1l2"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("notifications", sa.Column("dedup_key", sa.String(160), nullable=True))
    op.create_index("ix_notifications_dedup_key", "notifications", ["dedup_key"], unique=True)
    op.create_index("ix_withdrawals_status_created_at", "withdrawals", ["status", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_withdrawals_status_created_at", table_name="withdrawals")
    op.drop_index("ix_notifications_dedup_key", table_name="notifications")
    op.drop_column("notifications", "dedup_key")
