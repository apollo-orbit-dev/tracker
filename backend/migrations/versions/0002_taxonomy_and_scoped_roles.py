"""taxonomy tables (departments, clients, disciplines) + scoped DM role

Revision ID: 0002_taxonomy_and_scoped_roles
Revises: 0001_initial
Create Date: 2026-05-19

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0002_taxonomy_and_scoped_roles"
down_revision: str | Sequence[str] | None = "0001_initial"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_TAXONOMY_TABLES = ("departments", "clients", "disciplines")


def _create_taxonomy_table(name: str) -> None:
    op.create_table(
        name,
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("code", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_by", UUID(as_uuid=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f(f"pk_{name}")),
        sa.ForeignKeyConstraint(
            ["deleted_by"],
            ["users.id"],
            name=op.f(f"fk_{name}_deleted_by_users"),
        ),
    )
    # Partial unique index on `code` — only enforced for live rows so codes
    # can be re-used after soft delete.
    op.create_index(
        op.f(f"uq_{name}_code_live"),
        name,
        ["code"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def upgrade() -> None:
    for t in _TAXONOMY_TABLES:
        _create_taxonomy_table(t)

    # user_roles: add scope column + CHECK + index.
    op.add_column(
        "user_roles",
        sa.Column("department_id", UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        op.f("fk_user_roles_department_id_departments"),
        "user_roles",
        "departments",
        ["department_id"],
        ["id"],
    )
    op.create_index(
        op.f("ix_user_roles_department_id"),
        "user_roles",
        ["department_id"],
        unique=False,
    )
    op.create_check_constraint(
        op.f("ck_user_roles_department_scope"),
        "user_roles",
        "(role_id = 'department_manager' AND department_id IS NOT NULL)"
        " OR "
        "(role_id != 'department_manager' AND department_id IS NULL)",
    )


def downgrade() -> None:
    op.drop_constraint(
        op.f("ck_user_roles_department_scope"),
        "user_roles",
        type_="check",
    )
    op.drop_index(op.f("ix_user_roles_department_id"), table_name="user_roles")
    op.drop_constraint(
        op.f("fk_user_roles_department_id_departments"),
        "user_roles",
        type_="foreignkey",
    )
    op.drop_column("user_roles", "department_id")

    for t in reversed(_TAXONOMY_TABLES):
        op.drop_index(op.f(f"uq_{t}_code_live"), table_name=t)
        op.drop_table(t)
