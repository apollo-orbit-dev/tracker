"""Widen form_fields.field_type CHECK for the user-picker field type (Phase 27.9).

Additive: extends the allow-list with 'user' (a searchable user-picker form
field that can map to a user-typed target, e.g. an assignment's assignee).
No data backfill.
"""
from alembic import op

revision = "0035_form_user_field_type"
down_revision = "0034_my_assignments_widget"
branch_labels = None
depends_on = None

_OLD = (
    "field_type IN ('short_text','long_text','integer','decimal',"
    "'currency','date','single_select','boolean')"
)
_NEW = (
    "field_type IN ('short_text','long_text','integer','decimal',"
    "'currency','date','single_select','boolean','user')"
)


def upgrade():
    op.drop_constraint("form_field_type_valid", "form_fields", type_="check")
    op.create_check_constraint("form_field_type_valid", "form_fields", _NEW)


def downgrade():
    op.drop_constraint("form_field_type_valid", "form_fields", type_="check")
    op.create_check_constraint("form_field_type_valid", "form_fields", _OLD)
