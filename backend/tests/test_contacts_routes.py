"""Route tests for the department-scoped contacts directory (Phase 1.9.2).

Permission model:
- viewer (in dept) can READ contacts in that dept (200)
- viewer cannot mutate (403)
- department_manager in dept can FULL-CRUD contacts in that dept
- department_manager cannot mutate contacts in OTHER depts (403)
- admin (org) can do anything anywhere

Scope:
- Lists and gets are filtered to the caller's accessible departments;
  out-of-scope ids return 404 (indistinguishable from missing).
"""
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.db.models import Department, User
from backend.tests.conftest import _make_dept, _make_user


# ---- auth gating --------------------------------------------------------


def test_list_contacts_requires_auth(client: TestClient):
    assert client.get("/api/admin/contacts").status_code == 401


def test_list_returns_empty_for_viewer_with_no_contacts(
    client_as, viewer_user: User
):
    c = client_as(viewer_user)
    r = c.get("/api/admin/contacts")
    assert r.status_code == 200
    assert r.json()["total"] == 0


def test_list_allowed_for_editor(
    client_as, project_editor_user: User
):
    c = client_as(project_editor_user)
    assert c.get("/api/admin/contacts").status_code == 200


def _dept_id(department_manager_user: User) -> str:
    return str(department_manager_user.user_roles[0].department_id)


def test_create_requires_dm_in_target_dept(
    client_as, project_editor_user: User, admin_user: User, department_manager_user: User
):
    target = _dept_id(department_manager_user)
    body = {
        "department_id": target,
        "name": "Jane Doe",
        "email": "jane@example.com",
        "phone": "555-0100",
        "organization": "Acme",
    }
    # project_editor (different dept) → 403
    assert (
        client_as(project_editor_user)
        .post("/api/admin/contacts", json=body)
        .status_code
        == 403
    )
    # DM in this dept → 201
    assert (
        client_as(department_manager_user)
        .post("/api/admin/contacts", json=body)
        .status_code
        == 201
    )


def test_create_admin_can_use_any_dept(
    client_as, admin_user: User, db_session: Session
):
    dept = _make_dept(db_session, code="ANYDEPT", name="Any Dept")
    db_session.commit()
    c = client_as(admin_user)
    r = c.post(
        "/api/admin/contacts",
        json={"department_id": str(dept.id), "name": "X"},
    )
    assert r.status_code == 201, r.text


# ---- CRUD happy paths ---------------------------------------------------


