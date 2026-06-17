"""change order requests (CORs)

Revision ID: 0005_cors
Revises: 0004_projects_and_milestones
Create Date: 2026-05-19

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0005_cors"
down_revision: str | Sequence[str] | None = "0004_projects_and_milestones"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "cors",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column("number", sa.String(), nullable=False),
        sa.Column("description", sa.String(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("submitted_date", sa.Date(), nullable=True),
        sa.Column("approved_date", sa.Date(), nullable=True),
        sa.Column(
            "status",
            sa.String(),
            nullable=False,
            server_default="draft",
        ),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cors")),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_cors_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"],
            ["users.id"],
            name=op.f("fk_cors_deleted_by_users"),
        ),
        sa.CheckConstraint(
            "status IN ('draft','submitted','approved','rejected','cancelled')",
            name=op.f("ck_cors_status_valid"),
        ),
    )
    op.create_index(
        op.f("ix_cors_project_id"), "cors", ["project_id"], unique=False
    )
    op.create_index(
        op.f("ix_cors_status"), "cors", ["status"], unique=False
    )
    # Per-project unique number, partial on live rows only.
    op.create_index(
        op.f("uq_cors_project_number_live"),
        "cors",
        ["project_id", "number"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index(op.f("uq_cors_project_number_live"), table_name="cors")
    op.drop_index(op.f("ix_cors_status"), table_name="cors")
    op.drop_index(op.f("ix_cors_project_id"), table_name="cors")
    op.drop_table("cors")
