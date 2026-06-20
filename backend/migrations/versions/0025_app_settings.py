"""app_settings table + app_setting audit entity_type

Revision ID: 0025_app_settings
Revises: 0024_audit_log_assignment_entity
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0025_app_settings"
down_revision: str | Sequence[str] | None = "0024_audit_log_assignment_entity"
branch_labels = None
depends_on = None

_OLD = (
    "entity_type IN ('project', 'milestone', 'cor', 'note', "
    "'user_role', 'project_role_assignment', 'assignment')"
)
_NEW = (
    "entity_type IN ('project', 'milestone', 'cor', 'note', "
    "'user_role', 'project_role_assignment', 'assignment', 'app_setting')"
)


def upgrade() -> None:
    op.create_table(
        "app_settings",
        sa.Column("key", sa.String(), primary_key=True),
        sa.Column("value", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_by", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"]),
    )
    op.drop_constraint("entity_type_valid", "audit_log", type_="check")
    op.create_check_constraint("entity_type_valid", "audit_log", _NEW)


def downgrade() -> None:
    op.drop_constraint("entity_type_valid", "audit_log", type_="check")
    op.create_check_constraint("entity_type_valid", "audit_log", _OLD)
    op.drop_table("app_settings")
