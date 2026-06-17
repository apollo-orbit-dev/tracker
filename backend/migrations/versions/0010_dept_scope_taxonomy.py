"""Department-scope clients, disciplines, contacts

Revision ID: 0010_dept_scope_taxonomy
Revises: 0009_user_roles_multi_dept
Create Date: 2026-05-20

Each of clients, disciplines, contacts gains a NOT NULL department_id
FK. Existing rows backfilled to the oldest live department (DIV1 in
dev). Org-wide partial unique indexes are replaced with per-department
ones so the same code can exist in multiple departments.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0010_dept_scope_taxonomy"
down_revision: str | Sequence[str] | None = "0009_user_roles_multi_dept"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _add_dept_column_with_backfill(
    table_name: str, conn: sa.Connection, default_dept_id: str | None
) -> None:
    """Add a nullable department_id, backfill existing rows, then make NOT NULL."""
    op.add_column(
        table_name,
        sa.Column("department_id", UUID(as_uuid=True), nullable=True),
    )
    row_count = conn.execute(
        sa.text(f"SELECT count(*) FROM {table_name}")
    ).scalar()
    if row_count and not default_dept_id:
        raise RuntimeError(
            f"Cannot migrate {table_name}: {row_count} existing row(s) "
            "but no live department to backfill them. Seed a department first."
        )
    if row_count:
        conn.execute(
            sa.text(
                f"UPDATE {table_name} SET department_id = :dept "
                "WHERE department_id IS NULL"
            ),
            {"dept": default_dept_id},
        )
    op.alter_column(table_name, "department_id", nullable=False)
    op.create_foreign_key(
        op.f(f"fk_{table_name}_department_id_departments"),
        table_name,
        "departments",
        ["department_id"],
        ["id"],
    )
    op.create_index(
        op.f(f"ix_{table_name}_department_id"),
        table_name,
        ["department_id"],
        unique=False,
    )


def upgrade() -> None:
    conn = op.get_bind()
    default_dept = conn.execute(
        sa.text(
            "SELECT id FROM departments "
            "WHERE deleted_at IS NULL "
            "ORDER BY created_at ASC LIMIT 1"
        )
    ).scalar()

    # ---- clients -----------------------------------------------------
    _add_dept_column_with_backfill("clients", conn, default_dept)
    op.drop_index(op.f("uq_clients_code_live"), table_name="clients")
    op.create_index(
        op.f("uq_clients_dept_code_live"),
        "clients",
        ["department_id", "code"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # ---- disciplines -------------------------------------------------
    _add_dept_column_with_backfill("disciplines", conn, default_dept)
    op.drop_index(op.f("uq_disciplines_code_live"), table_name="disciplines")
    op.create_index(
        op.f("uq_disciplines_dept_code_live"),
        "disciplines",
        ["department_id", "code"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    # ---- contacts ----------------------------------------------------
    _add_dept_column_with_backfill("contacts", conn, default_dept)
    op.drop_index(op.f("uq_contacts_email_live"), table_name="contacts")
    op.create_index(
        op.f("uq_contacts_dept_email_live"),
        "contacts",
        ["department_id", "email"],
        unique=True,
        postgresql_where=sa.text(
            "deleted_at IS NULL AND email IS NOT NULL"
        ),
    )


def downgrade() -> None:
    # ---- contacts ----------------------------------------------------
    op.drop_index(op.f("uq_contacts_dept_email_live"), table_name="contacts")
    op.create_index(
        op.f("uq_contacts_email_live"),
        "contacts",
        ["email"],
        unique=True,
        postgresql_where=sa.text(
            "deleted_at IS NULL AND email IS NOT NULL"
        ),
    )
    op.drop_index(op.f("ix_contacts_department_id"), table_name="contacts")
    op.drop_constraint(
        op.f("fk_contacts_department_id_departments"),
        "contacts",
        type_="foreignkey",
    )
    op.drop_column("contacts", "department_id")

    # ---- disciplines -------------------------------------------------
    op.drop_index(
        op.f("uq_disciplines_dept_code_live"), table_name="disciplines"
    )
    op.create_index(
        op.f("uq_disciplines_code_live"),
        "disciplines",
        ["code"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_index(
        op.f("ix_disciplines_department_id"), table_name="disciplines"
    )
    op.drop_constraint(
        op.f("fk_disciplines_department_id_departments"),
        "disciplines",
        type_="foreignkey",
    )
    op.drop_column("disciplines", "department_id")

    # ---- clients -----------------------------------------------------
    op.drop_index(
        op.f("uq_clients_dept_code_live"), table_name="clients"
    )
    op.create_index(
        op.f("uq_clients_code_live"),
        "clients",
        ["code"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.drop_index(
        op.f("ix_clients_department_id"), table_name="clients"
    )
    op.drop_constraint(
        op.f("fk_clients_department_id_departments"),
        "clients",
        type_="foreignkey",
    )
    op.drop_column("clients", "department_id")
