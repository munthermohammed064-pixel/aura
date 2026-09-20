"""user stars + withdrawal star_penalty

Revision ID: a1b2c3d4e5f6
Revises: 02fe6955ca16
Create Date: 2026-09-19

Star discipline system: each user holds 0-4 stars; every missing star
deducts 25% from withdrawal payouts.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '02fe6955ca16'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('stars', sa.Integer(), nullable=False, server_default='4'))
    op.add_column('withdrawals', sa.Column('star_penalty', sa.Numeric(20, 8), nullable=False, server_default='0'))


def downgrade() -> None:
    op.drop_column('withdrawals', 'star_penalty')
    op.drop_column('users', 'stars')
