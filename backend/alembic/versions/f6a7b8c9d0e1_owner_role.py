"""owner/operator role split — existing admins become owners

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-09-21

The original 'admin' role held both day-to-day operations and company
control (payment methods, settings, audit). Those surfaces are now gated
behind 'owner'. Existing staff accounts are promoted to owner so access
is preserved; new staff are created as 'admin' (operator) via the
owner-only /admin/operators endpoints.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("UPDATE users SET role='owner' WHERE role='admin'")


def downgrade() -> None:
    op.execute("UPDATE users SET role='admin' WHERE role='owner'")
