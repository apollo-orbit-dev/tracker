"""projects + milestones tables

Revision ID: 0004_projects_and_milestones
Revises: 0003_templates
Create Date: 2026-05-19

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0004_projects_and_milestones"
down_revision: str | Sequence[str] | None = "0003_templates"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "projects",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_number", sa.String(), nullable=False),
        sa.Column("client_project_number", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("template_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "lifecycle_state",
            sa.String(),
            nullable=False,
            server_default="draft",
        ),
        sa.Column(
            "custom_field_values",
            JSONB(),
            nullable=False,
            server_default=sa.text("'{}'::jsonb"),
        ),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_projects")),
        sa.ForeignKeyConstraint(
            ["template_id"],
            ["templates.id"],
            name=op.f("fk_projects_template_id_templates"),
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name=op.f("fk_projects_created_by_users"),
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"],
            ["users.id"],
            name=op.f("fk_projects_deleted_by_users"),
        ),
        sa.CheckConstraint(
            "lifecycle_state IN ('draft','active','on_hold','complete','cancelled')",
            name=op.f("ck_projects_lifecycle_state_valid"),
        ),
    )
    op.create_index(
        op.f("uq_projects_project_number_live"),
        "projects",
        ["project_number"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        op.f("ix_projects_template_id"),
        "projects",
        ["template_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_projects_lifecycle_state"),
        "projects",
        ["lifecycle_state"],
        unique=False,
    )

    op.create_table(
        "milestones",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("project_id", UUID(as_uuid=True), nullable=False),
        sa.Column(
            "template_milestone_def_id", UUID(as_uuid=True), nullable=True
        ),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("direction", sa.String(), nullable=False),
        sa.Column("date_model", sa.String(), nullable=False),
        sa.Column("planned_date", sa.Date(), nullable=True),
        sa.Column("actual_date", sa.Date(), nullable=True),
        sa.Column(
            "order_index",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_milestones")),
        sa.ForeignKeyConstraint(
            ["project_id"],
            ["projects.id"],
            name=op.f("fk_milestones_project_id_projects"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["template_milestone_def_id"],
            ["template_milestone_defs.id"],
            name=op.f("fk_milestones_template_milestone_def_id_template_milestone_defs"),
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"],
            ["users.id"],
            name=op.f("fk_milestones_deleted_by_users"),
        ),
        sa.CheckConstraint(
            "direction IN ('outbound','inbound','internal','external')",
            name=op.f("ck_milestones_direction_valid"),
        ),
        sa.CheckConstraint(
            "date_model IN ('single','planned_actual')",
            name=op.f("ck_milestones_date_model_valid"),
        ),
    )
    op.create_index(
        op.f("ix_milestones_project_id"),
        "milestones",
        ["project_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_milestones_planned_date"),
        "milestones",
        ["planned_date"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_milestones_planned_date"), table_name="milestones")
    op.drop_index(op.f("ix_milestones_project_id"), table_name="milestones")
    op.drop_table("milestones")

    op.drop_index(op.f("ix_projects_lifecycle_state"), table_name="projects")
    op.drop_index(op.f("ix_projects_template_id"), table_name="projects")
    op.drop_index(
        op.f("uq_projects_project_number_live"), table_name="projects"
    )
    op.drop_table("projects")
