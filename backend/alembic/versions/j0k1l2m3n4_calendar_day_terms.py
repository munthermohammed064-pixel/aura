"""Restore package terms to calendar-day durations.

Revision ID: j0k1l2m3n4
Revises: i9j0k1l2m3n4
"""
from alembic import op
import sqlalchemy as sa

revision = "j0k1l2m3n4"
down_revision = "i9j0k1l2m3n4"
branch_labels = None
depends_on = None


def upgrade():
    connection = op.get_bind()
    metadata = sa.MetaData()
    investments = sa.Table("investments", metadata,
        sa.Column("id", sa.Uuid()),
        sa.Column("ends_at", sa.DateTime(timezone=True)))
    backup = sa.Table("investment_working_day_dates", metadata,
        sa.Column("investment_id", sa.Uuid()), sa.Column("old_ends_at", sa.DateTime(timezone=True)),
        sa.Column("new_ends_at", sa.DateTime(timezone=True)))
    # The earlier migration preserved every pre-change end date. Restore it only
    # when the current value still equals that migration's generated value.
    rows = connection.execute(sa.select(investments.c.id, backup.c.old_ends_at, backup.c.new_ends_at).join(
        backup, sa.and_(investments.c.id == backup.c.investment_id,
                        investments.c.ends_at == backup.c.new_ends_at)
    )).mappings().all()
    for row in rows:
        connection.execute(investments.update().where(
            investments.c.id == row["id"], investments.c.ends_at == row["new_ends_at"],
        ).values(ends_at=row["old_ends_at"]))


def downgrade():
    connection = op.get_bind()
    metadata = sa.MetaData()
    investments = sa.Table("investments", metadata,
        sa.Column("id", sa.Uuid()), sa.Column("ends_at", sa.DateTime(timezone=True)))
    backup = sa.Table("investment_working_day_dates", metadata,
        sa.Column("investment_id", sa.Uuid()), sa.Column("old_ends_at", sa.DateTime(timezone=True)),
        sa.Column("new_ends_at", sa.DateTime(timezone=True)))
    rows = connection.execute(sa.select(investments.c.id, backup.c.old_ends_at, backup.c.new_ends_at).join(
        backup, sa.and_(investments.c.id == backup.c.investment_id,
                        investments.c.ends_at == backup.c.old_ends_at)
    )).mappings().all()
    for row in rows:
        connection.execute(investments.update().where(
            investments.c.id == row["id"], investments.c.ends_at == row["old_ends_at"],
        ).values(ends_at=row["new_ends_at"]))
