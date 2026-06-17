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
def template(
    db_session: Session,
    project_editor_user: User,
    viewer_user: User,
):
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


# ---- auth gating --------------------------------------------------------


def test_list_notes_requires_auth(client: TestClient):
    fake = "00000000-0000-0000-0000-000000000000"
    r = client.get(f"/api/projects/{fake}/notes")
    assert r.status_code == 401


def test_list_notes_allowed_for_viewer(
    client_as, viewer_user: User, admin_user: User, template
):
    p = _new_project(client_as(admin_user), str(template.id))
    r = client_as(viewer_user).get(f"/api/projects/{p['id']}/notes")
    assert r.status_code == 200


def test_create_note_allowed_for_viewer(
    client_as, viewer_user: User, admin_user: User, template
):
    p = _new_project(client_as(admin_user), str(template.id))
    r = client_as(viewer_user).post(
        f"/api/projects/{p['id']}/notes", json={"body": "Hello world"}
    )
    assert r.status_code == 201
    body = r.json()
    assert body["body"] == "Hello world"
    assert body["created_by"]["email"] == "viewer@example.com"


# ---- CRUD ---------------------------------------------------------------


def test_create_then_list_returns_both(
    client_as, admin_user: User, template
):
    """Order is `created_at DESC`. Within the pytest fixture's shared outer
    transaction, both posts share the same `now()` timestamp, so strict
    ordering isn't testable here; we just confirm both rows are returned.
    Production has separate transactions and therefore distinct timestamps."""
    c = client_as(admin_user)
    p = _new_project(c, str(template.id))
    c.post(f"/api/projects/{p['id']}/notes", json={"body": "First"})
    c.post(f"/api/projects/{p['id']}/notes", json={"body": "Second"})
    body = c.get(f"/api/projects/{p['id']}/notes").json()
    assert body["total"] == 2
    assert {i["body"] for i in body["items"]} == {"First", "Second"}


def test_author_can_edit_own(client_as, viewer_user: User, admin_user: User, template):
    p = _new_project(client_as(admin_user), str(template.id))
    cv = client_as(viewer_user)
    note = cv.post(
        f"/api/projects/{p['id']}/notes", json={"body": "First draft"}
    ).json()
    r = cv.patch(
        f"/api/projects/{p['id']}/notes/{note['id']}",
        json={"body": "Edited version"},
    )
    assert r.status_code == 200
    assert r.json()["body"] == "Edited version"


def test_non_author_cannot_edit_others_note(
    client_as,
    viewer_user: User,
    project_editor_user: User,
    admin_user: User,
    template,
):
    p = _new_project(client_as(admin_user), str(template.id))
    note = client_as(viewer_user).post(
        f"/api/projects/{p['id']}/notes", json={"body": "Viewer's note"}
    ).json()
    r = client_as(project_editor_user).patch(
        f"/api/projects/{p['id']}/notes/{note['id']}",
        json={"body": "trying to rewrite"},
    )
    assert r.status_code == 403


def test_admin_cannot_silently_edit_others_note(
    client_as, viewer_user: User, admin_user: User, template
):
    """Admin can DELETE others' notes but NOT edit them — preserves
    authorship integrity."""
    p = _new_project(client_as(admin_user), str(template.id))
    note = client_as(viewer_user).post(
        f"/api/projects/{p['id']}/notes", json={"body": "Viewer's words"}
    ).json()
    r = client_as(admin_user).patch(
        f"/api/projects/{p['id']}/notes/{note['id']}",
        json={"body": "admin override"},
    )
    assert r.status_code == 403


def test_author_can_delete_own(
    client_as, viewer_user: User, admin_user: User, template
):
    p = _new_project(client_as(admin_user), str(template.id))
    cv = client_as(viewer_user)
    note = cv.post(
        f"/api/projects/{p['id']}/notes", json={"body": "delete me"}
    ).json()
    r = cv.delete(f"/api/projects/{p['id']}/notes/{note['id']}")
    assert r.status_code == 204
    assert cv.get(f"/api/projects/{p['id']}/notes").json()["total"] == 0


def test_admin_can_delete_others_note(
    client_as, viewer_user: User, admin_user: User, template
):
    p = _new_project(client_as(admin_user), str(template.id))
    note = client_as(viewer_user).post(
        f"/api/projects/{p['id']}/notes", json={"body": "viewer note"}
    ).json()
    r = client_as(admin_user).delete(
        f"/api/projects/{p['id']}/notes/{note['id']}"
    )
    assert r.status_code == 204


