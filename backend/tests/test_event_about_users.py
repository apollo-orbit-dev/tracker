"""Tests for GET /api/events/about-user-options?department_id=<uuid>."""
from datetime import datetime, timezone

import pytest
from sqlalchemy.orm import Session

from backend.app.db.models import Department, User, UserRole


@pytest.fixture
def env(db_session: Session):
    alpha = Department(code="AUO_ALPHA", name="AUO Alpha")
    beta = Department(code="AUO_BETA", name="AUO Beta")
    db_session.add_all([alpha, beta])
    db_session.flush()

    def mk(email, role, dept):
        u = User(email=email, display_name=email.split("@")[0])
        db_session.add(u)
        db_session.flush()
        if role:
            db_session.add(UserRole(user_id=u.id, role_id=role, department_id=dept))
        return u

    editor = mk("auo_ed@x.com", "project_editor", alpha.id)
    viewer = mk("auo_vw@x.com", "viewer", alpha.id)
    outsider = mk("auo_out@x.com", "project_editor", beta.id)
    # A user only in alpha's dept (department_manager role)
    dm = mk("auo_dm@x.com", "department_manager", alpha.id)

    db_session.flush()
    return locals()


def test_editor_gets_dept_users(env, client_as):
    """project_editor in dept gets all users with a role in that dept."""
    c = client_as(env["editor"])
    r = c.get(f"/api/events/about-user-options?department_id={env['alpha'].id}")
    assert r.status_code == 200, r.text
    data = r.json()
    assert "items" in data
    assert "total" in data
    ids = {item["id"] for item in data["items"]}
    # editor, viewer, and dm are all in alpha
    assert str(env["editor"].id) in ids
    assert str(env["viewer"].id) in ids
    assert str(env["dm"].id) in ids
    # outsider is only in beta, must NOT appear
    assert str(env["outsider"].id) not in ids
    # total matches items length
    assert data["total"] == len(data["items"])


def test_user_in_other_dept_not_included(env, client_as):
    """User with a role only in beta is not returned when querying alpha."""
    c = client_as(env["editor"])
    r = c.get(f"/api/events/about-user-options?department_id={env['alpha'].id}")
    assert r.status_code == 200
    ids = {item["id"] for item in r.json()["items"]}
    assert str(env["outsider"].id) not in ids


def test_soft_deleted_user_excluded(env, client_as, db_session: Session):
    """A soft-deleted user with a role in the dept is excluded."""
    # Soft-delete the viewer
    env["viewer"].deleted_at = datetime.now(timezone.utc)
    db_session.flush()

    c = client_as(env["editor"])
    r = c.get(f"/api/events/about-user-options?department_id={env['alpha'].id}")
    assert r.status_code == 200
    ids = {item["id"] for item in r.json()["items"]}
    assert str(env["viewer"].id) not in ids


def test_viewer_gets_403(env, client_as):
    """viewer role in dept → 403 (not project_editor+)."""
    c = client_as(env["viewer"])
    r = c.get(f"/api/events/about-user-options?department_id={env['alpha'].id}")
    assert r.status_code == 403


def test_editor_in_different_dept_gets_403(env, client_as):
    """project_editor in beta cannot query alpha's about-user options."""
    c = client_as(env["outsider"])
    r = c.get(f"/api/events/about-user-options?department_id={env['alpha'].id}")
    assert r.status_code == 403
