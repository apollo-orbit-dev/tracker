"""notes

Revision ID: 0006_notes
Revises: 0005_cors
Create Date: 2026-05-20

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0006_notes"
down_revision: str | Sequence[str] | None = "0005_cors"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notes",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_by", UUID(as_uuid=True), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notes")),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_notes_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_notes_created_by_users"),
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"],
            ["users.id"],
            name=op.f("fk_notes_deleted_by_users"),
        ),
    )
    op.create_index(
        op.f("ix_notes_project_id"), "notes", ["project_id"], unique=False
    )
    op.create_index(
        op.f("ix_notes_created_at"), "notes", ["created_at"], unique=False
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_notes_created_at"), table_name="notes")
    op.drop_index(op.f("ix_notes_project_id"), table_name="notes")
    op.drop_table("notes")
