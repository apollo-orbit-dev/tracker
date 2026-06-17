"""Constraint tests for the post-3.0.2 user_roles shape.

CHECK invariant (relaxed from 1.9.1 by migration 0018):
- role_id = 'admin'              → department_id IS NULL
- role_id = 'viewer'              → department_id IS NULL  (org viewer)
                                  OR department_id IS NOT NULL  (dept viewer)
- role_id IN
  ('project_editor',
   'department_manager')          → department_id IS NOT NULL

Unique invariant (unchanged):
- UNIQUE (user_id, role_id, department_id) NULLS NOT DISTINCT — the same
  user can't hold the same role in the same dept twice, but CAN hold
  the same role in different depts.
"""
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.db.models import Department, User, UserRole


def _make_user(db_session: Session, email: str) -> User:
    user = User(email=email, display_name="Test")
    db_session.add(user)
    db_session.flush()
    return user


def _make_department(db_session: Session, code: str = "DIV1") -> Department:
    d = Department(code=code, name=f"Department {code}")
    db_session.add(d)
    db_session.flush()
    return d


# ---- CHECK constraint ---------------------------------------------------


def test_admin_role_requires_null_department(db_session: Session):
    user = _make_user(db_session, "admin1@example.com")
    dept = _make_department(db_session)
    db_session.add(
        UserRole(user_id=user.id, role_id="admin", department_id=dept.id)
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_viewer_role_with_null_dept_ok(db_session: Session):
    """Phase 3.0.2: (viewer, NULL) is now legal as the "org viewer" grant
    — the cross-dept read-only sentinel parallel to (admin, NULL).
    Previously this was rejected; the test asserting that lived here and
    has been replaced by this positive case.
    """
    user = _make_user(db_session, "orgviewer1@example.com")
    db_session.add(UserRole(user_id=user.id, role_id="viewer"))
    db_session.flush()


def test_project_editor_requires_department(db_session: Session):
    user = _make_user(db_session, "editor1@example.com")
    db_session.add(UserRole(user_id=user.id, role_id="project_editor"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_department_manager_requires_department(db_session: Session):
    user = _make_user(db_session, "dm@example.com")
    db_session.add(UserRole(user_id=user.id, role_id="department_manager"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_department_manager_with_department_ok(db_session: Session):
    user = _make_user(db_session, "dm2@example.com")
    dept = _make_department(db_session)
    db_session.add(
        UserRole(
            user_id=user.id,
            role_id="department_manager",
            department_id=dept.id,
        )
    )
    db_session.flush()


def test_admin_without_department_ok(db_session: Session):
    user = _make_user(db_session, "admin2@example.com")
    db_session.add(UserRole(user_id=user.id, role_id="admin"))
    db_session.flush()


def test_viewer_with_department_ok(db_session: Session):
    """The happy-path inverse: viewer with a dept is now the only valid
    shape for a viewer."""
    user = _make_user(db_session, "v3@example.com")
    dept = _make_department(db_session)
    db_session.add(
        UserRole(user_id=user.id, role_id="viewer", department_id=dept.id)
    )
    db_session.flush()


# ---- multi-dept grants --------------------------------------------------


def test_user_can_hold_same_role_in_multiple_departments(
    db_session: Session,
):
    """The 1.9.1 surrogate PK + NULLS NOT DISTINCT unique constraint
    enables this — pre-1.9.1 the composite PK forbade it."""
    user = _make_user(db_session, "multi@example.com")
    dept_a = _make_department(db_session, code="DIV1")
    dept_b = _make_department(db_session, code="DIV2")
    db_session.add(
        UserRole(user_id=user.id, role_id="viewer", department_id=dept_a.id)
    )
    db_session.add(
        UserRole(user_id=user.id, role_id="viewer", department_id=dept_b.id)
    )
    db_session.flush()


def test_duplicate_role_in_same_department_rejected(db_session: Session):
    user = _make_user(db_session, "dup@example.com")
    dept = _make_department(db_session)
    db_session.add(
        UserRole(user_id=user.id, role_id="viewer", department_id=dept.id)
    )
    db_session.flush()
    db_session.add(
        UserRole(user_id=user.id, role_id="viewer", department_id=dept.id)
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_user_cannot_hold_admin_twice(db_session: Session):
    """NULLS NOT DISTINCT collapses two NULL-dept admin rows into a
    single slot per user."""
    user = _make_user(db_session, "twoadmin@example.com")
    db_session.add(UserRole(user_id=user.id, role_id="admin"))
    db_session.flush()
    db_session.add(UserRole(user_id=user.id, role_id="admin"))
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_different_roles_in_same_department_ok(db_session: Session):
    """Bob can be viewer AND project_editor in DIV1 — different roles
    in the same dept are independent grants."""
    user = _make_user(db_session, "bob@example.com")
    dept = _make_department(db_session)
    db_session.add(
        UserRole(user_id=user.id, role_id="viewer", department_id=dept.id)
    )
    db_session.add(
        UserRole(
            user_id=user.id, role_id="project_editor", department_id=dept.id
        )
    )
    db_session.flush()
