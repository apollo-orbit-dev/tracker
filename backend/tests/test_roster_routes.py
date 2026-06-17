"""Permission-matrix tests for the Phase 1.9.4 roster endpoints."""
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.auth.passwords import hash_password
from backend.app.db.models import AuthProvider, Department, User, UserRole


# Helpers ------------------------------------------------------------------


def _make_dept(db: Session, code: str) -> Department:
    d = Department(code=code, name=f"Dept {code}")
    db.add(d)
    db.flush()
    return d


def _make_user(db: Session, email: str) -> User:
    u = User(email=email, display_name=email.split("@")[0])
    db.add(u)
    db.flush()
    db.add(
        AuthProvider(
            user_id=u.id,
            provider="local",
            password_hash=hash_password("longenoughpw"),
        )
    )
    db.flush()
    return u


def _grant(db: Session, user_id, role: str, dept_id) -> UserRole:
    ur = UserRole(user_id=user_id, role_id=role, department_id=dept_id)
    db.add(ur)
    db.flush()
    return ur


# /api/departments/{dept_id}/roster ---------------------------------------


def test_roster_list_requires_auth(client: TestClient, db_session: Session):
    d = _make_dept(db_session, "RREQ")
    db_session.commit()
    r = client.get(f"/api/departments/{d.id}/roster")
    assert r.status_code == 401


def test_roster_list_viewer_403(
    client_as: Callable[[User], TestClient],
    viewer_user: User,
    db_session: Session,
):
    d = _make_dept(db_session, "RVIEW")
    db_session.commit()
    r = client_as(viewer_user).get(f"/api/departments/{d.id}/roster")
    assert r.status_code == 403


def test_roster_list_project_editor_403(
    client_as: Callable[[User], TestClient],
    project_editor_user: User,
    db_session: Session,
):
    d = _make_dept(db_session, "RPE")
    db_session.commit()
    r = client_as(project_editor_user).get(f"/api/departments/{d.id}/roster")
    assert r.status_code == 403


def test_roster_list_dm_in_other_dept_403(
    client_as: Callable[[User], TestClient],
    department_manager_user: User,
    db_session: Session,
):
    other = _make_dept(db_session, "ROTHER")
    db_session.commit()
    r = client_as(department_manager_user).get(
        f"/api/departments/{other.id}/roster"
    )
    assert r.status_code == 403


def test_roster_list_dm_in_dept_ok(
    client_as: Callable[[User], TestClient],
    department_manager_user: User,
    db_session: Session,
):
    target_dept_id = department_manager_user.user_roles[0].department_id
    db_session.commit()
    r = client_as(department_manager_user).get(
        f"/api/departments/{target_dept_id}/roster"
    )
    assert r.status_code == 200
    body = r.json()
    # The DM themself shows up in their dept's roster.
    assert body["total"] >= 1
    emails = [e["email"] for e in body["items"]]
    assert "dm@example.com" in emails


