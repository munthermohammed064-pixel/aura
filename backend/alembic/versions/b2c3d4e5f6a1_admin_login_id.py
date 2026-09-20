"""admin login_id + drop TOTP columns

Revision ID: b2c3d4e5f6a1
Revises: a1b2c3d4e5f6
Create Date: 2026-09-19

2FA/TOTP removed per product decision (email OTP comes later via SMTP).
Admins authenticate with a dedicated login_id on the hidden console route —
never by email.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b2c3d4e5f6a1'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('users') as batch:
        batch.add_column(sa.Column('login_id', sa.String(length=64), nullable=True))
        batch.drop_column('totp_secret')
        batch.drop_column('totp_enabled')
    op.create_index('ix_users_login_id', 'users', ['login_id'], unique=True)


def downgrade() -> None:
    op.drop_index('ix_users_login_id', 'users')
    with op.batch_alter_table('users') as batch:
        batch.add_column(sa.Column('totp_enabled', sa.Boolean(), nullable=False, server_default='0'))
        batch.add_column(sa.Column('totp_secret', sa.String(length=64), nullable=True))
        batch.drop_column('login_id')
