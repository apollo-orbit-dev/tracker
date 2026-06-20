"""add assignments

Revision ID: 433d3cc8668b
Revises: 0023_saved_metrics
Create Date: 2026-06-19 20:56:52.017709+00:00

"""
from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '433d3cc8668b'
down_revision: str | Sequence[str] | None = '0023_saved_metrics'
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        'assignments',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('project_id', sa.UUID(), nullable=False),
        sa.Column('milestone_id', sa.UUID(), nullable=True),
        sa.Column('assignee_user_id', sa.UUID(), nullable=False),
        sa.Column('description', sa.String(), nullable=False),
        sa.Column('status', sa.String(), server_default='open', nullable=False),
        sa.Column('due_date', sa.Date(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('deleted_by', sa.UUID(), nullable=True),
        sa.CheckConstraint(
            "status IN ('open','in_progress','done','cancelled')",
            name='assignment_status_valid',
        ),
        sa.ForeignKeyConstraint(['assignee_user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['deleted_by'], ['users.id']),
        sa.ForeignKeyConstraint(['milestone_id'], ['milestones.id']),
        sa.ForeignKeyConstraint(['project_id'], ['projects.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_assignments_project_id', 'assignments', ['project_id'], unique=False)
    op.create_index('ix_assignments_assignee_user_id', 'assignments', ['assignee_user_id'], unique=False)
    op.create_index('ix_assignments_status', 'assignments', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_assignments_status', table_name='assignments')
    op.drop_index('ix_assignments_assignee_user_id', table_name='assignments')
    op.drop_index('ix_assignments_project_id', table_name='assignments')
    op.drop_table('assignments')
