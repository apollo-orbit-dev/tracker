"""Integration tests for `/api/projects/{pid}/access` (Phase 3.0.3).

Auth model:
- GET — anyone who can view the project. Returns explicit grants only.
- POST / DELETE — admin OR department_manager-of-the-project's-dept.
- A user without read access to the project gets 404 (not 403) — matches
  the existing scope-leak prevention behavior for project sub-routes.
"""
from collections.abc import Callable

from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.auth.passwords import hash_password
from backend.app.db.models import (
    AuthProvider,
    Client,
    Department,
    Discipline,
    ProjectRoleAssignment,
    Template,
    User,
    UserRole,
)


# Helpers ------------------------------------------------------------------


def _make_dept_with_template(
    db: Session, code: str
) -> tuple[Department, Template]:
    d = Department(code=code, name=f"Dept {code}")
    db.add(d)
    db.flush()
    cl = Client(code=f"CL_{code}", name="cl", department_id=d.id)
    di = Discipline(code=f"DI_{code}", name="di", department_id=d.id)
    db.add_all([cl, di])
    db.flush()
    t = Template(
        name=f"t-{code}",
        department_id=d.id,
        client_id=cl.id,
        discipline_id=di.id,
    )
    db.add(t)
    db.flush()
    return d, t


def _user_with_role(
    db: Session, email: str, role: str, dept_id
) -> User:
    user = User(email=email, display_name=email.split("@")[0])
    db.add(user)
    db.flush()
    db.add(UserRole(user_id=user.id, role_id=role, department_id=dept_id))
    db.add(
        AuthProvider(
            user_id=user.id,
            provider="local",
            password_hash=hash_password("longenoughpw"),
        )
    )
    db.flush()
    return user


def _make_user(db: Session, email: str) -> User:
    user = User(email=email, display_name=email.split("@")[0])
    db.add(user)
    db.flush()
    db.add(
        AuthProvider(
            user_id=user.id,
            provider="local",
            password_hash=hash_password("longenoughpw"),
        )
    )
    db.flush()
    return user


