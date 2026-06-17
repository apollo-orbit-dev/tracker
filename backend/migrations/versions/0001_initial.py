"""initial schema: users, roles, user_roles, auth_providers

Revision ID: 0001_initial
Revises:
Create Date: 2026-05-19

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0001_initial"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


SYSTEM_ROLES = [
    {"id": "admin", "label": "Admin"},
    {"id": "department_manager", "label": "Department Manager"},
    {"id": "project_editor", "label": "Project Editor"},
    {"id": "viewer", "label": "Viewer"},
]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("display_name", sa.String(), nullable=False),
        sa.Column(
            "lifecycle_state",
            sa.String(),
            nullable=False,
            server_default="active",
        ),
        sa.Column("okta_subject", sa.String(), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
        sa.UniqueConstraint("okta_subject", name=op.f("uq_users_okta_subject")),
        sa.ForeignKeyConstraint(
            ["deleted_by"],
            ["users.id"],
            name=op.f("fk_users_deleted_by_users"),
        ),
        sa.CheckConstraint(
            "lifecycle_state IN ('active', 'deactivated', 'pending')",
            name=op.f("ck_users_lifecycle_state_valid"),
        ),
    )
    op.create_index(op.f("ix_users_email"), "users", ["email"], unique=False)

    op.create_table(
        "roles",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("label", sa.String(), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_roles")),
    )

    op.bulk_insert(
        sa.table(
            "roles",
            sa.column("id", sa.String()),
            sa.column("label", sa.String()),
        ),
        SYSTEM_ROLES,
    )

    op.create_table(
        "user_roles",
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("role_id", sa.String(), nullable=False),
        sa.Column(
            "granted_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column("granted_by", UUID(as_uuid=True), nullable=True),
        sa.PrimaryKeyConstraint("user_id", "role_id", name=op.f("pk_user_roles")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_user_roles_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["role_id"],
            ["roles.id"],
            name=op.f("fk_user_roles_role_id_roles"),
        ),
        sa.ForeignKeyConstraint(
            ["granted_by"],
            ["users.id"],
            name=op.f("fk_user_roles_granted_by_users"),
        ),
    )
    op.create_index(op.f("ix_user_roles_role_id"), "user_roles", ["role_id"], unique=False)

    op.create_table(
        "auth_providers",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("user_id", UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column("okta_subject", sa.String(), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_auth_providers")),
        sa.ForeignKeyConstraint(
            ["user_id"],
            ["users.id"],
            name=op.f("fk_auth_providers_user_id_users"),
            ondelete="CASCADE",
        ),
        sa.UniqueConstraint(
            "user_id", "provider", name=op.f("uq_auth_providers_user_id")
        ),
        sa.UniqueConstraint(
            "okta_subject", name=op.f("uq_auth_providers_okta_subject")
        ),
        sa.CheckConstraint(
            "provider IN ('local', 'okta')",
            name=op.f("ck_auth_providers_provider_valid"),
        ),
        sa.CheckConstraint(
            "(provider = 'local' AND password_hash IS NOT NULL AND okta_subject IS NULL)"
            " OR "
            "(provider = 'okta' AND okta_subject IS NOT NULL AND password_hash IS NULL)",
            name=op.f("ck_auth_providers_provider_payload_matches"),
        ),
    )
    op.create_index(
        op.f("ix_auth_providers_user_id"), "auth_providers", ["user_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_auth_providers_user_id"), table_name="auth_providers")
    op.drop_table("auth_providers")
    op.drop_index(op.f("ix_user_roles_role_id"), table_name="user_roles")
    op.drop_table("user_roles")
    op.drop_table("roles")
    op.drop_index(op.f("ix_users_email"), table_name="users")
    op.drop_table("users")
