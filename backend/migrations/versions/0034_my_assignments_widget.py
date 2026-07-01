"""Widen user_dashboard_widgets.widget_type CHECK for the my_assignments widget (Phase 27.6).

Additive: extends the allow-list with 'my_assignments' (the cross-project
"my assignments" dashboard widget). No data backfill.
"""
from alembic import op

revision = "0034_my_assignments_widget"
down_revision = "0033_forms_intake_target"
branch_labels = None
depends_on = None

_OLD = (
    "widget_type IN ("
    "'lifecycle','milestone_lookahead','cor_summary','recent_activity',"
    "'field_aggregate'"
    ")"
)
_NEW = (
    "widget_type IN ("
    "'lifecycle','milestone_lookahead','cor_summary','recent_activity',"
    "'field_aggregate','my_assignments'"
    ")"
)


def upgrade():
    op.drop_constraint("widget_type_valid", "user_dashboard_widgets", type_="check")
    op.create_check_constraint(
        "widget_type_valid", "user_dashboard_widgets", _NEW
    )


def downgrade():
    op.drop_constraint("widget_type_valid", "user_dashboard_widgets", type_="check")
    op.create_check_constraint(
        "widget_type_valid", "user_dashboard_widgets", _OLD
    )
