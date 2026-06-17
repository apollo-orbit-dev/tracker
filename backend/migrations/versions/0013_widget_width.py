"""widget width column

Revision ID: 0013_widget_width
Revises: 0012_widget_config
Create Date: 2026-05-20

Adds an integer `width` column (1 or 2) so users can size widgets at
either half-row or full-row. Default is 1 — existing rows pack denser
than the 2.0 single-column stack but users can flip any widget to
width=2 from customize mode.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0013_widget_width"
down_revision: str | Sequence[str] | None = "0012_widget_config"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_dashboard_widgets",
        sa.Column(
            "width",
            sa.Integer,
            nullable=False,
            server_default=sa.text("1"),
        ),
    )
    op.create_check_constraint(
        op.f("ck_user_dashboard_widgets_width_valid"),
        "user_dashboard_widgets",
        "width IN (1, 2)",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_user_dashboard_widgets_width_valid"),
        "user_dashboard_widgets",
        type_="check",
    )
    op.drop_column("user_dashboard_widgets", "width")
