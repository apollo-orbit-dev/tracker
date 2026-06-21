"""Widen forms.target_entity CHECK to allow the assignment target (Phase 20.2).

Additive: extends the allow-list from ('cor') to ('cor','assignment'). Later
targets (milestone / event / intake) extend it the same way in their sub-phases.
"""
from alembic import op

revision = "0029_forms_assignment_target"
down_revision = "0028_forms"
branch_labels = None
depends_on = None

_OLD = "target_entity IS NULL OR target_entity IN ('cor')"
_NEW = "target_entity IS NULL OR target_entity IN ('cor','assignment')"


def upgrade():
    op.drop_constraint("form_target_entity_valid", "forms", type_="check")
    op.create_check_constraint("form_target_entity_valid", "forms", _NEW)


def downgrade():
    op.drop_constraint("form_target_entity_valid", "forms", type_="check")
    op.create_check_constraint("form_target_entity_valid", "forms", _OLD)
