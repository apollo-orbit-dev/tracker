"""audit_log

Revision ID: 0020_audit_log
Revises: 0019_project_role_assignments
Create Date: 2026-06-08

Phase 3.1: append-only audit log. One row per user operation
(create/update/delete/transition/grant/revoke) on projects, milestones,
CORs, notes, user_roles, project_role_assignments. JSONB `changes`
payload holds the per-operation diff or operation-specific shape.

`changed_by` is ON DELETE SET NULL so the audit history survives user
deletions (rendered as "(deleted user)" in the admin viewer).

`project_id` is denormalized on sub-entity rows (milestone/cor/note/
project_role_assignment) so "everything for project X" is a single
indexed query without joins.

Downgrade drops the table. Audit log is purely additive; revoking all
grants on rollback is a manageable pre-downgrade step.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB, UUID
from alembic import op

revision: str = "0020_audit_log"
down_revision: str | Sequence[str] | None = "0019_project_role_assignments"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_ENTITY_TYPES = (
    "project",
    "milestone",
    "cor",
    "note",
    "user_role",
    "project_role_assignment",
)

_OPERATIONS = (
    "create",
    "update",
    "delete",
    "transition",
    "grant",
    "revoke",
)


def _quoted_list(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column("entity_type", sa.Text, nullable=False),
        sa.Column("entity_id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), nullable=True),
        sa.Column("operation", sa.Text, nullable=False),
        sa.Column("changes", JSONB, nullable=False),
        sa.Column("changed_by", UUID(as_uuid=True), nullable=True),
        sa.Column(
            "changed_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.ForeignKeyConstraint(
            ["changed_by"], ["users.id"], ondelete="SET NULL"
        ),
        sa.CheckConstraint(
            f"entity_type IN ({_quoted_list(_ENTITY_TYPES)})",
            name="entity_type_valid",
        ),
        sa.CheckConstraint(
            f"operation IN ({_quoted_list(_OPERATIONS)})",
            name="operation_valid",
        ),
    )
    op.create_index(
        "idx_audit_entity",
        "audit_log",
        ["entity_type", "entity_id", sa.text("changed_at DESC")],
    )
    op.create_index(
        "idx_audit_project",
        "audit_log",
        ["project_id", sa.text("changed_at DESC")],
        postgresql_where=sa.text("project_id IS NOT NULL"),
    )
    op.create_index(
        "idx_audit_changed_at",
        "audit_log",
        [sa.text("changed_at DESC")],
    )


def downgrade() -> None:
    op.drop_index("idx_audit_changed_at", table_name="audit_log")
    op.drop_index("idx_audit_project", table_name="audit_log")
    op.drop_index("idx_audit_entity", table_name="audit_log")
    op.drop_table("audit_log")
