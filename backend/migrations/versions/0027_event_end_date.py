"""events: add nullable end_date column for multi-day span (Phase 15.1)

Revision ID: 0027_event_end_date
Revises: 0026_events
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0027_event_end_date"
down_revision: str | Sequence[str] | None = "0026_events"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("events", sa.Column("end_date", sa.Date(), nullable=True))


def downgrade() -> None:
    op.drop_column("events", "end_date")
