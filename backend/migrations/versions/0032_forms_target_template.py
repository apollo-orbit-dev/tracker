"""Add forms.target_template_id (Phase 20.5a).

Additive, unused until the intake target lands (20.5b): a nullable FK to the
template a future intake form is bound to. No CHECK change here.
"""
import sqlalchemy as sa
from alembic import op

revision = "0032_forms_target_template"
down_revision = "0031_forms_event_target"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "forms",
        sa.Column("target_template_id", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "forms_target_template_id_fkey",
        "forms",
        "templates",
        ["target_template_id"],
        ["id"],
    )


def downgrade():
    op.drop_constraint("forms_target_template_id_fkey", "forms", type_="foreignkey")
    op.drop_column("forms", "target_template_id")
