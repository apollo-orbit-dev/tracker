"""Phase 1.10 — admin user-management endpoints."""
from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.auth.passwords import verify_password
from backend.app.db.models import AuthProvider, Department, User, UserRole
from backend.app.db.session import get_db
from backend.app.auth.sessions import SESSION_COOKIE_NAME


# ---- list (grants surface) ----------------------------------------------


def test_list_includes_grants_with_dept_codes(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    dept = Department(code="UM_LIST", name="UM List Dept")
    db_session.add(dept)
    db_session.flush()
    # Give the admin an additional non-admin grant in dept UM_LIST.
    db_session.add(
        UserRole(
            user_id=admin_user.id,
            role_id="department_manager",
            department_id=dept.id,
        )
    )
    db_session.commit()
    body = client_as(admin_user).get("/api/admin/users").json()
    me = next(u for u in body["users"] if u["email"] == "admin@example.com")
    grants = me["grants"]
    assert any(
        g["role_id"] == "admin" and g["department_id"] is None for g in grants
    )
    assert any(
        g["role_id"] == "department_manager"
        and g["department_code"] == "UM_LIST"
        for g in grants
    )


# ---- create -------------------------------------------------------------


def test_create_user_happy(client_as, admin_user: User):
    r = client_as(admin_user).post(
        "/api/admin/users",
        json={
            "email": "new@example.com",
            "display_name": "New User",
            "password": "verylongpassword",
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["email"] == "new@example.com"
    assert body["lifecycle_state"] == "active"
    assert body["roles"] == []


def test_create_user_duplicate_email_409(client_as, admin_user: User):
    payload = {
        "email": "dupe@example.com",
        "display_name": "Dupe",
        "password": "longenoughpass",
    }
    a = client_as(admin_user).post("/api/admin/users", json=payload)
    b = client_as(admin_user).post("/api/admin/users", json=payload)
    assert a.status_code == 201
    assert b.status_code == 409


def test_create_user_short_password_422(client_as, admin_user: User):
    r = client_as(admin_user).post(
        "/api/admin/users",
        json={
            "email": "shortpw@example.com",
            "display_name": "x",
            "password": "short",
        },
    )
    assert r.status_code == 422


def test_create_user_forbidden_for_non_admin(
    client_as,
    department_manager_user: User,
    project_editor_user: User,
    viewer_user: User,
):
    body = {
        "email": "nope@example.com",
        "display_name": "x",
        "password": "longenoughpw",
    }
    for u in (department_manager_user, project_editor_user, viewer_user):
        assert (
            client_as(u).post("/api/admin/users", json=body).status_code == 403
        )


# ---- update -------------------------------------------------------------


def test_update_display_name(client_as, admin_user: User, viewer_user: User):
    r = client_as(admin_user).patch(
        f"/api/admin/users/{viewer_user.id}",
        json={"display_name": "Renamed"},
    )
    assert r.status_code == 200
    assert r.json()["display_name"] == "Renamed"


def test_update_lifecycle(client_as, admin_user: User, viewer_user: User):
    r = client_as(admin_user).patch(
        f"/api/admin/users/{viewer_user.id}",
        json={"lifecycle_state": "deactivated"},
    )
    assert r.status_code == 200
    assert r.json()["lifecycle_state"] == "deactivated"


def test_update_self_lifecycle_blocked(client_as, admin_user: User):
    r = client_as(admin_user).patch(
        f"/api/admin/users/{admin_user.id}",
        json={"lifecycle_state": "deactivated"},
    )
    assert r.status_code == 422


# ---- reset password -----------------------------------------------------


def test_reset_password_changes_hash(
    client_as, admin_user: User, viewer_user: User, db_session: Session
):
    before = db_session.execute(
        # noqa: F401 -- pragma kept to avoid auto-import surprises
        AuthProvider.__table__.select().where(
            AuthProvider.user_id == viewer_user.id
        )
    ).first()
    r = client_as(admin_user).post(
        f"/api/admin/users/{viewer_user.id}/reset-password",
        json={"password": "brandnewpassword"},
    )
    assert r.status_code == 204
    db_session.expire_all()
    after = db_session.execute(
        AuthProvider.__table__.select().where(
            AuthProvider.user_id == viewer_user.id
        )
    ).first()
    assert before.password_hash != after.password_hash
    # The new hash verifies the new password.
    assert verify_password(after.password_hash, "brandnewpassword") is True


# ---- delete -------------------------------------------------------------


def test_delete_self_blocked(client_as, admin_user: User):
    r = client_as(admin_user).delete(f"/api/admin/users/{admin_user.id}")
    assert r.status_code == 422


def test_delete_soft_deletes(
    client_as, admin_user: User, viewer_user: User, db_session: Session
):
    r = client_as(admin_user).delete(f"/api/admin/users/{viewer_user.id}")
    assert r.status_code == 204
    db_session.expire_all()
    u = db_session.get(User, viewer_user.id)
    assert u.deleted_at is not None
    assert u.deleted_by == admin_user.id


def test_deleted_user_excluded_from_list(
    client_as, admin_user: User, viewer_user: User
):
    client_as(admin_user).delete(f"/api/admin/users/{viewer_user.id}")
    emails = [
        u["email"]
        for u in client_as(admin_user).get("/api/admin/users").json()["users"]
    ]
    assert "viewer@example.com" not in emails


# ---- org admin grant / revoke ------------------------------------------


def test_grant_org_admin_promotes(
    client_as, admin_user: User, viewer_user: User
):
    r = client_as(admin_user).post(
        f"/api/admin/users/{viewer_user.id}/admin"
    )
    assert r.status_code == 201
    body = r.json()
    assert "admin" in body["roles"]
    assert any(
        g["role_id"] == "admin" and g["department_id"] is None
        for g in body["grants"]
    )


def test_grant_org_admin_duplicate_409(
    client_as, admin_user: User, viewer_user: User
):
    client_as(admin_user).post(f"/api/admin/users/{viewer_user.id}/admin")
    r = client_as(admin_user).post(f"/api/admin/users/{viewer_user.id}/admin")
    assert r.status_code == 409


def test_revoke_org_admin_happy(
    client_as, admin_user: User, viewer_user: User
):
    client_as(admin_user).post(f"/api/admin/users/{viewer_user.id}/admin")
    r = client_as(admin_user).delete(
        f"/api/admin/users/{viewer_user.id}/admin"
    )
    assert r.status_code == 204


def test_revoke_own_org_admin_blocked(client_as, admin_user: User):
    r = client_as(admin_user).delete(
        f"/api/admin/users/{admin_user.id}/admin"
    )
    assert r.status_code == 422


def test_revoke_org_admin_when_not_admin_404(
    client_as, admin_user: User, viewer_user: User
):
    r = client_as(admin_user).delete(
        f"/api/admin/users/{viewer_user.id}/admin"
    )
    assert r.status_code == 404


# ---- org-viewer grant (Phase 3.0.2) -------------------------------------


def test_grant_org_viewer_promotes(
    client_as, admin_user: User, viewer_user: User
):
    r = client_as(admin_user).post(
        f"/api/admin/users/{viewer_user.id}/org-viewer"
    )
    assert r.status_code == 201
    body = r.json()
    assert any(
        g["role_id"] == "viewer" and g["department_id"] is None
        for g in body["grants"]
    )


def test_grant_org_viewer_duplicate_409(
    client_as, admin_user: User, viewer_user: User
):
    client_as(admin_user).post(
        f"/api/admin/users/{viewer_user.id}/org-viewer"
    )
    r = client_as(admin_user).post(
        f"/api/admin/users/{viewer_user.id}/org-viewer"
    )
    assert r.status_code == 409


def test_revoke_org_viewer_happy(
    client_as, admin_user: User, viewer_user: User
):
    client_as(admin_user).post(
        f"/api/admin/users/{viewer_user.id}/org-viewer"
    )
    r = client_as(admin_user).delete(
        f"/api/admin/users/{viewer_user.id}/org-viewer"
    )
    assert r.status_code == 204


def test_revoke_org_viewer_when_not_org_viewer_404(
    client_as, admin_user: User, viewer_user: User
):
    r = client_as(admin_user).delete(
        f"/api/admin/users/{viewer_user.id}/org-viewer"
    )
    assert r.status_code == 404


def test_revoke_own_org_viewer_allowed(client_as, admin_user: User):
    """No self-revoke guard — org viewer is read-only, can't lock anyone
    out. Distinguishes the org-viewer revoke from the org-admin revoke."""
    client_as(admin_user).post(
        f"/api/admin/users/{admin_user.id}/org-viewer"
    )
    r = client_as(admin_user).delete(
        f"/api/admin/users/{admin_user.id}/org-viewer"
    )
    assert r.status_code == 204


# ---- forbidden surface --------------------------------------------------


def test_all_mutations_forbidden_for_non_admin(
    client_as,
    department_manager_user: User,
    project_editor_user: User,
    viewer_user: User,
):
    """One sweep that confirms every mutation path is admin-only."""
    target = str(viewer_user.id)
    for u in (department_manager_user, project_editor_user, viewer_user):
        c = client_as(u)
        assert c.patch(
            f"/api/admin/users/{target}",
            json={"display_name": "x"},
        ).status_code == 403
        assert c.delete(f"/api/admin/users/{target}").status_code == 403
        assert c.post(
            f"/api/admin/users/{target}/reset-password",
            json={"password": "longenoughpw"},
        ).status_code == 403
        assert c.post(f"/api/admin/users/{target}/admin").status_code == 403
        assert c.delete(f"/api/admin/users/{target}/admin").status_code == 403
        assert c.post(
            f"/api/admin/users/{target}/org-viewer"
        ).status_code == 403
        assert c.delete(
            f"/api/admin/users/{target}/org-viewer"
        ).status_code == 403


# ---- audit log (Phase 3.1) ----------------------------------------------


def _audit_rows_by_user(db, role_id):
    from sqlalchemy import select
    from backend.app.db.models import AuditLog

    return list(
        db.execute(
            select(AuditLog).where(
                AuditLog.entity_type == "user_role",
                AuditLog.operation.in_(["grant", "revoke"]),
                AuditLog.changes["role_id"].astext == role_id,
            )
        ).scalars()
    )


def test_grant_org_admin_writes_audit_row(
    db_session, client_as, admin_user: User, viewer_user: User
):
    r = client_as(admin_user).post(
        f"/api/admin/users/{viewer_user.id}/admin"
    )
    assert r.status_code == 201
    rows = _audit_rows_by_user(db_session, "admin")
    matching = [
        row
        for row in rows
        if row.operation == "grant"
        and row.changes.get("user_id") == str(viewer_user.id)
    ]
    assert len(matching) == 1
    assert matching[0].changed_by == admin_user.id
    assert matching[0].changes["department_id"] is None


def test_revoke_org_admin_writes_audit_row(
    db_session, client_as, admin_user: User, viewer_user: User
):
    c = client_as(admin_user)
    c.post(f"/api/admin/users/{viewer_user.id}/admin")
    r = c.delete(f"/api/admin/users/{viewer_user.id}/admin")
    assert r.status_code == 204
    rows = _audit_rows_by_user(db_session, "admin")
    matching = [
        row
        for row in rows
        if row.operation == "revoke"
        and row.changes.get("user_id") == str(viewer_user.id)
    ]
    assert len(matching) == 1


def test_grant_org_viewer_writes_audit_row(
    db_session, client_as, admin_user: User, viewer_user: User
):
    r = client_as(admin_user).post(
        f"/api/admin/users/{viewer_user.id}/org-viewer"
    )
    assert r.status_code == 201
    rows = _audit_rows_by_user(db_session, "viewer")
    matching = [
        row
        for row in rows
        if row.operation == "grant"
        and row.changes.get("user_id") == str(viewer_user.id)
        and row.changes.get("department_id") is None
    ]
    assert len(matching) == 1


def test_revoke_org_viewer_writes_audit_row(
    db_session, client_as, admin_user: User, viewer_user: User
):
    c = client_as(admin_user)
    c.post(f"/api/admin/users/{viewer_user.id}/org-viewer")
    r = c.delete(f"/api/admin/users/{viewer_user.id}/org-viewer")
    assert r.status_code == 204
    rows = _audit_rows_by_user(db_session, "viewer")
    matching = [
        row
        for row in rows
        if row.operation == "revoke"
        and row.changes.get("user_id") == str(viewer_user.id)
        and row.changes.get("department_id") is None
    ]
    assert len(matching) == 1
