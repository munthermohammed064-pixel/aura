"""per-language content columns — packages.i18n, payment_methods.i18n

Revision ID: g7h8i9j0k1l2
Revises: a7b8c9d0e1f2
Create Date: 2026-09-30

Admin-authored copy (package names/descriptions, payment-method names/details)
lives in the base columns as the default-language text. The new JSON column
holds optional per-language overrides: {"ar": {"name": "…"}, …}. The public
serializers ship the blob and the client picks its language — no behavioural
change when the column is NULL.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'g7h8i9j0k1l2'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('packages', sa.Column('i18n', sa.JSON(), nullable=True))
    op.add_column('payment_methods', sa.Column('i18n', sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column('payment_methods', 'i18n')
    op.drop_column('packages', 'i18n')
