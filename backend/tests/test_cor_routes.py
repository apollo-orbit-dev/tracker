import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.db.models import (
    Client,
    Department,
    Discipline,
    Template,
    User,
    UserRole,
)


@pytest.fixture
def project_pair(
    db_session: Session,
    admin_user: User,
    project_editor_user: User,
    viewer_user: User,
):
    """Create two projects on the same template — to exercise per-project
    number uniqueness boundary."""
    d = Department(code="DIV1", name="Division 1")
    db_session.add(d)
    db_session.flush()
    db_session.add(
        UserRole(
            user_id=project_editor_user.id,
            role_id="project_editor",
            department_id=d.id,
        )
    )
    db_session.add(
        UserRole(
            user_id=viewer_user.id, role_id="viewer", department_id=d.id
        )
    )
    db_session.flush()
    cl = Client(code="CON", name="Contoso", department_id=d.id)
    di = Discipline(
        code="Design", name="Protection & Controls", department_id=d.id
    )
    db_session.add_all([cl, di])
    db_session.flush()
    t = Template(
        name="t", department_id=d.id, client_id=cl.id, discipline_id=di.id
    )
    db_session.add(t)
    db_session.flush()
    return t


def _new_project(c, template_id: str, number: str = "25756601") -> dict:
    r = c.post(
        "/api/projects",
        json={
            "project_number": number,
            "title": "x",
            "template_id": str(template_id),
        },
    )
    assert r.status_code == 201
    return r.json()


def _cor_body(**overrides) -> dict:
    body = {
        "number": "CO-001",
        "description": "Add a task.",
        "amount": "12500.00",
        "status": "draft",
    }
    body.update(overrides)
    return body


# ---- auth gating --------------------------------------------------------


def test_list_cors_requires_auth(client: TestClient):
    fake_id = "00000000-0000-0000-0000-000000000000"
    r = client.get(f"/api/projects/{fake_id}/cors")
    assert r.status_code == 401


def test_list_cors_allowed_for_viewer(
    client_as, viewer_user: User, admin_user: User, project_pair
):
    p = _new_project(client_as(admin_user), str(project_pair.id))
    r = client_as(viewer_user).get(f"/api/projects/{p['id']}/cors")
    assert r.status_code == 200


def test_create_cor_forbidden_for_viewer(
    client_as, viewer_user: User, admin_user: User, project_pair
):
    p = _new_project(client_as(admin_user), str(project_pair.id))
    r = client_as(viewer_user).post(
        f"/api/projects/{p['id']}/cors", json=_cor_body()
    )
    assert r.status_code == 403


# ---- CRUD happy paths ---------------------------------------------------


def test_create_then_list(client_as, admin_user: User, project_pair):
    c = client_as(admin_user)
    p = _new_project(c, str(project_pair.id))
    r = c.post(f"/api/projects/{p['id']}/cors", json=_cor_body())
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["number"] == "CO-001"
    assert body["amount"] == "12500.00"
    assert body["status"] == "draft"

    listing = c.get(f"/api/projects/{p['id']}/cors").json()
    assert listing["total"] == 1
    assert listing["items"][0]["number"] == "CO-001"


