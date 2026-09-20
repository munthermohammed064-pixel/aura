"""notification params — localized structured events

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a1
Create Date: 2026-09-20

Notifications now carry an event key (`kind`) + `params` JSON so the
frontend renders every notification fully localized in the user's language.
`title`/`body` become optional legacy fields; `kind` widened to 64 chars.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table('notifications') as batch:
        batch.add_column(sa.Column('params', sa.JSON(), nullable=True))
        batch.alter_column('kind', existing_type=sa.String(length=32),
                           type_=sa.String(length=64), existing_nullable=True)
        batch.alter_column('title', existing_type=sa.String(length=255), nullable=True)


def downgrade() -> None:
    with op.batch_alter_table('notifications') as batch:
        batch.drop_column('params')
