"""project_contacts (M2M with role label)

Revision ID: 0008_project_contacts
Revises: 0007_contacts
Create Date: 2026-05-20

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0008_project_contacts"
down_revision: str | Sequence[str] | None = "0007_contacts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "project_contacts",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("contact_id", UUID(as_uuid=True), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_project_contacts")),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_project_contacts_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["contact_id"],
            ["contacts.id"],
            name=op.f("fk_project_contacts_contact_id_contacts"),
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"],
            ["users.id"],
            name=op.f("fk_project_contacts_deleted_by_users"),
        ),
    )
    op.create_index(
        op.f("ix_project_contacts_project_id"),
        "project_contacts",
        ["project_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_project_contacts_contact_id"),
        "project_contacts",
        ["contact_id"],
        unique=False,
    )
    # Same (project, contact, role) can't duplicate among live rows.
    # Same contact CAN play two different roles on one project.
    op.create_index(
        op.f("uq_project_contacts_combo_live"),
        "project_contacts",
        ["project_id", "contact_id", "role"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(
        op.f("uq_project_contacts_combo_live"),
        table_name="project_contacts",
    )
    op.drop_index(
        op.f("ix_project_contacts_contact_id"),
        table_name="project_contacts",
    )
    op.drop_index(
        op.f("ix_project_contacts_project_id"),
        table_name="project_contacts",
    )
    op.drop_table("project_contacts")
