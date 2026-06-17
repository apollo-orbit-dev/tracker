"""Route tests for the taxonomy entities.

Two shapes now exist:

- /api/admin/departments — org-wide, admin-only (uses make_taxonomy_router).
- /api/admin/clients + /api/admin/disciplines — dept-scoped
  (Phase 1.9.2). Permissions mirror the contacts directory:
    viewer (in dept)  → read-only within their depts
    DM (in dept)      → full CRUD within their depts
    admin             → full CRUD anywhere
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.db.models import Client, Department, Discipline, User
from backend.tests.conftest import _make_dept


# ---- /api/admin/departments — admin-only ---------------------------------


def test_departments_list_requires_auth(client: TestClient):
    assert client.get("/api/admin/departments").status_code == 401


def test_departments_list_forbidden_for_viewer(
    client_as, viewer_user: User
):
    assert client_as(viewer_user).get("/api/admin/departments").status_code == 403


def test_departments_create_forbidden_for_viewer(
    client_as, viewer_user: User
):
    r = client_as(viewer_user).post(
        "/api/admin/departments", json={"code": "X", "name": "x"}
    )
    assert r.status_code == 403


def test_departments_admin_full_crud(
    client_as, admin_user: User
):
    c = client_as(admin_user)
    create = c.post(
        "/api/admin/departments",
        json={"code": "DIV1", "name": "Division 1"},
    )
    assert create.status_code == 201, create.text
    body = create.json()
    # The org-wide schema does NOT include department_id.
    assert "department_id" not in body

    got = c.get(f"/api/admin/departments/{body['id']}")
    assert got.status_code == 200
    assert got.json()["code"] == "DIV1"

    patch = c.patch(
        f"/api/admin/departments/{body['id']}",
        json={"name": "Renamed"},
    )
    assert patch.status_code == 200
    assert patch.json()["name"] == "Renamed"

    dup = c.post(
        "/api/admin/departments",
        json={"code": "DIV1", "name": "Other"},
    )
    assert dup.status_code == 409


def test_departments_create_rejects_whitespace(client_as, admin_user: User):
    r = client_as(admin_user).post(
        "/api/admin/departments",
        json={"code": "has space", "name": "x"},
    )
    assert r.status_code == 422


# ---- /api/admin/{clients,disciplines} — dept-scoped ----------------------

DEPT_SCOPED = [
    ("clients", Client, "CON", "Contoso"),
    ("disciplines", Discipline, "Design", "Protection & Controls"),
]


def _dm_dept_id(dm_user: User) -> str:
    return str(dm_user.user_roles[0].department_id)


@pytest.mark.parametrize("path,_model,_code,_name", DEPT_SCOPED)
def test_list_requires_auth(client: TestClient, path, _model, _code, _name):
    r = client.get(f"/api/admin/{path}")
    assert r.status_code == 401


@pytest.mark.parametrize("path,_model,_code,_name", DEPT_SCOPED)
def test_list_returns_empty_for_viewer_with_no_items(
    client_as, viewer_user: User, path, _model, _code, _name
):
    r = client_as(viewer_user).get(f"/api/admin/{path}")
    assert r.status_code == 200
    assert r.json()["total"] == 0


@pytest.mark.parametrize("path,_model,_code,_name", DEPT_SCOPED)
def test_create_requires_dm_in_target_dept(
    client_as,
    project_editor_user: User,
    department_manager_user: User,
    path,
    _model,
    _code,
    _name,
):
    target = _dm_dept_id(department_manager_user)
    body = {"department_id": target, "code": _code, "name": _name}
    # project_editor → 403
    r1 = client_as(project_editor_user).post(f"/api/admin/{path}", json=body)
    assert r1.status_code == 403
    # DM in this dept → 201
    r2 = client_as(department_manager_user).post(f"/api/admin/{path}", json=body)
    assert r2.status_code == 201, r2.text


@pytest.mark.parametrize("path,_model,code,name", DEPT_SCOPED)
def test_admin_create_then_get(
    client_as, admin_user: User, department_manager_user: User,
    path, _model, code, name,
):
    c = client_as(admin_user)
    target = _dm_dept_id(department_manager_user)
    create = c.post(
        f"/api/admin/{path}",
        json={"department_id": target, "code": code, "name": name},
    )
    assert create.status_code == 201, create.text
    body = create.json()
    assert body["code"] == code
    assert body["name"] == name
    assert body["deleted_at"] is None
    assert body["department_id"] == target

    got = c.get(f"/api/admin/{path}/{body['id']}")
    assert got.status_code == 200
    assert got.json()["code"] == code


@pytest.mark.parametrize("path,_model,code,name", DEPT_SCOPED)
def test_list_returns_created_item(
    client_as, admin_user: User, department_manager_user: User,
    path, _model, code, name,
):
    c = client_as(admin_user)
    target = _dm_dept_id(department_manager_user)
    c.post(
        f"/api/admin/{path}",
        json={"department_id": target, "code": code, "name": name},
    )
    r = c.get(f"/api/admin/{path}")
    assert r.status_code == 200
    body = r.json()
    assert body["total"] == 1
    assert body["items"][0]["code"] == code


@pytest.mark.parametrize("path,_model,code,name", DEPT_SCOPED)
def test_patch_updates_fields(
    client_as, admin_user: User, department_manager_user: User,
    path, _model, code, name,
):
    c = client_as(admin_user)
    target = _dm_dept_id(department_manager_user)
    created = c.post(
        f"/api/admin/{path}",
        json={"department_id": target, "code": code, "name": name},
    ).json()
    r = c.patch(
        f"/api/admin/{path}/{created['id']}", json={"name": "Renamed"}
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Renamed"
    assert r.json()["code"] == code


@pytest.mark.parametrize("path,_model,code,name", DEPT_SCOPED)
def test_patch_empty_body_422(
    client_as, admin_user: User, department_manager_user: User,
    path, _model, code, name,
):
    c = client_as(admin_user)
    target = _dm_dept_id(department_manager_user)
    created = c.post(
        f"/api/admin/{path}",
        json={"department_id": target, "code": code, "name": name},
    ).json()
    r = c.patch(f"/api/admin/{path}/{created['id']}", json={})
    assert r.status_code == 422


@pytest.mark.parametrize("path,model,code,name", DEPT_SCOPED)
def test_delete_soft_deletes(
    client_as, admin_user: User, department_manager_user: User,
    db_session: Session, path, model, code, name,
):
    c = client_as(admin_user)
    target = _dm_dept_id(department_manager_user)
    created = c.post(
        f"/api/admin/{path}",
        json={"department_id": target, "code": code, "name": name},
    ).json()
    r = c.delete(f"/api/admin/{path}/{created['id']}")
    assert r.status_code == 204

    r2 = c.get(f"/api/admin/{path}/{created['id']}")
    assert r2.status_code == 404

    r3 = c.get(f"/api/admin/{path}?include_deleted=true")
    assert r3.status_code == 200
    body = r3.json()
    assert body["total"] == 1
    assert body["items"][0]["deleted_at"] is not None

    db_session.expire_all()
    row = db_session.get(model, created["id"])
    assert row is not None
    assert row.deleted_at is not None
    assert row.deleted_by == admin_user.id


@pytest.mark.parametrize("path,_model,code,name", DEPT_SCOPED)
def test_duplicate_code_409_same_dept(
    client_as, admin_user: User, department_manager_user: User,
    path, _model, code, name,
):
    c = client_as(admin_user)
    target = _dm_dept_id(department_manager_user)
    a = c.post(
        f"/api/admin/{path}",
        json={"department_id": target, "code": code, "name": name},
    )
    assert a.status_code == 201
    b = c.post(
        f"/api/admin/{path}",
        json={"department_id": target, "code": code, "name": "Other"},
    )
    assert b.status_code == 409


@pytest.mark.parametrize("path,_model,code,name", DEPT_SCOPED)
def test_same_code_allowed_across_depts(
    client_as, admin_user: User, db_session: Session,
    path, _model, code, name,
):
    """Per-dept unique → same code in two depts is fine."""
    a_dept = _make_dept(db_session, code=f"A_{path.upper()[:6]}")
    b_dept = _make_dept(db_session, code=f"B_{path.upper()[:6]}")
    db_session.commit()
    c = client_as(admin_user)
    r1 = c.post(
        f"/api/admin/{path}",
        json={"department_id": str(a_dept.id), "code": code, "name": name},
    )
    r2 = c.post(
        f"/api/admin/{path}",
        json={"department_id": str(b_dept.id), "code": code, "name": name},
    )
    assert r1.status_code == 201
    assert r2.status_code == 201


@pytest.mark.parametrize("path,_model,code,name", DEPT_SCOPED)
def test_recreate_after_soft_delete_ok(
    client_as, admin_user: User, department_manager_user: User,
    path, _model, code, name,
):
    c = client_as(admin_user)
    target = _dm_dept_id(department_manager_user)
    created = c.post(
        f"/api/admin/{path}",
        json={"department_id": target, "code": code, "name": name},
    ).json()
    c.delete(f"/api/admin/{path}/{created['id']}")
    r = c.post(
        f"/api/admin/{path}",
        json={"department_id": target, "code": code, "name": "Fresh"},
    )
    assert r.status_code == 201
    assert r.json()["name"] == "Fresh"


@pytest.mark.parametrize("path,_model,_code,_name", DEPT_SCOPED)
def test_get_missing_404(
    client_as, admin_user: User, path, _model, _code, _name
):
    r = client_as(admin_user).get(
        f"/api/admin/{path}/00000000-0000-0000-0000-000000000000"
    )
    assert r.status_code == 404


@pytest.mark.parametrize("path,_model,_code,_name", DEPT_SCOPED)
def test_create_rejects_whitespace_in_code(
    client_as, admin_user: User, department_manager_user: User,
    path, _model, _code, _name,
):
    target = _dm_dept_id(department_manager_user)
    r = client_as(admin_user).post(
        f"/api/admin/{path}",
        json={"department_id": target, "code": "has space", "name": "x"},
    )
    assert r.status_code == 422


@pytest.mark.parametrize("path,_model,_code,_name", DEPT_SCOPED)
def test_pagination(
    client_as, admin_user: User, department_manager_user: User,
    path, _model, _code, _name,
):
    c = client_as(admin_user)
    target = _dm_dept_id(department_manager_user)
    for i in range(3):
        c.post(
            f"/api/admin/{path}",
            json={"department_id": target, "code": f"X{i}", "name": f"Item {i}"},
        )
    r = c.get(f"/api/admin/{path}?limit=2&offset=0")
    body = r.json()
    assert body["total"] == 3
    assert len(body["items"]) == 2
    r2 = c.get(f"/api/admin/{path}?limit=2&offset=2")
    assert r2.json()["total"] == 3
    assert len(r2.json()["items"]) == 1


# ---- dept-scope visibility ----------------------------------------------


@pytest.mark.parametrize("path,_model,code,name", DEPT_SCOPED)
def test_viewer_does_not_see_other_dept_item(
    client_as, admin_user: User, viewer_user: User, db_session: Session,
    path, _model, code, name,
):
    other = _make_dept(db_session, code=f"OTH_{path[:3].upper()}")
    db_session.commit()
    created = (
        client_as(admin_user)
        .post(
            f"/api/admin/{path}",
            json={"department_id": str(other.id), "code": code, "name": name},
        )
        .json()
    )
    r = client_as(viewer_user).get(f"/api/admin/{path}")
    assert r.json()["total"] == 0
    g = client_as(viewer_user).get(f"/api/admin/{path}/{created['id']}")
    assert g.status_code == 404


@pytest.mark.parametrize("path,_model,code,name", DEPT_SCOPED)
def test_dm_cannot_patch_in_other_dept(
    client_as, admin_user: User, department_manager_user: User,
    db_session: Session, path, _model, code, name,
):
    other = _make_dept(db_session, code=f"OTH2_{path[:3].upper()}")
    db_session.commit()
    created = (
        client_as(admin_user)
        .post(
            f"/api/admin/{path}",
            json={"department_id": str(other.id), "code": code, "name": name},
        )
        .json()
    )
    r = client_as(department_manager_user).patch(
        f"/api/admin/{path}/{created['id']}", json={"name": "blocked"}
    )
    assert r.status_code == 403
