"""events + event_occurrence_overrides tables + audit entity_type 'event'

Revision ID: 0026_events
Revises: 0025_app_settings
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0026_events"
down_revision: str | Sequence[str] | None = "0025_app_settings"
branch_labels = None
depends_on = None

_OLD = (
    "entity_type IN ('project', 'milestone', 'cor', 'note', "
    "'user_role', 'project_role_assignment', 'assignment', 'app_setting')"
)
_NEW = (
    "entity_type IN ('project', 'milestone', 'cor', 'note', "
    "'user_role', 'project_role_assignment', 'assignment', 'app_setting', 'event')"
)


def upgrade() -> None:
    op.create_table(
        "events",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("department_id", sa.UUID(), sa.ForeignKey("departments.id"), nullable=False),
        sa.Column("created_by", sa.UUID(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("about_user_id", sa.UUID(), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=True),
        sa.Column("all_day", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("recurrence", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", sa.UUID(), sa.ForeignKey("users.id"), nullable=True),
    )
    op.create_index("ix_events_department_id", "events", ["department_id"])
    op.create_index("ix_events_start_date", "events", ["start_date"])

    op.create_table(
        "event_occurrence_overrides",
        sa.Column("id", sa.UUID(), primary_key=True),
        sa.Column("event_id", sa.UUID(), sa.ForeignKey("events.id", ondelete="CASCADE"), nullable=False),
        sa.Column("original_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(), nullable=False),
        sa.Column("override_date", sa.Date(), nullable=True),
        sa.Column("override_title", sa.String(), nullable=True),
        sa.Column("override_description", sa.String(), nullable=True),
        sa.Column("override_all_day", sa.Boolean(), nullable=True),
        sa.Column("override_start_time", sa.Time(), nullable=True),
        sa.Column("override_end_time", sa.Time(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.CheckConstraint("status IN ('cancelled','modified')", name="event_override_status_valid"),
        sa.UniqueConstraint("event_id", "original_date", name="uq_event_override_occurrence"),
    )
    op.create_index("ix_event_occurrence_overrides_event_id", "event_occurrence_overrides", ["event_id"])

    op.drop_constraint("entity_type_valid", "audit_log", type_="check")
    op.create_check_constraint("entity_type_valid", "audit_log", _NEW)


def downgrade() -> None:
    op.drop_constraint("entity_type_valid", "audit_log", type_="check")
    op.create_check_constraint("entity_type_valid", "audit_log", _OLD)
    op.drop_table("event_occurrence_overrides")
    op.drop_table("events")