def test_create_minimal(
    client_as, admin_user: User, department_manager_user: User
):
    c = client_as(admin_user)
    target = _dept_id(department_manager_user)
    r = c.post(
        "/api/admin/contacts",
        json={"department_id": target, "name": "Just a Name"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["name"] == "Just a Name"
    assert body["email"] is None
    assert body["phone"] is None
    assert body["organization"] is None
    assert body["department_id"] == target


def test_create_then_list(
    client_as, admin_user: User, department_manager_user: User
):
    c = client_as(admin_user)
    target = _dept_id(department_manager_user)
    c.post(
        "/api/admin/contacts",
        json={
            "department_id": target,
            "name": "Alice",
            "email": "alice@example.com",
        },
    )
    c.post(
        "/api/admin/contacts",
        json={
            "department_id": target,
            "name": "Bob",
            "email": "bob@example.com",
        },
    )
    body = c.get("/api/admin/contacts").json()
    assert body["total"] == 2
    # Sorted by name ascending.
    assert [i["name"] for i in body["items"]] == ["Alice", "Bob"]


def test_patch_contact(
    client_as, admin_user: User, department_manager_user: User
):
    c = client_as(admin_user)
    target = _dept_id(department_manager_user)
    created = c.post(
        "/api/admin/contacts",
        json={
            "department_id": target,
            "name": "Old Name",
            "email": "old@example.com",
        },
    ).json()
    r = c.patch(
        f"/api/admin/contacts/{created['id']}",
        json={"name": "New Name"},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "New Name"


def test_delete_soft_deletes(
    client_as, admin_user: User, department_manager_user: User
):
    c = client_as(admin_user)
    target = _dept_id(department_manager_user)
    created = c.post(
        "/api/admin/contacts",
        json={"department_id": target, "name": "Bye"},
    ).json()
    assert c.delete(f"/api/admin/contacts/{created['id']}").status_code == 204
    assert c.get(f"/api/admin/contacts/{created['id']}").status_code == 404


# ---- uniqueness (per-department) ----------------------------------------


def test_duplicate_email_409_same_dept(
    client_as, admin_user: User, department_manager_user: User
):
    c = client_as(admin_user)
    target = _dept_id(department_manager_user)
    c.post(
        "/api/admin/contacts",
        json={
            "department_id": target,
            "name": "First",
            "email": "same@example.com",
        },
    )
    r = c.post(
        "/api/admin/contacts",
        json={
            "department_id": target,
            "name": "Second",
            "email": "same@example.com",
        },
    )
    assert r.status_code == 409


def test_same_email_allowed_across_depts(
    client_as, admin_user: User, db_session: Session
):
    """Per-dept unique → same email in two different depts is fine."""
    dept_a = _make_dept(db_session, code="DEPT_A_UNIQ")
    dept_b = _make_dept(db_session, code="DEPT_B_UNIQ")
    db_session.commit()
    c = client_as(admin_user)
    a = c.post(
        "/api/admin/contacts",
        json={
            "department_id": str(dept_a.id),
            "name": "A",
            "email": "shared@example.com",
        },
    )
    b = c.post(
        "/api/admin/contacts",
        json={
            "department_id": str(dept_b.id),
            "name": "B",
            "email": "shared@example.com",
        },
    )
    assert a.status_code == 201
    assert b.status_code == 201


def test_two_null_emails_ok(
    client_as, admin_user: User, department_manager_user: User
):
    c = client_as(admin_user)
    target = _dept_id(department_manager_user)
    a = c.post(
        "/api/admin/contacts",
        json={"department_id": target, "name": "NoEmail A"},
    )
    b = c.post(
        "/api/admin/contacts",
        json={"department_id": target, "name": "NoEmail B"},
    )
    assert a.status_code == 201
    assert b.status_code == 201


def test_recreate_email_after_soft_delete(
    client_as, admin_user: User, department_manager_user: User
):
    c = client_as(admin_user)
    target = _dept_id(department_manager_user)
    a = c.post(
        "/api/admin/contacts",
        json={
            "department_id": target,
            "name": "First",
            "email": "reuse@example.com",
        },
    ).json()
    c.delete(f"/api/admin/contacts/{a['id']}")
    r = c.post(
        "/api/admin/contacts",
        json={
            "department_id": target,
            "name": "Second",
            "email": "reuse@example.com",
        },
    )
    assert r.status_code == 201


# ---- validation ---------------------------------------------------------


def test_create_invalid_email_422(
    client_as, admin_user: User, department_manager_user: User
):
    c = client_as(admin_user)
    target = _dept_id(department_manager_user)
    r = c.post(
        "/api/admin/contacts",
        json={
            "department_id": target,
            "name": "Bad email",
            "email": "not-an-email",
        },
    )
    assert r.status_code == 422


def test_create_missing_department_422(
    client_as, admin_user: User
):
    c = client_as(admin_user)
    r = c.post("/api/admin/contacts", json={"name": "no dept"})
    assert r.status_code == 422


def test_create_unknown_department_422(
    client_as, admin_user: User
):
    c = client_as(admin_user)
    r = c.post(
        "/api/admin/contacts",
        json={
            "department_id": "00000000-0000-0000-0000-000000000000",
            "name": "x",
        },
    )
    assert r.status_code == 422


def test_get_missing_404(client_as, admin_user: User):
    c = client_as(admin_user)
    r = c.get("/api/admin/contacts/00000000-0000-0000-0000-000000000000")
    assert r.status_code == 404


# ---- dept-scope visibility ----------------------------------------------


def test_viewer_in_one_dept_does_not_see_other_dept_contact(
    client_as,
    admin_user: User,
    viewer_user: User,
    db_session: Session,
):
    # admin creates a contact in a different dept (NOT viewer's dept)
    other = _make_dept(db_session, code="OTHER_DEPT_VIS")
    db_session.commit()
    body = c1_body = {
        "department_id": str(other.id),
        "name": "Other Dept Contact",
        "email": "other@example.com",
    }
    created = (
        client_as(admin_user)
        .post("/api/admin/contacts", json=c1_body)
        .json()
    )
    # viewer sees empty list
    viewer = client_as(viewer_user)
    r = viewer.get("/api/admin/contacts")
    assert r.status_code == 200
    assert r.json()["total"] == 0
    # GET-by-id returns 404 (indistinguishable from missing)
    g = viewer.get(f"/api/admin/contacts/{created['id']}")
    assert g.status_code == 404


def test_dm_cannot_patch_contact_in_other_dept(
    client_as,
    admin_user: User,
    department_manager_user: User,
    db_session: Session,
):
    other = _make_dept(db_session, code="OTHER_DM_PATCH")
    db_session.commit()
    created = (
        client_as(admin_user)
        .post(
            "/api/admin/contacts",
            json={"department_id": str(other.id), "name": "x"},
        )
        .json()
    )
    r = client_as(department_manager_user).patch(
        f"/api/admin/contacts/{created['id']}", json={"name": "y"}
    )
    assert r.status_code == 403


def test_dm_with_two_depts_sees_both(
    client_as, admin_user: User, db_session: Session
):
    """A DM in two depts sees contacts from both depts in the list."""
    dept_a = _make_dept(db_session, code="MULTI_A")
    dept_b = _make_dept(db_session, code="MULTI_B")
    db_session.flush()
    # Make a user with DM in both
    from backend.app.db.models import AuthProvider, UserRole
    from backend.app.auth.passwords import hash_password
    user = User(email="multi@example.com", display_name="Multi")
    db_session.add(user)
    db_session.flush()
    db_session.add(
        UserRole(
            user_id=user.id,
            role_id="department_manager",
            department_id=dept_a.id,
        )
    )
    db_session.add(
        UserRole(
            user_id=user.id,
            role_id="department_manager",
            department_id=dept_b.id,
        )
    )
    db_session.add(
        AuthProvider(
            user_id=user.id,
            provider="local",
            password_hash=hash_password("longenoughpw"),
        )
    )
    db_session.commit()
    # admin seeds one contact in each
    a_admin = client_as(admin_user)
    a_admin.post(
        "/api/admin/contacts",
        json={"department_id": str(dept_a.id), "name": "A-side"},
    )
    a_admin.post(
        "/api/admin/contacts",
        json={"department_id": str(dept_b.id), "name": "B-side"},
    )
    # multi-dept DM sees both
    r = client_as(user).get("/api/admin/contacts")
    assert r.status_code == 200
    names = sorted(i["name"] for i in r.json()["items"])
    assert names == ["A-side", "B-side"]
