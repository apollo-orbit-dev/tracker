"""Widen forms.target_entity CHECK to allow the milestone target (Phase 20.3).

Additive: extends the allow-list to ('cor','assignment','milestone').
"""
from alembic import op

revision = "0030_forms_milestone_target"
down_revision = "0029_forms_assignment_target"
branch_labels = None
depends_on = None

_OLD = "target_entity IS NULL OR target_entity IN ('cor','assignment')"
_NEW = "target_entity IS NULL OR target_entity IN ('cor','assignment','milestone')"


def upgrade():
    op.drop_constraint("form_target_entity_valid", "forms", type_="check")
    op.create_check_constraint("form_target_entity_valid", "forms", _NEW)


def downgrade():
    op.drop_constraint("form_target_entity_valid", "forms", type_="check")
    op.create_check_constraint("form_target_entity_valid", "forms", _OLD)