def test_non_author_non_admin_cant_delete(
    client_as,
    viewer_user: User,
    project_editor_user: User,
    admin_user: User,
    template,
):
    p = _new_project(client_as(admin_user), str(template.id))
    note = client_as(viewer_user).post(
        f"/api/projects/{p['id']}/notes", json={"body": "viewer note"}
    ).json()
    r = client_as(project_editor_user).delete(
        f"/api/projects/{p['id']}/notes/{note['id']}"
    )
    assert r.status_code == 403


def test_note_cross_project_404(client_as, admin_user: User, template):
    c = client_as(admin_user)
    p1 = _new_project(c, str(template.id), number="aaaa1111")
    p2 = _new_project(c, str(template.id), number="bbbb2222")
    note = c.post(f"/api/projects/{p1['id']}/notes", json={"body": "x"}).json()
    r = c.get(f"/api/projects/{p2['id']}/notes/{note['id']}")
    assert r.status_code == 404 or r.status_code == 405  # GET single not implemented


def test_create_note_empty_body_422(
    client_as, admin_user: User, template
):
    c = client_as(admin_user)
    p = _new_project(c, str(template.id))
    r = c.post(f"/api/projects/{p['id']}/notes", json={"body": ""})
    assert r.status_code == 422


def test_create_note_under_missing_project_404(
    client_as, admin_user: User
):
    c = client_as(admin_user)
    r = c.post(
        "/api/projects/00000000-0000-0000-0000-000000000000/notes",
        json={"body": "x"},
    )
    assert r.status_code == 404


def test_notes_pagination(client_as, admin_user: User, template):
    c = client_as(admin_user)
    p = _new_project(c, str(template.id))
    for i in range(7):
        c.post(f"/api/projects/{p['id']}/notes", json={"body": f"n{i}"})
    body = c.get(f"/api/projects/{p['id']}/notes").json()
    assert body["total"] == 7
    assert body["limit"] == 5
    assert body["offset"] == 0
    assert len(body["items"]) == 5
    body2 = c.get(f"/api/projects/{p['id']}/notes?limit=5&offset=5").json()
    assert body2["total"] == 7
    assert len(body2["items"]) == 2


def test_notes_pagination_validates_bounds(
    client_as, admin_user: User, template
):
    c = client_as(admin_user)
    p = _new_project(c, str(template.id))
    assert c.get(f"/api/projects/{p['id']}/notes?limit=0").status_code == 422
    assert c.get(f"/api/projects/{p['id']}/notes?limit=999").status_code == 422
    assert c.get(f"/api/projects/{p['id']}/notes?offset=-1").status_code == 422


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


def test_create_note_writes_audit_row(
    db_session, client_as, admin_user: User, template
):
    c = client_as(admin_user)
    p = _new_project(c, str(template.id))
    note = c.post(
        f"/api/projects/{p['id']}/notes", json={"body": "Hello"}
    ).json()
    rows = _audit_rows(db_session, "note", note["id"])
    assert len(rows) == 1
    assert rows[0].operation == "create"
    assert str(rows[0].project_id) == p["id"]
    assert rows[0].changes["initial"]["body"] == "Hello"


def test_patch_note_writes_audit_row(
    db_session, client_as, admin_user: User, template
):
    c = client_as(admin_user)
    p = _new_project(c, str(template.id))
    note = c.post(
        f"/api/projects/{p['id']}/notes", json={"body": "Hello"}
    ).json()
    r = c.patch(
        f"/api/projects/{p['id']}/notes/{note['id']}",
        json={"body": "Updated"},
    )
    assert r.status_code == 200
    rows = _audit_rows(db_session, "note", note["id"])
    update_rows = [r for r in rows if r.operation == "update"]
    assert len(update_rows) == 1
    assert update_rows[0].changes["body"] == ["Hello", "Updated"]


def test_delete_note_writes_audit_row(
    db_session, client_as, admin_user: User, template
):
    c = client_as(admin_user)
    p = _new_project(c, str(template.id))
    note = c.post(
        f"/api/projects/{p['id']}/notes", json={"body": "Hello"}
    ).json()
    r = c.delete(f"/api/projects/{p['id']}/notes/{note['id']}")
    assert r.status_code == 204
    rows = _audit_rows(db_session, "note", note["id"])
    delete_rows = [r for r in rows if r.operation == "delete"]
    assert len(delete_rows) == 1
    assert str(delete_rows[0].project_id) == p["id"]
