from datetime import datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.db.models import User


def test_list_users_requires_auth(client: TestClient):
    r = client.get("/api/admin/users")
    assert r.status_code == 401


def test_list_users_forbidden_for_viewer(client_as, viewer_user: User):
    c = client_as(viewer_user)
    r = c.get("/api/admin/users")
    assert r.status_code == 403


def test_list_users_forbidden_for_project_editor(
    client_as, project_editor_user: User
):
    c = client_as(project_editor_user)
    r = c.get("/api/admin/users")
    assert r.status_code == 403


def test_list_users_ok_for_admin(client_as, admin_user: User):
    c = client_as(admin_user)
    r = c.get("/api/admin/users")
    assert r.status_code == 200
    body = r.json()
    assert body["limit"] == 50
    assert body["offset"] == 0
    assert body["total"] == 1
    assert len(body["users"]) == 1
    u = body["users"][0]
    assert u["email"] == "admin@example.com"
    assert u["roles"] == ["admin"]
    assert u["lifecycle_state"] == "active"


def test_list_users_pagination(
    client_as, admin_user: User, viewer_user: User, project_editor_user: User
):
    c = client_as(admin_user)
    r = c.get("/api/admin/users?limit=2&offset=0")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 3
    assert len(body["users"]) == 2
    # Sort is by email ascending — admin@, editor@, viewer@
    assert body["users"][0]["email"] == "admin@example.com"
    assert body["users"][1]["email"] == "editor@example.com"

    r2 = c.get("/api/admin/users?limit=2&offset=2")
    assert r2.status_code == 200
    body2 = r2.json()
    assert body2["total"] == 3
    assert len(body2["users"]) == 1
    assert body2["users"][0]["email"] == "viewer@example.com"


def test_list_users_excludes_soft_deleted(
    client_as,
    admin_user: User,
    viewer_user: User,
    db_session: Session,
):
    viewer_user.deleted_at = datetime.now(timezone.utc)
    db_session.flush()

    c = client_as(admin_user)
    r = c.get("/api/admin/users")
    assert r.status_code == 200
    body = r.json()
    emails = [u["email"] for u in body["users"]]
    assert "viewer@example.com" not in emails
    assert body["total"] == 1


def test_list_users_rejects_invalid_pagination(client_as, admin_user: User):
    c = client_as(admin_user)
    assert c.get("/api/admin/users?limit=0").status_code == 422
    assert c.get("/api/admin/users?limit=999").status_code == 422
    assert c.get("/api/admin/users?offset=-1").status_code == 422
