"""user_dashboards table + FK from user_dashboard_widgets

Revision ID: 0015_user_dashboards
Revises: 0014_widget_title
Create Date: 2026-05-21

Phase 2.4: per-user multiple dashboards (tabs). Each existing user's
widget rows attach to a freshly-created default dashboard during
migration so behavior is unchanged on first load.

Schema shape:
- new table `user_dashboards` (id, user_id, name, order_index, ts).
- backfill: one "Dashboard" row per user with widget rows.
- new `dashboard_id` column on `user_dashboard_widgets`, backfilled,
  NOT NULL, FK ON DELETE CASCADE.
- swap the partial unique from (user_id, widget_type) WHERE config
  IS NULL to (dashboard_id, widget_type) WHERE config IS NULL.
  Same semantic — single-instance widgets can't appear twice on the
  same dashboard, but they CAN appear once per dashboard.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0015_user_dashboards"
down_revision: str | Sequence[str] | None = "0014_widget_title"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Create the table.
    op.create_table(
        "user_dashboards",
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
        sa.Column("name", sa.String(length=100), nullable=False),
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
    )
    op.create_index(
        op.f("ix_user_dashboards_user_id"),
        "user_dashboards",
        ["user_id"],
    )

    # 2. Backfill one "Dashboard" per distinct widget-owner.
    conn.execute(
        sa.text(
            """
            INSERT INTO user_dashboards (user_id, name, order_index)
            SELECT DISTINCT user_id, 'Dashboard', 0
            FROM user_dashboard_widgets
            """
        )
    )

    # 3. Add the FK column, backfill, then make NOT NULL.
    op.add_column(
        "user_dashboard_widgets",
        sa.Column("dashboard_id", UUID(as_uuid=True), nullable=True),
    )
    conn.execute(
        sa.text(
            """
            UPDATE user_dashboard_widgets w
            SET dashboard_id = d.id
            FROM user_dashboards d
            WHERE d.user_id = w.user_id
            """
        )
    )
    op.alter_column(
        "user_dashboard_widgets", "dashboard_id", nullable=False
    )
    op.create_foreign_key(
        op.f("fk_user_dashboard_widgets_dashboard_id_user_dashboards"),
        "user_dashboard_widgets",
        "user_dashboards",
        ["dashboard_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index(
        op.f("ix_user_dashboard_widgets_dashboard_id"),
        "user_dashboard_widgets",
        ["dashboard_id"],
    )

    # 4. Swap the partial unique from per-user to per-dashboard.
    op.drop_index(
        "uq_user_dashboard_widgets_user_type_unconfigured",
        table_name="user_dashboard_widgets",
    )
    op.create_index(
        "uq_user_dashboard_widgets_dashboard_type_unconfigured",
        "user_dashboard_widgets",
        ["dashboard_id", "widget_type"],
        unique=True,
        postgresql_where=sa.text("config IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_user_dashboard_widgets_dashboard_type_unconfigured",
        table_name="user_dashboard_widgets",
    )
    op.create_index(
        "uq_user_dashboard_widgets_user_type_unconfigured",
        "user_dashboard_widgets",
        ["user_id", "widget_type"],
        unique=True,
        postgresql_where=sa.text("config IS NULL"),
    )
    op.drop_index(
        op.f("ix_user_dashboard_widgets_dashboard_id"),
        table_name="user_dashboard_widgets",
    )
    op.drop_constraint(
        op.f("fk_user_dashboard_widgets_dashboard_id_user_dashboards"),
        "user_dashboard_widgets",
        type_="foreignkey",
    )
    op.drop_column("user_dashboard_widgets", "dashboard_id")
    op.drop_index(
        op.f("ix_user_dashboards_user_id"),
        table_name="user_dashboards",
    )
    op.drop_table("user_dashboards")
