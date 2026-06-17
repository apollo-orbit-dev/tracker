"""templates + template_field_defs + template_milestone_defs

Revision ID: 0003_templates
Revises: 0002_taxonomy_and_scoped_roles
Create Date: 2026-05-19

"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision: str = "0003_templates"
down_revision: str | Sequence[str] | None = "0002_taxonomy_and_scoped_roles"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "templates",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("department_id", UUID(as_uuid=True), nullable=False),
        sa.Column("client_id", UUID(as_uuid=True), nullable=False),
        sa.Column("discipline_id", UUID(as_uuid=True), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_templates")),
        sa.ForeignKeyConstraint(
            ["department_id"],
            ["departments.id"],
            name=op.f("fk_templates_department_id_departments"),
        ),
        sa.ForeignKeyConstraint(
            ["client_id"],
            ["clients.id"],
            name=op.f("fk_templates_client_id_clients"),
        ),
        sa.ForeignKeyConstraint(
            ["discipline_id"],
            ["disciplines.id"],
            name=op.f("fk_templates_discipline_id_disciplines"),
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"],
            ["users.id"],
            name=op.f("fk_templates_deleted_by_users"),
        ),
    )
    # One live template per (dept, client, discipline) intersection.
    op.create_index(
        op.f("uq_templates_intersection_live"),
        "templates",
        ["department_id", "client_id", "discipline_id"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "template_field_defs",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("template_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("field_type", sa.String(), nullable=False),
        sa.Column(
            "required",
            sa.Boolean(),
            nullable=False,
            server_default=sa.text("false"),
        ),
        sa.Column(
            "order_index",
            sa.Integer(),
            nullable=False,
            server_default=sa.text("0"),
        ),
        sa.Column("options", JSONB(), nullable=True),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_template_field_defs")),
        sa.ForeignKeyConstraint(
            ["template_id"],
            ["templates.id"],
            name=op.f("fk_template_field_defs_template_id_templates"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"],
            ["users.id"],
            name=op.f("fk_template_field_defs_deleted_by_users"),
        ),
        sa.CheckConstraint(
            "field_type IN ("
            "'short_text','long_text','url','email','phone',"
            "'integer','decimal','currency','percent','auto_number',"
            "'date','date_planned_actual','date_range','duration',"
            "'single_select','multi_select',"
            "'boolean','boolean_conditional_date','boolean_conditional_text',"
            "'user_picker_single','user_picker_multi','contact_picker',"
            "'project_reference','client_reference'"
            ")",
            name=op.f("ck_template_field_defs_field_type_valid"),
        ),
        sa.CheckConstraint(
            "(field_type IN ('single_select','multi_select') AND options IS NOT NULL)"
            " OR "
            "(field_type NOT IN ('single_select','multi_select') AND options IS NULL)",
            name=op.f("ck_template_field_defs_options_for_select"),
        ),
    )
    op.create_index(
        op.f("ix_template_field_defs_template_id"),
        "template_field_defs",
        ["template_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_template_field_defs_template_id_order_index"),
        "template_field_defs",
        ["template_id", "order_index"],
        unique=False,
    )

    op.create_table(
        "template_milestone_defs",
        sa.Column("id", UUID(as_uuid=True), nullable=False),
        sa.Column("template_id", UUID(as_uuid=True), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("direction", sa.String(), nullable=False),
        sa.Column("date_model", sa.String(), nullable=False),
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
        sa.PrimaryKeyConstraint("id", name=op.f("pk_template_milestone_defs")),
        sa.ForeignKeyConstraint(
            ["template_id"],
            ["templates.id"],
            name=op.f("fk_template_milestone_defs_template_id_templates"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["deleted_by"],
            ["users.id"],
            name=op.f("fk_template_milestone_defs_deleted_by_users"),
        ),
        sa.CheckConstraint(
            "direction IN ('outbound','inbound','internal','external')",
            name=op.f("ck_template_milestone_defs_direction_valid"),
        ),
        sa.CheckConstraint(
            "date_model IN ('single','planned_actual')",
            name=op.f("ck_template_milestone_defs_date_model_valid"),
        ),
    )
    op.create_index(
        op.f("ix_template_milestone_defs_template_id"),
        "template_milestone_defs",
        ["template_id"],
        unique=False,
    )
    op.create_index(
        op.f("ix_template_milestone_defs_template_id_order_index"),
        "template_milestone_defs",
        ["template_id", "order_index"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        op.f("ix_template_milestone_defs_template_id_order_index"),
        table_name="template_milestone_defs",
    )
    op.drop_index(
        op.f("ix_template_milestone_defs_template_id"),
        table_name="template_milestone_defs",
    )
    op.drop_table("template_milestone_defs")

    op.drop_index(
        op.f("ix_template_field_defs_template_id_order_index"),
        table_name="template_field_defs",
    )
    op.drop_index(
        op.f("ix_template_field_defs_template_id"),
        table_name="template_field_defs",
    )
    op.drop_table("template_field_defs")

    op.drop_index(
        op.f("uq_templates_intersection_live"), table_name="templates"
    )
    op.drop_table("templates")
