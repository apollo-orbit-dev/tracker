"""project_role_assignments

Revision ID: 0019_project_role_assignments
Revises: 0018_relax_user_role_scope
Create Date: 2026-06-07

Phase 3.0.3: per-project, read-only access grants. Row presence on
`(user_id, project_id)` confers viewer semantics on that one project
regardless of the user's department scope. No `role_id` column — the
table itself encodes the read-only intent so it can't accidentally
escalate.

ON DELETE CASCADE on both FKs: deleting a user or a project transparently
cleans up their grant rows. `granted_by` is nullable so seed paths and
post-hoc admin grants don't need a synthetic operator user.

Downgrade drops the table outright. Revoking all grants is a manageable
pre-downgrade step (the table is purely additive permission grants).
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID
from alembic import op

revision: str = "0019_project_role_assignments"
down_revision: str | Sequence[str] | None = "0018_relax_user_role_scope"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "project_role_assignments",
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column("granted_by", UUID(as_uuid=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["project_id"], ["projects.id"], ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["granted_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id", "project_id"),
    )
    op.create_index(
        "idx_pra_project",
        "project_role_assignments",
        ["project_id"],
    )


def downgrade() -> None:
    op.drop_index("idx_pra_project", table_name="project_role_assignments")
    op.drop_table("project_role_assignments")
