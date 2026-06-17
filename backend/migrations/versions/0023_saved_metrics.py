"""saved_metrics

Revision ID: 0023_saved_metrics
Revises: 0022_custom_views
Create Date: 2026-06-10

Phase 7.9: personal saved-metric library. Owner-scoped rows holding a
validated MetricDefinition; applying one copies the config (no live
link), so the table is hard-delete with no soft-delete columns.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0023_saved_metrics"
down_revision: str | Sequence[str] | None = "0022_custom_views"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "saved_metrics",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("config", JSONB, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )


def downgrade() -> None:
    op.drop_table("saved_metrics")
