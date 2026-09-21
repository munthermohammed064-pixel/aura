"""address change requests — $5 fee on admin approval

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-09-21

Users request a withdrawal-address change; admin approves it and the flat
$5 fee is debited from the user's available balance through the ledger.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'address_requests',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('new_address', sa.String(length=255), nullable=False),
        sa.Column('qr_image', sa.String(length=500), nullable=False, server_default=''),
        sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
        sa.Column('fee', sa.Numeric(20, 8), nullable=False, server_default='5'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('reviewed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_address_requests_user_id', 'address_requests', ['user_id'])


def downgrade() -> None:
    op.drop_index('ix_address_requests_user_id', table_name='address_requests')
    op.drop_table('address_requests')
