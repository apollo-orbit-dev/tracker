"""widget column_pos

Revision ID: 0017_widget_column_pos
Revises: 0016_user_project_view_columns
Create Date: 2026-05-23

Phase 2.11: per-widget column placement. Adds a SMALLINT `column_pos`
to `user_dashboard_widgets`. Backfill mirrors today's CSS grid auto-flow
so existing dashboards render identically immediately after upgrade.

Backfill algorithm: walk each dashboard's widgets in (order_index, id)
order; for width=1 widgets assign next_column (alternating 0/1); for
width=2 widgets assign column_pos=0 and reset next_column to 0.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0017_widget_column_pos"
down_revision: str | Sequence[str] | None = "0016_user_project_view_columns"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Add the column nullable so the backfill can write before we set
    #    the NOT NULL + CHECK constraints.
    op.add_column(
        "user_dashboard_widgets",
        sa.Column("column_pos", sa.SmallInteger, nullable=True),
    )

    # 2. Backfill per dashboard.
    rows = conn.execute(
        sa.text(
            """
            SELECT id, dashboard_id, width, order_index
            FROM user_dashboard_widgets
            ORDER BY dashboard_id, order_index, id
            """
        )
    ).fetchall()

    next_col_by_dashboard: dict[str, int] = {}
    for row in rows:
        widget_id = row.id
        dashboard_id = str(row.dashboard_id)
        width = row.width
        next_col = next_col_by_dashboard.get(dashboard_id, 0)
        if width == 2:
            col = 0
            next_col_by_dashboard[dashboard_id] = 0
        else:
            col = next_col
            next_col_by_dashboard[dashboard_id] = 1 - next_col
        conn.execute(
            sa.text(
                "UPDATE user_dashboard_widgets SET column_pos = :c WHERE id = :id"
            ),
            {"c": col, "id": widget_id},
        )

    # 3. Lock down the column: NOT NULL + default + CHECK.
    op.alter_column(
        "user_dashboard_widgets",
        "column_pos",
        nullable=False,
        server_default=sa.text("0"),
    )
    op.create_check_constraint(
        "column_pos_valid",
        "user_dashboard_widgets",
        "column_pos IN (0, 1)",
    )


def downgrade() -> None:
    op.drop_constraint(
        "column_pos_valid", "user_dashboard_widgets", type_="check"
    )
    op.drop_column("user_dashboard_widgets", "column_pos")
