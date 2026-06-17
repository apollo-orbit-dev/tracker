"""user_project_view_columns table

Revision ID: 0016_user_project_view_columns
Revises: 0015_user_dashboards
Create Date: 2026-05-21

Phase 2.7: per-user-per-template column prefs for the viewing list.
Stores the ordered list of visible column keys + an optional sort
selection. Validation of keys against the live template lives in the
app layer (the registry depends on live field defs / milestone defs).
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0016_user_project_view_columns"
down_revision: str | Sequence[str] | None = "0015_user_dashboards"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_project_view_columns",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "template_id",
            UUID(as_uuid=True),
            sa.ForeignKey("templates.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "columns",
            JSONB(none_as_null=False),
            nullable=False,
            server_default=sa.text("'[]'::jsonb"),
        ),
        sa.Column("sort_key", sa.String, nullable=True),
        sa.Column("sort_direction", sa.String, nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint(
            "user_id",
            "template_id",
            name="uq_user_project_view_columns_user_template",
        ),
        sa.CheckConstraint(
            "sort_direction IN ('asc', 'desc') OR sort_direction IS NULL",
            name="sort_direction_valid",
        ),
        sa.CheckConstraint(
            "(sort_key IS NULL) = (sort_direction IS NULL)",
            name="sort_key_direction_paired",
        ),
    )
    op.create_index(
        op.f("ix_user_project_view_columns_user_id"),
        "user_project_view_columns",
        ["user_id"],
    )
    op.create_index(
        op.f("ix_user_project_view_columns_template_id"),
        "user_project_view_columns",
        ["template_id"],
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_user_project_view_columns_template_id"),
        table_name="user_project_view_columns",
    )
    op.drop_index(
        op.f("ix_user_project_view_columns_user_id"),
        table_name="user_project_view_columns",
    )
    op.drop_table("user_project_view_columns")
