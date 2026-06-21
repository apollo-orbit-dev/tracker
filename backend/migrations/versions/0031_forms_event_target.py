"""Widen forms.target_entity CHECK to allow the event target (Phase 20.4).

Additive: extends the allow-list to ('cor','assignment','milestone','event').
"""
from alembic import op

revision = "0031_forms_event_target"
down_revision = "0030_forms_milestone_target"
branch_labels = None
depends_on = None

_OLD = "target_entity IS NULL OR target_entity IN ('cor','assignment','milestone')"
_NEW = "target_entity IS NULL OR target_entity IN ('cor','assignment','milestone','event')"


def upgrade():
    op.drop_constraint("form_target_entity_valid", "forms", type_="check")
    op.create_check_constraint("form_target_entity_valid", "forms", _NEW)


def downgrade():
    op.drop_constraint("form_target_entity_valid", "forms", type_="check")
    op.create_check_constraint("form_target_entity_valid", "forms", _OLD)
