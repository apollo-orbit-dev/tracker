"""relax user_roles department_scope check

Revision ID: 0018_relax_user_role_scope
Revises: 0017_widget_column_pos
Create Date: 2026-06-07

Phase 3.0.2: permit (viewer, NULL) as the new "org viewer" grant alongside
the existing (admin, NULL) sentinel. project_editor and department_manager
remain dept-bound (NOT NULL); admin remains org-bound (NULL).

The new constraint is strictly more permissive than the old one: every
row that satisfied the pre-upgrade constraint still satisfies the
post-upgrade one. No data migration required on upgrade.

Downgrade refuses if any (viewer, NULL) rows exist — the old constraint
would reject them and silently dropping role grants is data loss. Caller
must revoke org-viewer grants before downgrading. Matches the
data-loss-refusal pattern in migration 0009's downgrade.
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018_relax_user_role_scope"
down_revision: str | Sequence[str] | None = "0017_widget_column_pos"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


_NEW_CHECK = (
    "(role_id IN ('admin', 'viewer') AND department_id IS NULL)"
    " OR "
    "(role_id IN ('viewer', 'project_editor', 'department_manager') "
    "AND department_id IS NOT NULL)"
)

_OLD_CHECK = (
    "(role_id = 'admin' AND department_id IS NULL)"
    " OR "
    "(role_id != 'admin' AND department_id IS NOT NULL)"
)


def upgrade() -> None:
    op.drop_constraint(
        op.f("ck_user_roles_department_scope"),
        "user_roles",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_user_roles_department_scope"),
        "user_roles",
        _NEW_CHECK,
    )


def downgrade() -> None:
    conn = op.get_bind()
    org_viewer_rows = conn.execute(
        sa.text(
            "SELECT count(*) FROM user_roles "
            "WHERE role_id = 'viewer' AND department_id IS NULL"
        )
    ).scalar()
    if org_viewer_rows:
        raise RuntimeError(
            f"Cannot downgrade: {org_viewer_rows} (viewer, NULL) rows "
            "exist. Revoke org-viewer grants first before downgrading."
        )
    op.drop_constraint(
        op.f("ck_user_roles_department_scope"),
        "user_roles",
        type_="check",
    )
    op.create_check_constraint(
        op.f("ck_user_roles_department_scope"),
        "user_roles",
        _OLD_CHECK,
    )
