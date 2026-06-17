"""contacts directory

Revision ID: 0007_contacts
Revises: 0006_notes
Create Date: 2026-05-20

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0007_contacts"
down_revision: str | Sequence[str] | None = "0006_notes"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "contacts",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("organization", sa.String(), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_contacts")),
        sa.ForeignKeyConstraint(
            ["deleted_by"],
            ["users.id"],
            name=op.f("fk_contacts_deleted_by_users"),
        ),
    )
    # Partial unique on email — only enforced when both deleted_at is NULL
    # AND email is non-null. Multiple null emails on live records coexist.
    op.create_index(
        op.f("uq_contacts_email_live"),
        "contacts",
        ["email"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL AND email IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index(op.f("uq_contacts_email_live"), table_name="contacts")
    op.drop_table("contacts")
