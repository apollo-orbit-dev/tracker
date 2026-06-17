import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.db.models import (
    Client,
    Contact,
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


@pytest.fixture
def contact(db_session: Session, template):
    c = Contact(
        name="Jane Doe",
        email="jane@example.com",
        department_id=template.department_id,
    )
    db_session.add(c)
    db_session.flush()
    return c


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


def test_list_requires_auth(client: TestClient):
    fake = "00000000-0000-0000-0000-000000000000"
    assert client.get(f"/api/projects/{fake}/contacts").status_code == 401


def test_list_allowed_for_viewer(
    client_as, viewer_user: User, admin_user: User, template
):
    p = _new_project(client_as(admin_user), str(template.id))
    r = client_as(viewer_user).get(f"/api/projects/{p['id']}/contacts")
    assert r.status_code == 200


def test_attach_forbidden_for_viewer(
    client_as, viewer_user: User, admin_user: User, template, contact
):
    p = _new_project(client_as(admin_user), str(template.id))
    r = client_as(viewer_user).post(
        f"/api/projects/{p['id']}/contacts",
        json={"contact_id": str(contact.id), "role": "Client PM"},
    )
    assert r.status_code == 403


# ---- CRUD happy paths ---------------------------------------------------


def test_attach_with_role(
    client_as, admin_user: User, template, contact
):
    c = client_as(admin_user)
    p = _new_project(c, str(template.id))
    r = c.post(
        f"/api/projects/{p['id']}/contacts",
        json={"contact_id": str(contact.id), "role": "Client PM"},
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["role"] == "Client PM"
    assert body["contact"]["name"] == "Jane Doe"
    assert body["contact"]["email"] == "jane@example.com"


def test_same_contact_two_roles_allowed(
    client_as, admin_user: User, template, contact
):
    c = client_as(admin_user)
    p = _new_project(c, str(template.id))
    a = c.post(
        f"/api/projects/{p['id']}/contacts",
        json={"contact_id": str(contact.id), "role": "Client PM"},
    )
    b = c.post(
        f"/api/projects/{p['id']}/contacts",
        json={"contact_id": str(contact.id), "role": "SME"},
    )
    assert a.status_code == 201
    assert b.status_code == 201
    body = c.get(f"/api/projects/{p['id']}/contacts").json()
    assert body["total"] == 2
    assert {x["role"] for x in body["items"]} == {"Client PM", "SME"}


def test_duplicate_combo_409(
    client_as, admin_user: User, template, contact
):
    c = client_as(admin_user)
    p = _new_project(c, str(template.id))
    c.post(
        f"/api/projects/{p['id']}/contacts",
        json={"contact_id": str(contact.id), "role": "Client PM"},
    )
    r = c.post(
        f"/api/projects/{p['id']}/contacts",
        json={"contact_id": str(contact.id), "role": "Client PM"},
    )
    assert r.status_code == 409


def test_patch_role(
    client_as, admin_user: User, template, contact
):
    c = client_as(admin_user)
    p = _new_project(c, str(template.id))
    pc = c.post(
        f"/api/projects/{p['id']}/contacts",
        json={"contact_id": str(contact.id), "role": "Client PM"},
    ).json()
    r = c.patch(
        f"/api/projects/{p['id']}/contacts/{pc['id']}",
        json={"role": "Engineering Lead"},
    )
    assert r.status_code == 200
    assert r.json()["role"] == "Engineering Lead"


def test_detach_soft_deletes(
    client_as, admin_user: User, template, contact
):
    c = client_as(admin_user)
    p = _new_project(c, str(template.id))
    pc = c.post(
        f"/api/projects/{p['id']}/contacts",
        json={"contact_id": str(contact.id), "role": "Client PM"},
    ).json()
    assert c.delete(f"/api/projects/{p['id']}/contacts/{pc['id']}").status_code == 204
    assert c.get(f"/api/projects/{p['id']}/contacts").json()["total"] == 0


def test_recreate_after_detach_ok(
    client_as, admin_user: User, template, contact
):
    """After soft-delete, the same (project, contact, role) combo is free
    to attach again."""
    c = client_as(admin_user)
    p = _new_project(c, str(template.id))
    pc = c.post(
        f"/api/projects/{p['id']}/contacts",
        json={"contact_id": str(contact.id), "role": "Client PM"},
    ).json()
    c.delete(f"/api/projects/{p['id']}/contacts/{pc['id']}")
    r = c.post(
        f"/api/projects/{p['id']}/contacts",
        json={"contact_id": str(contact.id), "role": "Client PM"},
    )
    assert r.status_code == 201


# ---- validation / 404 ---------------------------------------------------


def test_attach_unknown_contact_422(
    client_as, admin_user: User, template
):
    c = client_as(admin_user)
    p = _new_project(c, str(template.id))
    r = c.post(
        f"/api/projects/{p['id']}/contacts",
        json={
            "contact_id": "00000000-0000-0000-0000-000000000000",
            "role": "Client PM",
        },
    )
    assert r.status_code == 422


def test_attach_under_missing_project_404(
    client_as, admin_user: User, contact
):
    c = client_as(admin_user)
    r = c.post(
        "/api/projects/00000000-0000-0000-0000-000000000000/contacts",
        json={"contact_id": str(contact.id), "role": "Client PM"},
    )
    assert r.status_code == 404


def test_get_cross_project_404(
    client_as, admin_user: User, template, contact
):
    c = client_as(admin_user)
    p1 = _new_project(c, str(template.id), number="aaaa1111")
    p2 = _new_project(c, str(template.id), number="bbbb2222")
    pc = c.post(
        f"/api/projects/{p1['id']}/contacts",
        json={"contact_id": str(contact.id), "role": "x"},
    ).json()
    # PATCH attempt against p2 must 404 — not silent cross-project access.
    r = c.patch(
        f"/api/projects/{p2['id']}/contacts/{pc['id']}",
        json={"role": "y"},
    )
    assert r.status_code == 404


def test_attach_empty_role_422(
    client_as, admin_user: User, template, contact
):
    c = client_as(admin_user)
    p = _new_project(c, str(template.id))
    r = c.post(
        f"/api/projects/{p['id']}/contacts",
        json={"contact_id": str(contact.id), "role": ""},
    )
    assert r.status_code == 422