def test_patch_cor(client_as, admin_user: User, project_pair):
    c = client_as(admin_user)
    p = _new_project(c, str(project_pair.id))
    created = c.post(f"/api/projects/{p['id']}/cors", json=_cor_body()).json()
    r = c.patch(
        f"/api/projects/{p['id']}/cors/{created['id']}",
        json={"status": "submitted", "submitted_date": "2026-06-01"},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "submitted"
    assert body["submitted_date"] == "2026-06-01"


def test_delete_cor_soft_deletes(
    client_as, admin_user: User, project_pair
):
    c = client_as(admin_user)
    p = _new_project(c, str(project_pair.id))
    created = c.post(f"/api/projects/{p['id']}/cors", json=_cor_body()).json()
    r = c.delete(f"/api/projects/{p['id']}/cors/{created['id']}")
    assert r.status_code == 204
    assert c.get(f"/api/projects/{p['id']}/cors").json()["total"] == 0


# ---- uniqueness ---------------------------------------------------------


def test_duplicate_number_same_project_409(
    client_as, admin_user: User, project_pair
):
    c = client_as(admin_user)
    p = _new_project(c, str(project_pair.id))
    c.post(f"/api/projects/{p['id']}/cors", json=_cor_body(number="CO-1"))
    r = c.post(
        f"/api/projects/{p['id']}/cors", json=_cor_body(number="CO-1")
    )
    assert r.status_code == 409


def test_duplicate_number_cross_project_ok(
    client_as, admin_user: User, project_pair
):
    c = client_as(admin_user)
    p1 = _new_project(c, str(project_pair.id), number="11111111")
    p2 = _new_project(c, str(project_pair.id), number="22222222")
    a = c.post(f"/api/projects/{p1['id']}/cors", json=_cor_body(number="CO-1"))
    b = c.post(f"/api/projects/{p2['id']}/cors", json=_cor_body(number="CO-1"))
    assert a.status_code == 201
    assert b.status_code == 201


def test_recreate_after_soft_delete(
    client_as, admin_user: User, project_pair
):
    c = client_as(admin_user)
    p = _new_project(c, str(project_pair.id))
    a = c.post(f"/api/projects/{p['id']}/cors", json=_cor_body(number="CO-1")).json()
    c.delete(f"/api/projects/{p['id']}/cors/{a['id']}")
    r = c.post(f"/api/projects/{p['id']}/cors", json=_cor_body(number="CO-1"))
    assert r.status_code == 201


# ---- validation ---------------------------------------------------------


def test_create_invalid_status_422(client_as, admin_user: User, project_pair):
    c = client_as(admin_user)
    p = _new_project(c, str(project_pair.id))
    r = c.post(
        f"/api/projects/{p['id']}/cors",
        json=_cor_body(status="weirdstatus"),
    )
    assert r.status_code == 422


def test_create_whitespace_in_number_422(
    client_as, admin_user: User, project_pair
):
    c = client_as(admin_user)
    p = _new_project(c, str(project_pair.id))
    r = c.post(
        f"/api/projects/{p['id']}/cors", json=_cor_body(number="has space")
    )
    assert r.status_code == 422


def test_cor_under_missing_project_404(client_as, admin_user: User):
    c = client_as(admin_user)
    r = c.get(
        "/api/projects/00000000-0000-0000-0000-000000000000/cors"
    )
    assert r.status_code == 404


def test_get_cor_wrong_project_404(
    client_as, admin_user: User, project_pair
):
    c = client_as(admin_user)
    p1 = _new_project(c, str(project_pair.id), number="aaaa1111")
    p2 = _new_project(c, str(project_pair.id), number="bbbb2222")
    cor = c.post(f"/api/projects/{p1['id']}/cors", json=_cor_body()).json()
    r = c.get(f"/api/projects/{p2['id']}/cors/{cor['id']}")
    assert r.status_code == 404


def test_patch_cor_empty_body_422(
    client_as, admin_user: User, project_pair
):
    c = client_as(admin_user)
    p = _new_project(c, str(project_pair.id))
    cor = c.post(f"/api/projects/{p['id']}/cors", json=_cor_body()).json()
    r = c.patch(f"/api/projects/{p['id']}/cors/{cor['id']}", json={})
    assert r.status_code == 422


# ---- audit log (Phase 3.1) ----------------------------------------------


def _audit_rows(db, entity_type, entity_id):
    import uuid as _uuid
    from sqlalchemy import select
    from backend.app.db.models import AuditLog

    return list(
        db.execute(
            select(AuditLog).where(
                AuditLog.entity_type == entity_type,
                AuditLog.entity_id == _uuid.UUID(str(entity_id)),
            )
        ).scalars()
    )


def test_create_cor_writes_audit_row(
    db_session, client_as, admin_user: User, project_pair
):
    c = client_as(admin_user)
    p = _new_project(c, str(project_pair.id))
    cor = c.post(f"/api/projects/{p['id']}/cors", json=_cor_body()).json()
    rows = _audit_rows(db_session, "cor", cor["id"])
    assert len(rows) == 1
    row = rows[0]
    assert row.operation == "create"
    assert str(row.project_id) == p["id"]
    assert row.changes["initial"]["number"] == "CO-001"


def test_patch_cor_writes_audit_row_with_diff(
    db_session, client_as, admin_user: User, project_pair
):
    c = client_as(admin_user)
    p = _new_project(c, str(project_pair.id))
    cor = c.post(f"/api/projects/{p['id']}/cors", json=_cor_body()).json()
    r = c.patch(
        f"/api/projects/{p['id']}/cors/{cor['id']}",
        json={"status": "submitted"},
    )
    assert r.status_code == 200
    rows = _audit_rows(db_session, "cor", cor["id"])
    update_rows = [r for r in rows if r.operation == "update"]
    assert len(update_rows) == 1
    assert update_rows[0].changes["status"] == ["draft", "submitted"]


def test_delete_cor_writes_audit_row(
    db_session, client_as, admin_user: User, project_pair
):
    c = client_as(admin_user)
    p = _new_project(c, str(project_pair.id))
    cor = c.post(f"/api/projects/{p['id']}/cors", json=_cor_body()).json()
    r = c.delete(f"/api/projects/{p['id']}/cors/{cor['id']}")
    assert r.status_code == 204
    rows = _audit_rows(db_session, "cor", cor["id"])
    delete_rows = [r for r in rows if r.operation == "delete"]
    assert len(delete_rows) == 1
    assert str(delete_rows[0].project_id) == p["id"]
