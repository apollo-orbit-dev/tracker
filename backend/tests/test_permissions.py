import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.permissions import require_any_role, require_role
from backend.app.auth.roles import (
    ADMIN,
    DEPARTMENT_MANAGER,
    PROJECT_EDITOR,
    VIEWER,
    effective_roles_for,
)
from backend.app.auth.sessions import SESSION_COOKIE_NAME, sign_session
from backend.app.config import settings
from backend.app.db.models import User
from backend.app.db.session import get_db


# ---- pure unit tests on the hierarchy -------------------------------------


def test_admin_includes_all_lower_roles():
    eff = effective_roles_for([ADMIN])
    assert eff == {ADMIN, DEPARTMENT_MANAGER, PROJECT_EDITOR, VIEWER}


def test_department_manager_includes_editor_and_viewer():
    eff = effective_roles_for([DEPARTMENT_MANAGER])
    assert eff == {DEPARTMENT_MANAGER, PROJECT_EDITOR, VIEWER}
    assert ADMIN not in eff


def test_project_editor_includes_viewer():
    eff = effective_roles_for([PROJECT_EDITOR])
    assert eff == {PROJECT_EDITOR, VIEWER}


def test_viewer_only_viewer():
    eff = effective_roles_for([VIEWER])
    assert eff == {VIEWER}


def test_multiple_grants_union():
    eff = effective_roles_for([VIEWER, PROJECT_EDITOR])
    assert eff == {PROJECT_EDITOR, VIEWER}


def test_unknown_role_ignored():
    eff = effective_roles_for(["not_a_role"])
    assert eff == set()


# ---- dependency-factory rejection of bad inputs ----------------------------


def test_require_role_rejects_unknown_role_name():
    with pytest.raises(ValueError):
        require_role("definitely_not_a_role")


def test_require_any_role_rejects_empty():
    with pytest.raises(ValueError):
        require_any_role()


def test_require_any_role_rejects_unknown():
    with pytest.raises(ValueError):
        require_any_role(ADMIN, "definitely_not_a_role")


# ---- route-level tests against a tiny test-only app -----------------------


def _build_test_app(db_session: Session) -> FastAPI:
    """A minimal FastAPI app with two protected routes, sharing the test DB."""
    app = FastAPI()

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db

    @app.get("/admin-only")
    def admin_only(user: User = Depends(require_role(ADMIN))):
        return {"user_id": str(user.id)}

    @app.get("/editor-or-up")
    def editor(
        user: User = Depends(require_any_role(ADMIN, PROJECT_EDITOR)),
    ):
        return {"user_id": str(user.id)}

    return app


def _client_for(user: User, db_session: Session) -> TestClient:
    app = _build_test_app(db_session)
    c = TestClient(app)
    token = sign_session(user.id, settings.session_secret)
    c.cookies.set(SESSION_COOKIE_NAME, token)
    return c


def test_admin_route_admin_passes(admin_user: User, db_session: Session):
    c = _client_for(admin_user, db_session)
    r = c.get("/admin-only")
    assert r.status_code == 200


def test_admin_route_viewer_forbidden(viewer_user: User, db_session: Session):
    c = _client_for(viewer_user, db_session)
    r = c.get("/admin-only")
    assert r.status_code == 403


def test_admin_route_no_cookie_unauthorized(db_session: Session):
    app = _build_test_app(db_session)
    c = TestClient(app)
    r = c.get("/admin-only")
    assert r.status_code == 401


def test_hierarchy_admin_satisfies_viewer_check(
    admin_user: User, db_session: Session
):
    """Build a test route that only requires VIEWER, and confirm admin passes."""
    app = FastAPI()

    def _override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = _override_get_db

    @app.get("/viewer-only")
    def viewer_only(user: User = Depends(require_role(VIEWER))):
        return {"ok": True}

    c = TestClient(app)
    token = sign_session(admin_user.id, settings.session_secret)
    c.cookies.set(SESSION_COOKIE_NAME, token)
    r = c.get("/viewer-only")
    assert r.status_code == 200


def test_require_any_role_admin_passes(admin_user: User, db_session: Session):
    c = _client_for(admin_user, db_session)
    r = c.get("/editor-or-up")
    assert r.status_code == 200


def test_require_any_role_editor_passes(
    project_editor_user: User, db_session: Session
):
    c = _client_for(project_editor_user, db_session)
    r = c.get("/editor-or-up")
    assert r.status_code == 200


def test_require_any_role_viewer_forbidden(
    viewer_user: User, db_session: Session
):
    c = _client_for(viewer_user, db_session)
    r = c.get("/editor-or-up")
    assert r.status_code == 403


def test_dept_manager_satisfies_editor_check(
    department_manager_user: User, db_session: Session
):
    c = _client_for(department_manager_user, db_session)
    r = c.get("/editor-or-up")
    assert r.status_code == 200