def _create_project(client: TestClient, template_id) -> dict:
    r = client.post(
        "/api/projects",
        json={
            "project_number": f"PA-{template_id.hex[:6]}",
            "title": "access-test",
            "template_id": str(template_id),
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


# GET — list -------------------------------------------------------------


def test_list_access_empty_for_fresh_project(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t = _make_dept_with_template(db_session, "PALE")
    db_session.commit()
    proj = _create_project(client_as(admin_user), t.id)
    body = client_as(admin_user).get(f"/api/projects/{proj['id']}/access").json()
    assert body == {"items": [], "total": 0}


def test_list_access_returns_existing_grants(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t = _make_dept_with_template(db_session, "PALG")
    grantee = _make_user(db_session, "grantee@pa.test")
    db_session.commit()
    proj = _create_project(client_as(admin_user), t.id)
    db_session.add(
        ProjectRoleAssignment(
            user_id=grantee.id, project_id=proj["id"], granted_by=admin_user.id
        )
    )
    db_session.commit()
    body = client_as(admin_user).get(f"/api/projects/{proj['id']}/access").json()
    assert body["total"] == 1
    assert body["items"][0]["user_id"] == str(grantee.id)
    assert body["items"][0]["email"] == "grantee@pa.test"
    assert body["items"][0]["granted_by"] == str(admin_user.id)


def test_list_access_viewer_in_dept_can_read(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    """A dept-scope viewer (not a DM) can still read the access list —
    they have view access to the project."""
    a, t = _make_dept_with_template(db_session, "PALV")
    viewer = _user_with_role(db_session, "palv@pa.test", "viewer", a.id)
    db_session.commit()
    proj = _create_project(client_as(admin_user), t.id)
    r = client_as(viewer).get(f"/api/projects/{proj['id']}/access")
    assert r.status_code == 200


def test_list_access_cross_dept_user_404(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t_a = _make_dept_with_template(db_session, "PALC_A")
    b, _ = _make_dept_with_template(db_session, "PALC_B")
    outsider = _user_with_role(db_session, "outs@pa.test", "viewer", b.id)
    db_session.commit()
    proj = _create_project(client_as(admin_user), t_a.id)
    r = client_as(outsider).get(f"/api/projects/{proj['id']}/access")
    assert r.status_code == 404


# POST — grant -----------------------------------------------------------


def test_grant_access_admin_happy(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t = _make_dept_with_template(db_session, "PAGH")
    grantee = _make_user(db_session, "pgh@pa.test")
    db_session.commit()
    proj = _create_project(client_as(admin_user), t.id)
    r = client_as(admin_user).post(
        f"/api/projects/{proj['id']}/access",
        json={"user_id": str(grantee.id)},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["user_id"] == str(grantee.id)
    assert body["granted_by"] == str(admin_user.id)


def test_grant_access_dm_of_dept_happy(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t = _make_dept_with_template(db_session, "PAGD")
    dm = _user_with_role(db_session, "pdm@pa.test", "department_manager", a.id)
    grantee = _make_user(db_session, "pgd@pa.test")
    db_session.commit()
    proj = _create_project(client_as(admin_user), t.id)
    r = client_as(dm).post(
        f"/api/projects/{proj['id']}/access",
        json={"user_id": str(grantee.id)},
    )
    assert r.status_code == 201


def test_grant_access_duplicate_409(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t = _make_dept_with_template(db_session, "PAGDUP")
    grantee = _make_user(db_session, "pdup@pa.test")
    db_session.commit()
    proj = _create_project(client_as(admin_user), t.id)
    c = client_as(admin_user)
    c.post(
        f"/api/projects/{proj['id']}/access",
        json={"user_id": str(grantee.id)},
    )
    r = c.post(
        f"/api/projects/{proj['id']}/access",
        json={"user_id": str(grantee.id)},
    )
    assert r.status_code == 409


def test_grant_access_project_editor_in_dept_forbidden(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    """Project editor (not DM) in the project's dept cannot grant access —
    only admin or DM-of-dept."""
    a, t = _make_dept_with_template(db_session, "PAGE")
    pe = _user_with_role(db_session, "pge@pa.test", "project_editor", a.id)
    grantee = _make_user(db_session, "pge2@pa.test")
    db_session.commit()
    proj = _create_project(client_as(admin_user), t.id)
    r = client_as(pe).post(
        f"/api/projects/{proj['id']}/access",
        json={"user_id": str(grantee.id)},
    )
    assert r.status_code == 403


def test_grant_access_dm_of_other_dept_forbidden(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t_a = _make_dept_with_template(db_session, "PAGO_A")
    b, _ = _make_dept_with_template(db_session, "PAGO_B")
    dm_b = _user_with_role(db_session, "dmb@pa.test", "department_manager", b.id)
    grantee = _make_user(db_session, "ogo@pa.test")
    db_session.commit()
    proj = _create_project(client_as(admin_user), t_a.id)
    # DM in B can see the access endpoint at all? Project is in A — DM-B
    # has no view on it, so we expect 404 (scope-leak prevention) rather
    # than 403.
    r = client_as(dm_b).post(
        f"/api/projects/{proj['id']}/access",
        json={"user_id": str(grantee.id)},
    )
    assert r.status_code == 404


def test_grant_access_unknown_user_404(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    import uuid as _uuid
    a, t = _make_dept_with_template(db_session, "PAGU")
    db_session.commit()
    proj = _create_project(client_as(admin_user), t.id)
    r = client_as(admin_user).post(
        f"/api/projects/{proj['id']}/access",
        json={"user_id": str(_uuid.uuid4())},
    )
    assert r.status_code == 404


# DELETE — revoke --------------------------------------------------------


def test_revoke_access_admin_happy(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t = _make_dept_with_template(db_session, "PARH")
    grantee = _make_user(db_session, "rgh@pa.test")
    db_session.commit()
    proj = _create_project(client_as(admin_user), t.id)
    c = client_as(admin_user)
    c.post(
        f"/api/projects/{proj['id']}/access",
        json={"user_id": str(grantee.id)},
    )
    r = c.delete(f"/api/projects/{proj['id']}/access/{grantee.id}")
    assert r.status_code == 204


def test_revoke_access_when_not_granted_404(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t = _make_dept_with_template(db_session, "PARN")
    other = _make_user(db_session, "rno@pa.test")
    db_session.commit()
    proj = _create_project(client_as(admin_user), t.id)
    r = client_as(admin_user).delete(
        f"/api/projects/{proj['id']}/access/{other.id}"
    )
    assert r.status_code == 404


def test_revoke_access_project_editor_forbidden(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t = _make_dept_with_template(db_session, "PARE")
    pe = _user_with_role(db_session, "rpe@pa.test", "project_editor", a.id)
    grantee = _make_user(db_session, "rpge@pa.test")
    db_session.commit()
    proj = _create_project(client_as(admin_user), t.id)
    client_as(admin_user).post(
        f"/api/projects/{proj['id']}/access",
        json={"user_id": str(grantee.id)},
    )
    r = client_as(pe).delete(f"/api/projects/{proj['id']}/access/{grantee.id}")
    assert r.status_code == 403


# ---- audit log (Phase 3.1) ----------------------------------------------


def _pra_audit_rows(db, operation, project_id, granted_user_id):
    import uuid as _uuid
    from sqlalchemy import select
    from backend.app.db.models import AuditLog

    rows = list(
        db.execute(
            select(AuditLog).where(
                AuditLog.entity_type == "project_role_assignment",
                AuditLog.operation == operation,
                AuditLog.project_id == _uuid.UUID(str(project_id)),
            )
        ).scalars()
    )
    return [
        r for r in rows
        if r.changes.get("granted_user_id") == str(granted_user_id)
    ]


def test_grant_project_access_writes_audit_row(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t = _make_dept_with_template(db_session, "PAAG")
    grantee = _make_user(db_session, "audg@pa.test")
    db_session.commit()
    proj = _create_project(client_as(admin_user), t.id)
    r = client_as(admin_user).post(
        f"/api/projects/{proj['id']}/access",
        json={"user_id": str(grantee.id)},
    )
    assert r.status_code == 201
    rows = _pra_audit_rows(db_session, "grant", proj["id"], grantee.id)
    assert len(rows) == 1
    assert rows[0].changed_by == admin_user.id


def test_revoke_project_access_writes_audit_row(
    db_session: Session,
    client_as: Callable[[User], TestClient],
    admin_user: User,
):
    a, t = _make_dept_with_template(db_session, "PAAR")
    grantee = _make_user(db_session, "audr@pa.test")
    db_session.commit()
    proj = _create_project(client_as(admin_user), t.id)
    c = client_as(admin_user)
    c.post(
        f"/api/projects/{proj['id']}/access",
        json={"user_id": str(grantee.id)},
    )
    r = c.delete(f"/api/projects/{proj['id']}/access/{grantee.id}")
    assert r.status_code == 204
    rows = _pra_audit_rows(db_session, "revoke", proj["id"], grantee.id)
    assert len(rows) == 1
