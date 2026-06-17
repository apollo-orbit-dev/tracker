"""widget title (user-overridable header text)

Revision ID: 0014_widget_title
Revises: 0013_widget_width
Create Date: 2026-05-21

Users want to rename widget headers (e.g. "Field aggregate" →
"DEC Design Design Budget vs Spent"). Title is nullable — null means
"use the widget library's default label."
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014_widget_title"
down_revision: str | Sequence[str] | None = "0013_widget_width"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "user_dashboard_widgets",
        sa.Column("title", sa.String(length=200), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("user_dashboard_widgets", "title")
