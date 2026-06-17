"""widget config + field_aggregate widget type

Revision ID: 0012_widget_config
Revises: 0011_user_dashboard_widgets
Create Date: 2026-05-20

Adds a JSONB `config` column to `user_dashboard_widgets` and extends
the CHECK constraint on `widget_type` to include `field_aggregate`.

Existing rows keep config = NULL; the 2.0 widget set doesn't need a
config in this phase.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql as pg

revision: str = "0012_widget_config"
down_revision: str | Sequence[str] | None = "0011_user_dashboard_widgets"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_dashboard_widgets",
        sa.Column("config", pg.JSONB(none_as_null=True), nullable=True),
    )
    # Swap the CHECK to include the new widget type.
    op.drop_constraint(
        op.f("ck_user_dashboard_widgets_widget_type_valid"),
        "user_dashboard_widgets",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_user_dashboard_widgets_widget_type_valid"),
        "user_dashboard_widgets",
        "widget_type IN ("
        "'lifecycle','milestone_lookahead','cor_summary','recent_activity',"
        "'field_aggregate'"
        ")",
    )
    # Configurable widgets (field_aggregate) can appear multiple times
    # on one user's dashboard — different config per instance. The old
    # UNIQUE(user_id, widget_type) blocked that. Replace with a partial
    # unique that only applies to non-configurable rows (config IS NULL).
    op.drop_index(
        "uq_user_dashboard_widgets_user_type",
        table_name="user_dashboard_widgets",
    )
    op.create_index(
        "uq_user_dashboard_widgets_user_type_unconfigured",
        "user_dashboard_widgets",
        ["user_id", "widget_type"],
        unique=True,
        postgresql_where=sa.text("config IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_user_dashboard_widgets_user_type_unconfigured",
        table_name="user_dashboard_widgets",
    )
    op.create_index(
        "uq_user_dashboard_widgets_user_type",
        "user_dashboard_widgets",
        ["user_id", "widget_type"],
        unique=True,
    )
    op.drop_constraint(
        op.f("ck_user_dashboard_widgets_widget_type_valid"),
        "user_dashboard_widgets",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_user_dashboard_widgets_widget_type_valid"),
        "user_dashboard_widgets",
        "widget_type IN ("
        "'lifecycle','milestone_lookahead','cor_summary','recent_activity'"
        ")",
    )
    op.drop_column("user_dashboard_widgets", "config")
