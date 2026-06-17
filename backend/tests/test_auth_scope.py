"""Helper-level tests for `backend.app.auth.scope`.

Phase 3.0.2 added the org-viewer grant alongside the existing org-admin
sentinel. Phase 3.0.3 added direct per-project read grants via
`project_role_assignments`. These tests exercise the generalized helpers
directly without going through HTTP routes — the route-level cross-dept
matrix lives in `test_dept_scope_routes.py`.

Matrix covered here:
- `is_org_role` — admin / org viewer / dept-only viewer / no grants.
- `accessible_department_ids` — None vs. set semantics, with minimum_role
  varying so org viewer narrows correctly when asked for higher roles.
- `has_role_in_dept` — read short-circuit for org viewer; no write
  short-circuit for org viewer; admin trumps everywhere.
- `directly_granted_project_ids` + `assert_can_view_project` widening +
  edit checks staying dept-scope-only (Phase 3.0.3).
"""
import pytest
from fastapi import HTTPException
from sqlalchemy.orm import Session

from backend.app.auth.roles import (
    ADMIN,
    DEPARTMENT_MANAGER,
    PROJECT_EDITOR,
    VIEWER,
)
from backend.app.auth.scope import (
    accessible_department_ids,
    assert_can_edit_project,
    assert_can_view_project,
    directly_granted_project_ids,
    has_role_in_dept,
    is_org_admin,
    is_org_role,
)
from backend.app.db.models import (
    Client,
    Department,
    Discipline,
    Project,
    ProjectRoleAssignment,
    Template,
    User,
    UserRole,
)


def _user(db: Session, email: str) -> User:
    u = User(email=email, display_name=email.split("@")[0])
    db.add(u)
    db.flush()
    return u


def _dept(db: Session, code: str) -> Department:
    d = Department(code=code, name=f"Dept {code}")
    db.add(d)
    db.flush()
    return d


def _grant(db: Session, user: User, role: str, dept_id=None) -> None:
    db.add(UserRole(user_id=user.id, role_id=role, department_id=dept_id))
    db.flush()


# ---- is_org_role --------------------------------------------------------


def test_is_org_role_admin_satisfies_any_role(db_session: Session):
    u = _user(db_session, "iorgad@example.com")
    _grant(db_session, u, ADMIN)
    assert is_org_role(u, ADMIN) is True
    assert is_org_role(u, DEPARTMENT_MANAGER) is True
    assert is_org_role(u, PROJECT_EDITOR) is True
    assert is_org_role(u, VIEWER) is True


def test_is_org_role_org_viewer_satisfies_viewer_only(db_session: Session):
    u = _user(db_session, "iorgv@example.com")
    _grant(db_session, u, VIEWER)
    assert is_org_role(u, VIEWER) is True
    assert is_org_role(u, PROJECT_EDITOR) is False
    assert is_org_role(u, DEPARTMENT_MANAGER) is False
    assert is_org_role(u, ADMIN) is False


def test_is_org_role_dept_only_viewer_is_not_org_scope(db_session: Session):
    u = _user(db_session, "deptv@example.com")
    d = _dept(db_session, "IDV")
    _grant(db_session, u, VIEWER, d.id)
    assert is_org_role(u, VIEWER) is False


def test_is_org_role_no_grants(db_session: Session):
    u = _user(db_session, "nogrant@example.com")
    assert is_org_role(u, VIEWER) is False
    assert is_org_role(u, ADMIN) is False


def test_is_org_admin_backward_compat_alias(db_session: Session):
    """The 1.x callers still use is_org_admin; verify behavior matches."""
    admin = _user(db_session, "compat_admin@example.com")
    _grant(db_session, admin, ADMIN)
    org_viewer = _user(db_session, "compat_ov@example.com")
    _grant(db_session, org_viewer, VIEWER)
    assert is_org_admin(admin) is True
    assert is_org_admin(org_viewer) is False


# ---- accessible_department_ids -----------------------------------------


def test_accessible_dept_ids_admin_returns_none(db_session: Session):
    u = _user(db_session, "accad@example.com")
    _grant(db_session, u, ADMIN)
    assert accessible_department_ids(u) is None
    assert accessible_department_ids(u, minimum_role=PROJECT_EDITOR) is None


def test_accessible_dept_ids_org_viewer_none_for_viewer(db_session: Session):
    u = _user(db_session, "accov@example.com")
    _grant(db_session, u, VIEWER)
    assert accessible_department_ids(u, minimum_role=VIEWER) is None


def test_accessible_dept_ids_org_viewer_empty_set_for_higher_role(
    db_session: Session,
):
    """Org viewer can't edit anywhere — querying for editor falls
    through to per-dept and finds nothing."""
    u = _user(db_session, "accov_ed@example.com")
    _grant(db_session, u, VIEWER)
    result = accessible_department_ids(u, minimum_role=PROJECT_EDITOR)
    assert result == set()


def test_accessible_dept_ids_dept_only_viewer_returns_that_dept(
    db_session: Session,
):
    u = _user(db_session, "accdv@example.com")
    d = _dept(db_session, "AAA")
    _grant(db_session, u, VIEWER, d.id)
    assert accessible_department_ids(u, minimum_role=VIEWER) == {d.id}


def test_accessible_dept_ids_no_grants_returns_empty_set(db_session: Session):
    u = _user(db_session, "accnone@example.com")
    assert accessible_department_ids(u) == set()