def test_roster_list_admin_ok_for_any_dept(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    d = _make_dept(db_session, "RADMIN")
    db_session.commit()
    r = client_as(admin_user).get(f"/api/departments/{d.id}/roster")
    assert r.status_code == 200


# Grant -------------------------------------------------------------------


def test_grant_admin_can_grant_anywhere(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    d = _make_dept(db_session, "GADM")
    target = _make_user(db_session, "grantee-a@example.com")
    db_session.commit()
    r = client_as(admin_user).post(
        f"/api/departments/{d.id}/roster",
        json={"user_id": str(target.id), "role_id": "viewer"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["role_id"] == "viewer"
    assert body["user_id"] == str(target.id)


def test_grant_dm_can_grant_in_own_dept(
    client_as: Callable[[User], TestClient],
    department_manager_user: User,
    db_session: Session,
):
    dm_dept_id = department_manager_user.user_roles[0].department_id
    target = _make_user(db_session, "grantee-dm@example.com")
    db_session.commit()
    r = client_as(department_manager_user).post(
        f"/api/departments/{dm_dept_id}/roster",
        json={"user_id": str(target.id), "role_id": "project_editor"},
    )
    assert r.status_code == 201


def test_grant_dm_cannot_grant_in_other_dept(
    client_as: Callable[[User], TestClient],
    department_manager_user: User,
    db_session: Session,
):
    other = _make_dept(db_session, "GOTH")
    target = _make_user(db_session, "grantee-other@example.com")
    db_session.commit()
    r = client_as(department_manager_user).post(
        f"/api/departments/{other.id}/roster",
        json={"user_id": str(target.id), "role_id": "viewer"},
    )
    assert r.status_code == 403


def test_grant_dm_can_promote_to_dm(
    client_as: Callable[[User], TestClient],
    department_manager_user: User,
    db_session: Session,
):
    dm_dept_id = department_manager_user.user_roles[0].department_id
    target = _make_user(db_session, "promote@example.com")
    db_session.commit()
    r = client_as(department_manager_user).post(
        f"/api/departments/{dm_dept_id}/roster",
        json={"user_id": str(target.id), "role_id": "department_manager"},
    )
    assert r.status_code == 201


def test_grant_rejects_admin_role(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    """admin is org-wide; not grantable through the dept roster API."""
    d = _make_dept(db_session, "GNADM")
    target = _make_user(db_session, "no-admin@example.com")
    db_session.commit()
    r = client_as(admin_user).post(
        f"/api/departments/{d.id}/roster",
        json={"user_id": str(target.id), "role_id": "admin"},
    )
    assert r.status_code == 422


def test_grant_duplicate_409(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    d = _make_dept(db_session, "GDUP")
    target = _make_user(db_session, "dup-grantee@example.com")
    db_session.commit()
    a = client_as(admin_user).post(
        f"/api/departments/{d.id}/roster",
        json={"user_id": str(target.id), "role_id": "viewer"},
    )
    assert a.status_code == 201
    b = client_as(admin_user).post(
        f"/api/departments/{d.id}/roster",
        json={"user_id": str(target.id), "role_id": "viewer"},
    )
    assert b.status_code == 409


def test_grant_unknown_user_422(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    d = _make_dept(db_session, "GUNK")
    db_session.commit()
    r = client_as(admin_user).post(
        f"/api/departments/{d.id}/roster",
        json={
            "user_id": "00000000-0000-0000-0000-000000000000",
            "role_id": "viewer",
        },
    )
    assert r.status_code == 422


# Update role ------------------------------------------------------------


def test_update_role_admin_can_change_role(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    d = _make_dept(db_session, "UPRA")
    target = _make_user(db_session, "uprole-a@example.com")
    ur = _grant(db_session, target.id, "viewer", d.id)
    db_session.commit()
    r = client_as(admin_user).patch(
        f"/api/departments/{d.id}/roster/{ur.id}",
        json={"role_id": "project_editor"},
    )
    assert r.status_code == 200
    assert r.json()["role_id"] == "project_editor"


def test_update_role_dm_can_change_in_own_dept(
    client_as: Callable[[User], TestClient],
    department_manager_user: User,
    db_session: Session,
):
    dm_dept_id = department_manager_user.user_roles[0].department_id
    target = _make_user(db_session, "uprole-dm@example.com")
    ur = _grant(db_session, target.id, "viewer", dm_dept_id)
    db_session.commit()
    r = client_as(department_manager_user).patch(
        f"/api/departments/{dm_dept_id}/roster/{ur.id}",
        json={"role_id": "department_manager"},
    )
    assert r.status_code == 200
    assert r.json()["role_id"] == "department_manager"


def test_update_role_dm_cannot_change_in_other_dept(
    client_as: Callable[[User], TestClient],
    department_manager_user: User,
    db_session: Session,
):
    other = _make_dept(db_session, "UPROTH")
    target = _make_user(db_session, "uprole-oth@example.com")
    ur = _grant(db_session, target.id, "viewer", other.id)
    db_session.commit()
    r = client_as(department_manager_user).patch(
        f"/api/departments/{other.id}/roster/{ur.id}",
        json={"role_id": "project_editor"},
    )
    assert r.status_code == 403


def test_update_role_target_already_held_409(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    """Promoting a viewer to DM is fine. Updating their viewer row to
    project_editor when they ALSO hold project_editor already → 409."""
    d = _make_dept(db_session, "UPDUP")
    target = _make_user(db_session, "uprole-dup@example.com")
    viewer_row = _grant(db_session, target.id, "viewer", d.id)
    _grant(db_session, target.id, "project_editor", d.id)
    db_session.commit()
    r = client_as(admin_user).patch(
        f"/api/departments/{d.id}/roster/{viewer_row.id}",
        json={"role_id": "project_editor"},
    )
    assert r.status_code == 409


def test_update_role_rejects_admin(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    d = _make_dept(db_session, "UPADM")
    target = _make_user(db_session, "uprole-adm@example.com")
    ur = _grant(db_session, target.id, "viewer", d.id)
    db_session.commit()
    r = client_as(admin_user).patch(
        f"/api/departments/{d.id}/roster/{ur.id}",
        json={"role_id": "admin"},
    )
    assert r.status_code == 422


def test_update_role_grant_in_wrong_dept_404(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    a = _make_dept(db_session, "UPWA")
    b = _make_dept(db_session, "UPWB")
    target = _make_user(db_session, "uprole-w@example.com")
    ur_in_b = _grant(db_session, target.id, "viewer", b.id)
    db_session.commit()
    r = client_as(admin_user).patch(
        f"/api/departments/{a.id}/roster/{ur_in_b.id}",
        json={"role_id": "project_editor"},
    )
    assert r.status_code == 404


# Revoke ------------------------------------------------------------------


def test_revoke_admin_can_revoke(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    d = _make_dept(db_session, "RVADM")
    target = _make_user(db_session, "rev-a@example.com")
    ur = _grant(db_session, target.id, "viewer", d.id)
    db_session.commit()
    r = client_as(admin_user).delete(
        f"/api/departments/{d.id}/roster/{ur.id}"
    )
    assert r.status_code == 204


def test_revoke_dm_cannot_revoke_in_other_dept(
    client_as: Callable[[User], TestClient],
    department_manager_user: User,
    db_session: Session,
):
    other = _make_dept(db_session, "RVOTH")
    target = _make_user(db_session, "rev-o@example.com")
    ur = _grant(db_session, target.id, "viewer", other.id)
    db_session.commit()
    r = client_as(department_manager_user).delete(
        f"/api/departments/{other.id}/roster/{ur.id}"
    )
    assert r.status_code == 403


def test_revoke_grant_in_wrong_dept_404(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    """Caller can manage dept A but the grant is in dept B. 404 (not 403)
    — the caller can manage A, so the issue is the path/id mismatch."""
    a = _make_dept(db_session, "RWA")
    b = _make_dept(db_session, "RWB")
    target = _make_user(db_session, "rev-w@example.com")
    ur_in_b = _grant(db_session, target.id, "viewer", b.id)
    db_session.commit()
    # Caller manages A (org admin), but URL says dept A while grant is in B.
    r = client_as(admin_user).delete(
        f"/api/departments/{a.id}/roster/{ur_in_b.id}"
    )
    assert r.status_code == 404


# /api/users/picker -------------------------------------------------------


def test_picker_admin_ok(
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    r = client_as(admin_user).get("/api/users/picker")
    assert r.status_code == 200
    assert r.json()["total"] >= 1


def test_picker_dm_ok(
    client_as: Callable[[User], TestClient],
    department_manager_user: User,
):
    r = client_as(department_manager_user).get("/api/users/picker")
    assert r.status_code == 200


def test_picker_viewer_403(
    client_as: Callable[[User], TestClient],
    viewer_user: User,
):
    r = client_as(viewer_user).get("/api/users/picker")
    assert r.status_code == 403


def test_picker_editor_403(
    client_as: Callable[[User], TestClient],
    project_editor_user: User,
):
    r = client_as(project_editor_user).get("/api/users/picker")
    assert r.status_code == 403


# ---- audit log (Phase 3.1) ----------------------------------------------


def _audit_user_role_rows(db, *, operation=None, user_id=None, role_id=None):
    from sqlalchemy import select
    from backend.app.db.models import AuditLog

    q = select(AuditLog).where(AuditLog.entity_type == "user_role")
    if operation:
        q = q.where(AuditLog.operation == operation)
    rows = list(db.execute(q).scalars())
    if user_id is not None:
        rows = [r for r in rows if r.changes.get("user_id") == str(user_id)]
    if role_id is not None:
        rows = [r for r in rows if r.changes.get("role_id") == role_id]
    return rows


def test_grant_role_writes_audit_row(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    d = _make_dept(db_session, "AUDG")
    target = _make_user(db_session, "audg@example.com")
    db_session.commit()
    r = client_as(admin_user).post(
        f"/api/departments/{d.id}/roster",
        json={"user_id": str(target.id), "role_id": "project_editor"},
    )
    assert r.status_code == 201
    rows = _audit_user_role_rows(
        db_session,
        operation="grant",
        user_id=target.id,
        role_id="project_editor",
    )
    assert len(rows) == 1
    assert rows[0].changed_by == admin_user.id
    assert rows[0].changes["department_id"] == str(d.id)


def test_update_role_writes_audit_row(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    d = _make_dept(db_session, "AUDU")
    target = _make_user(db_session, "audu@example.com")
    ur = _grant(db_session, target.id, "viewer", d.id)
    db_session.commit()
    r = client_as(admin_user).patch(
        f"/api/departments/{d.id}/roster/{ur.id}",
        json={"role_id": "project_editor"},
    )
    assert r.status_code == 200
    from sqlalchemy import select
    from backend.app.db.models import AuditLog

    rows = list(
        db_session.execute(
            select(AuditLog).where(
                AuditLog.entity_type == "user_role",
                AuditLog.entity_id == ur.id,
                AuditLog.operation == "update",
            )
        ).scalars()
    )
    assert len(rows) == 1
    assert rows[0].changes["role_id"] == ["viewer", "project_editor"]


def test_revoke_role_writes_audit_row(
    client_as: Callable[[User], TestClient],
    admin_user: User,
    db_session: Session,
):
    d = _make_dept(db_session, "AUDR")
    target = _make_user(db_session, "audr@example.com")
    ur = _grant(db_session, target.id, "viewer", d.id)
    db_session.commit()
    r = client_as(admin_user).delete(
        f"/api/departments/{d.id}/roster/{ur.id}"
    )
    assert r.status_code == 204
    rows = _audit_user_role_rows(
        db_session, operation="revoke", user_id=target.id, role_id="viewer"
    )
    assert len(rows) == 1
    assert rows[0].changes["department_id"] == str(d.id)
