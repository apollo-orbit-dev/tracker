"""user_roles surrogate PK + multi-dept membership

Revision ID: 0009_user_roles_multi_dept
Revises: 0008_project_contacts
Create Date: 2026-05-20

Schema rework:
- Add a surrogate uuid `id` PK so a user can hold the same role in
  multiple departments.
- Flip the CHECK constraint: admin must have NULL department_id;
  every other role must have a NOT NULL department_id.
- Add UNIQUE (user_id, role_id, department_id) NULLS NOT DISTINCT
  so the same (user, role, dept) combo can't be granted twice; the
  admin-with-NULL-dept row is a single fixed slot per user.

Data backfill:
- Any non-admin row with NULL department_id gets backfilled to the
  oldest live department. If no live department exists, the migration
  aborts so the operator can seed a department first.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision: str = "0009_user_roles_multi_dept"
down_revision: str | Sequence[str] | None = "0008_project_contacts"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    conn = op.get_bind()

    # 1. Add the surrogate id column. gen_random_uuid() is core in PG 13+;
    #    we're on 16. server_default populates existing rows; we drop the
    #    default afterward since the ORM sets the value (default=uuid.uuid4).
    op.add_column(
        "user_roles",
        sa.Column(
            "id",
            UUID(as_uuid=True),
            nullable=False,
            server_default=sa.text("gen_random_uuid()"),
        ),
    )
    op.alter_column("user_roles", "id", server_default=None)

    # 2. Drop the OLD CHECK first. We need to do this before backfilling
    #    department_id on non-admin rows, because the pre-1.9.1 CHECK
    #    forbids those exact rows.
    op.drop_constraint(
        op.f("ck_user_roles_department_scope"),
        "user_roles",
        type_="check",
    )

    # 3. Backfill department_id for non-admin rows that have NULL.
    backfill_dept = conn.execute(
        sa.text(
            "SELECT id FROM departments "
            "WHERE deleted_at IS NULL "
            "ORDER BY created_at ASC LIMIT 1"
        )
    ).scalar()

    null_dept_non_admin = conn.execute(
        sa.text(
            "SELECT count(*) FROM user_roles "
            "WHERE role_id != 'admin' AND department_id IS NULL"
        )
    ).scalar()

    if null_dept_non_admin and not backfill_dept:
        raise RuntimeError(
            f"Cannot migrate user_roles: {null_dept_non_admin} non-admin "
            "rows have NULL department_id and no live department exists "
            "to backfill them. Seed a department first."
        )

    if null_dept_non_admin:
        conn.execute(
            sa.text(
                "UPDATE user_roles SET department_id = :dept "
                "WHERE role_id != 'admin' AND department_id IS NULL"
            ),
            {"dept": backfill_dept},
        )

    # 4. Swap primary keys.
    op.drop_constraint(
        op.f("pk_user_roles"), "user_roles", type_="primary"
    )
    op.create_primary_key(op.f("pk_user_roles"), "user_roles", ["id"])

    # 5. Install the NEW CHECK.
    op.create_check_constraint(
        op.f("ck_user_roles_department_scope"),
        "user_roles",
        "(role_id = 'admin' AND department_id IS NULL)"
        " OR "
        "(role_id != 'admin' AND department_id IS NOT NULL)",
    )

    # 4. New unique index — NULLS NOT DISTINCT (PG 15+) treats the
    #    admin-NULL-dept row as a single fixed slot per user.
    op.create_index(
        op.f("uq_user_roles_user_role_dept"),
        "user_roles",
        ["user_id", "role_id", "department_id"],
        unique=True,
        postgresql_nulls_not_distinct=True,
    )


def downgrade() -> None:
    """Reverse the upgrade. Refuses to run if any user holds the same
    role in multiple departments — the old composite PK can't accommodate
    that, and silently dropping rows would be data loss."""
    conn = op.get_bind()
    multi_dept = conn.execute(
        sa.text(
            "SELECT count(*) FROM ("
            "  SELECT user_id, role_id, count(*) c "
            "  FROM user_roles GROUP BY user_id, role_id"
            ") t WHERE c > 1"
        )
    ).scalar()
    if multi_dept:
        raise RuntimeError(
            f"Cannot downgrade: {multi_dept} user/role combos have "
            "multiple department grants. Remove duplicates first."
        )

    op.drop_index(
        op.f("uq_user_roles_user_role_dept"), table_name="user_roles"
    )
    op.drop_constraint(
        op.f("ck_user_roles_department_scope"),
        "user_roles",
        type_="check",
    )
    op.drop_constraint(
        op.f("pk_user_roles"), "user_roles", type_="primary"
    )
    op.create_primary_key(
        op.f("pk_user_roles"), "user_roles", ["user_id", "role_id"]
    )
    op.create_check_constraint(
        op.f("ck_user_roles_department_scope"),
        "user_roles",
        "(role_id = 'department_manager' AND department_id IS NOT NULL)"
        " OR "
        "(role_id != 'department_manager' AND department_id IS NULL)",
    )
    op.drop_column("user_roles", "id")
