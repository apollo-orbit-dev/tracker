"""template_field_defs.is_project_metric

Revision ID: 0021_field_def_is_project_metric
Revises: 0020_audit_log
Create Date: 2026-06-09

Phase 5.2: per-field "Project Metric" flag. When true, the value of
this field on a project is surfaced in the at-a-glance contexts (the
projects-list peek panel's metric grid + the project detail right
sidebar's Metrics block) without the user having to click into the
Custom fields panel.

Existing rows default to false; flipping the flag is a small write
through the existing field def admin endpoints.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0021_field_def_is_project_metric"
down_revision: str | Sequence[str] | None = "0020_audit_log"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "template_field_defs",
        sa.Column(
            "is_project_metric",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
    )


def downgrade() -> None:
    op.drop_column("template_field_defs", "is_project_metric")
