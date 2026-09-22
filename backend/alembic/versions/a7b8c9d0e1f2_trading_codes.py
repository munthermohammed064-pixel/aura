"""Trading codes — admin-published daily redemption codes

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-09-22

Trading codes replace automatic daily returns: the owner publishes a code with
a per-package amount (inside each package's closed range) and a free TTL. Users
redeem it once; the amount lands in their wallet immediately.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'trading_codes',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('code', sa.String(length=32), nullable=False),
        sa.Column('amounts', sa.JSON(), nullable=False, server_default='{}'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False, server_default='true'),
        sa.Column('created_by', sa.UUID(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['created_by'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_trading_codes_code', 'trading_codes', ['code'], unique=True)

    op.create_table(
        'code_redemptions',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('code_id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('amount', sa.Numeric(20, 8), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['code_id'], ['trading_codes.id']),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('code_id', 'user_id', name='uq_code_user'),
    )
    op.create_index('ix_code_redemptions_code_id', 'code_redemptions', ['code_id'])
    op.create_index('ix_code_redemptions_user_id', 'code_redemptions', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_code_redemptions_user_id', 'code_redemptions')
    op.drop_index('ix_code_redemptions_code_id', 'code_redemptions')
    op.drop_table('code_redemptions')
    op.drop_index('ix_trading_codes_code', 'trading_codes')
    op.drop_table('trading_codes')