# ---- has_role_in_dept --------------------------------------------------


def test_has_role_in_dept_admin_anywhere(db_session: Session):
    u = _user(db_session, "hrdad@example.com")
    _grant(db_session, u, ADMIN)
    d = _dept(db_session, "HRDA")
    assert has_role_in_dept(u, d.id, VIEWER) is True
    assert has_role_in_dept(u, d.id, PROJECT_EDITOR) is True
    assert has_role_in_dept(u, d.id, DEPARTMENT_MANAGER) is True


def test_has_role_in_dept_org_viewer_satisfies_read_anywhere(
    db_session: Session,
):
    u = _user(db_session, "hrdov@example.com")
    _grant(db_session, u, VIEWER)
    d = _dept(db_session, "HRDV")
    assert has_role_in_dept(u, d.id, VIEWER) is True


def test_has_role_in_dept_org_viewer_does_not_satisfy_writes(
    db_session: Session,
):
    """Org viewer is read-only — has_role_in_dept must return False for
    project_editor / department_manager checks anywhere."""
    u = _user(db_session, "hrdov_w@example.com")
    _grant(db_session, u, VIEWER)
    d = _dept(db_session, "HRDW")
    assert has_role_in_dept(u, d.id, PROJECT_EDITOR) is False
    assert has_role_in_dept(u, d.id, DEPARTMENT_MANAGER) is False


def test_has_role_in_dept_dept_only_viewer_scoped(db_session: Session):
    u = _user(db_session, "hrddv@example.com")
    d_a = _dept(db_session, "HRDA1")
    d_b = _dept(db_session, "HRDB1")
    _grant(db_session, u, VIEWER, d_a.id)
    assert has_role_in_dept(u, d_a.id, VIEWER) is True
    assert has_role_in_dept(u, d_b.id, VIEWER) is False


# ---- directly_granted_project_ids + assert_can_view_project (3.0.3) -----


def _make_project_in(db: Session, dept: Department, suffix: str) -> Project:
    cl = Client(code=f"CL_{suffix}", name="cl", department_id=dept.id)
    di = Discipline(code=f"DI_{suffix}", name="di", department_id=dept.id)
    db.add_all([cl, di])
    db.flush()
    t = Template(
        name=f"t-{suffix}",
        department_id=dept.id,
        client_id=cl.id,
        discipline_id=di.id,
    )
    db.add(t)
    db.flush()
    creator = _user(db, f"creator-{suffix}@example.com")
    p = Project(
        project_number=f"DG-{suffix}",
        title=f"proj {suffix}",
        template_id=t.id,
        created_by=creator.id,
    )
    db.add(p)
    db.flush()
    return p


def _grant_direct(db: Session, user: User, project: Project) -> None:
    db.add(
        ProjectRoleAssignment(user_id=user.id, project_id=project.id)
    )
    db.flush()


def test_directly_granted_no_grants_empty(db_session: Session):
    u = _user(db_session, "dgne@example.com")
    assert directly_granted_project_ids(u) == set()


def test_directly_granted_returns_granted_set(db_session: Session):
    u = _user(db_session, "dgr@example.com")
    d = _dept(db_session, "DGR")
    p1 = _make_project_in(db_session, d, "DGR1")
    p2 = _make_project_in(db_session, d, "DGR2")
    _grant_direct(db_session, u, p1)
    _grant_direct(db_session, u, p2)
    assert directly_granted_project_ids(u) == {p1.id, p2.id}


def test_assert_can_view_project_passes_via_direct_grant(
    db_session: Session,
):
    """User has zero role grants but a direct project_role_assignment —
    the per-project read check should let them through (Phase 3.0.3
    widening)."""
    u = _user(db_session, "viapd@example.com")
    d = _dept(db_session, "VIAPD")
    p = _make_project_in(db_session, d, "VIAPD1")
    _grant_direct(db_session, u, p)
    # `assert_can_view_project` requires `project.template` loaded; the
    # ORM relationship is set up so accessing it is a lazy SELECT — fine
    # inside this transactional test.
    assert_can_view_project(u, p)  # does not raise


def test_assert_can_view_project_passes_via_dept_scope(db_session: Session):
    """Baseline: dept-scope viewer still satisfies the check."""
    u = _user(db_session, "viaps@example.com")
    d = _dept(db_session, "VIAPS")
    _grant(db_session, u, VIEWER, d.id)
    p = _make_project_in(db_session, d, "VIAPS1")
    assert_can_view_project(u, p)


def test_assert_can_view_project_404_when_neither(db_session: Session):
    """No dept scope, no direct grant → 404."""
    u = _user(db_session, "viapn@example.com")
    d = _dept(db_session, "VIAPN")
    p = _make_project_in(db_session, d, "VIAPN1")
    with pytest.raises(HTTPException) as exc:
        assert_can_view_project(u, p)
    assert exc.value.status_code == 404


def test_assert_can_edit_project_403_via_direct_grant_only(
    db_session: Session,
):
    """Regression artifact: direct grants are read-only. A user with
    only a direct project_role_assignment (no editor grant in the
    project's dept) cannot edit, even though they can read.
    """
    u = _user(db_session, "edpd@example.com")
    d = _dept(db_session, "EDPD")
    p = _make_project_in(db_session, d, "EDPD1")
    _grant_direct(db_session, u, p)
    with pytest.raises(HTTPException) as exc:
        assert_can_edit_project(u, p)
    assert exc.value.status_code == 403
