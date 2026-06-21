"""Create forms, form_fields, form_submissions; extend audit_log entity_type (Phase 17)."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0028_forms"
down_revision = "0027_event_end_date"
branch_labels = None
depends_on = None

_OLD = (
    "entity_type IN ('project', 'milestone', 'cor', 'note', "
    "'user_role', 'project_role_assignment', 'assignment', 'app_setting', 'event')"
)
_NEW = (
    "entity_type IN ('project', 'milestone', 'cor', 'note', "
    "'user_role', 'project_role_assignment', 'assignment', 'app_setting', 'event', "
    "'form', 'form_submission')"
)


def upgrade():
    op.create_table(
        "forms",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("department_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("departments.id"), nullable=False, index=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("target_entity", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="draft"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.CheckConstraint("status IN ('draft','active','archived')", name="form_status_valid"),
        sa.CheckConstraint("target_entity IS NULL OR target_entity IN ('cor')", name="form_target_entity_valid"),
    )
    op.create_table(
        "form_fields",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("form_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("forms.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("label", sa.String(200), nullable=False),
        sa.Column("field_type", sa.String(), nullable=False),
        sa.Column("required", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("help_text", sa.String(500), nullable=True),
        sa.Column("placeholder", sa.String(200), nullable=True),
        sa.Column("options", postgresql.JSONB(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("target_key", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "field_type IN ('short_text','long_text','integer','decimal',"
            "'currency','date','single_select','boolean')",
            name="form_field_type_valid",
        ),
    )
    op.create_table(
        "form_submissions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("form_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("forms.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("submitted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("values", postgresql.JSONB(), nullable=False, server_default="{}"),
        sa.Column("target_project_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="pending", index=True),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("pushed_entity_type", sa.String(), nullable=True),
        sa.Column("pushed_entity_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('pending','approved','rejected')", name="form_submission_status_valid"),
    )
    # Extend the audit_log entity_type CHECK to allow form + form_submission.
    # Mirror 0026_events.py exactly (constraint name `entity_type_valid`).
    op.drop_constraint("entity_type_valid", "audit_log", type_="check")
    op.create_check_constraint("entity_type_valid", "audit_log", _NEW)


def downgrade():
    op.drop_constraint("entity_type_valid", "audit_log", type_="check")
    op.create_check_constraint("entity_type_valid", "audit_log", _OLD)
    op.drop_table("form_submissions")
    op.drop_table("form_fields")
    op.drop_table("forms")
