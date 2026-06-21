"""Widen forms.target_entity CHECK to allow the intake target (Phase 20.5b).

Additive: extends the allow-list to include 'intake'.
"""
from alembic import op

revision = "0033_forms_intake_target"
down_revision = "0032_forms_target_template"
branch_labels = None
depends_on = None

_OLD = "target_entity IS NULL OR target_entity IN ('cor','assignment','milestone','event')"
_NEW = "target_entity IS NULL OR target_entity IN ('cor','assignment','milestone','event','intake')"


def upgrade():
    op.drop_constraint("form_target_entity_valid", "forms", type_="check")
    op.create_check_constraint("form_target_entity_valid", "forms", _NEW)


def downgrade():
    op.drop_constraint("form_target_entity_valid", "forms", type_="check")
    op.create_check_constraint("form_target_entity_valid", "forms", _OLD)
