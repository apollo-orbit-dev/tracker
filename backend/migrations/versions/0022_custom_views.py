"""custom_views + custom_view_blocks

Revision ID: 0022_custom_views
Revises: 0021_field_def_is_project_metric
Create Date: 2026-06-09

Phase 7.1: storage for Custom Views (user-composed pages under Saved
Views). published_department_id + scope ship now (nullable, unused)
so sub-phase D needs no second migration.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0022_custom_views"
down_revision: str | Sequence[str] | None = "0021_field_def_is_project_metric"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "custom_views",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column(
            "published_department_id",
            UUID(as_uuid=True),
            sa.ForeignKey("departments.id"),
            nullable=True,
            index=True,
        ),
        sa.Column("scope", JSONB, nullable=True),
        sa.Column(
            "order_index", sa.Integer(), nullable=False, server_default="0"
        ),
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
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "deleted_by",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
    )
    op.create_table(
        "custom_view_blocks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "view_id",
            UUID(as_uuid=True),
            sa.ForeignKey("custom_views.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("block_type", sa.String(), nullable=False),
        sa.Column("title", sa.String(200), nullable=True),
        sa.Column(
            "order_index", sa.Integer(), nullable=False, server_default="0"
        ),
        sa.Column("width", sa.Integer(), nullable=False, server_default="1"),
        sa.Column(
            "accent", sa.String(20), nullable=False, server_default="indigo"
        ),
        sa.Column("config", JSONB, nullable=True),
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
        sa.CheckConstraint(
            "block_type IN ('metric','chart','breakdown','table','text')",
            name="block_type_valid",
        ),
        sa.CheckConstraint("width IN (1, 2, 4)", name="block_width_valid"),
        sa.CheckConstraint(
            "accent IN ('indigo','blue','emerald','amber','rose','slate')",
            name="block_accent_valid",
        ),
    )


def downgrade() -> None:
    op.drop_table("custom_view_blocks")
    op.drop_table("custom_views")
