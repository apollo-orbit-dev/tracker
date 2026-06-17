"""user_dashboard_widgets — per-user dashboard composition

Revision ID: 0011_user_dashboard_widgets
Revises: 0010_dept_scope_taxonomy
Create Date: 2026-05-20

Stores which widgets each user has on their dashboard and their order.
The widget configuration itself (template / field / milestone picks for
the future "customize" story) lives in a separate table and is not in
this phase — Phase 2.2 will add it.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0011_user_dashboard_widgets"
down_revision: str | Sequence[str] | None = "0010_dept_scope_taxonomy"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "user_dashboard_widgets",
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
        sa.Column("widget_type", sa.String, nullable=False),
        sa.Column(
            "order_index",
            sa.Integer,
            nullable=False,
            server_default=sa.text("0"),
        ),
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
        sa.CheckConstraint(
            "widget_type IN ('lifecycle','milestone_lookahead','cor_summary','recent_activity')",
            name="widget_type_valid",
        ),
    )
    op.create_index(
        op.f("ix_user_dashboard_widgets_user_id"),
        "user_dashboard_widgets",
        ["user_id"],
    )
    op.create_index(
        "uq_user_dashboard_widgets_user_type",
        "user_dashboard_widgets",
        ["user_id", "widget_type"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index(
        "uq_user_dashboard_widgets_user_type",
        table_name="user_dashboard_widgets",
    )
    op.drop_index(
        op.f("ix_user_dashboard_widgets_user_id"),
        table_name="user_dashboard_widgets",
    )
    op.drop_table("user_dashboard_widgets")
