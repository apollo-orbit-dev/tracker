"""audit_log: add 'assignment' to entity_type_valid constraint

Revision ID: 0024_audit_log_assignment_entity
Revises: 433d3cc8668b
Create Date: 2026-06-19

Phase 11.3: extend the audit_log entity_type_valid check constraint to
include 'assignment' so CRUD routes for assignments can write audit rows
in the same transaction as the mutation.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0024_audit_log_assignment_entity"
down_revision: str | Sequence[str] | None = "433d3cc8668b"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

_ENTITY_TYPES_NEW = (
    "project",
    "milestone",
    "cor",
    "note",
    "user_role",
    "project_role_assignment",
    "assignment",
)

_ENTITY_TYPES_OLD = (
    "project",
    "milestone",
    "cor",
    "note",
    "user_role",
    "project_role_assignment",
)


def _quoted_list(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


def upgrade() -> None:
    op.drop_constraint("entity_type_valid", "audit_log", type_="check")
    op.create_check_constraint(
        "entity_type_valid",
        "audit_log",
        f"entity_type IN ({_quoted_list(_ENTITY_TYPES_NEW)})",
    )


def downgrade() -> None:
    op.drop_constraint("entity_type_valid", "audit_log", type_="check")
    op.create_check_constraint(
        "entity_type_valid",
        "audit_log",
        f"entity_type IN ({_quoted_list(_ENTITY_TYPES_OLD)})",
    )
