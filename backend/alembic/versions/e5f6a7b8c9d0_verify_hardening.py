"""OTP hardening — expiry + attempt counter on email verification codes

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-09-21

Six-digit codes are brute-forceable without a TTL and an attempt cap.
verify_expires_at gives codes a 10-minute life; verify_attempts locks the
code after 5 wrong guesses — the user must request a fresh one.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('users', sa.Column('verify_expires_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('users', sa.Column('verify_attempts', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('login_attempts', sa.Integer(), nullable=False, server_default='0'))
    op.add_column('users', sa.Column('login_locked_until', sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column('users', 'login_locked_until')
    op.drop_column('users', 'login_attempts')
    op.drop_column('users', 'verify_attempts')
    op.drop_column('users', 'verify_expires_at')
