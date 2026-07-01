"""Tests for form CRUD routes (Phase 17.4).

Three behaviors:
1. editor-can-create / viewer-403
2. draft-404-for-viewer / visible-to-editor
3. active-form-listed-for-viewer
"""
import pytest
from sqlalchemy.orm import Session

from backend.tests.conftest import _make_dept, _make_user


@pytest.fixture
def env(db_session: Session):
    dept = _make_dept(db_session, code="FORMS_A4")
    editor = _make_user(db_session, email="editor.a4@x.com", role="project_editor", department_id=dept.id)
    viewer = _make_user(db_session, email="viewer.a4@x.com", role="viewer", department_id=dept.id)
    return {"dept": dept, "editor": editor, "viewer": viewer}


def test_editor_can_create_form_and_viewer_cannot(env, client_as):
    dept = env["dept"]
    editor = env["editor"]
    viewer = env["viewer"]

    c = client_as(editor)
    r = c.post("/api/forms", json={
        "name": "CO request",
        "department_id": str(dept.id),
        "target_entity": "cor",
    })
    assert r.status_code == 201, r.text
    assert r.json()["status"] == "draft"

    c = client_as(viewer)
    r = c.post("/api/forms", json={"name": "x", "department_id": str(dept.id)})
    assert r.status_code == 403


def test_draft_is_404_for_viewer_visible_to_editor(env, client_as):
    dept = env["dept"]
    editor = env["editor"]
    viewer = env["viewer"]

    c = client_as(editor)
    r = c.post("/api/forms", json={"name": "d", "department_id": str(dept.id)})
    assert r.status_code == 201, r.text
    fid = r.json()["id"]

    c = client_as(viewer)
    assert c.get(f"/api/forms/{fid}").status_code == 404

    c = client_as(editor)
    assert c.get(f"/api/forms/{fid}").status_code == 200


def test_active_form_listed_for_viewer(env, client_as):
    dept = env["dept"]
    editor = env["editor"]
    viewer = env["viewer"]

    c = client_as(editor)
    r = c.post("/api/forms", json={"name": "a", "department_id": str(dept.id)})
    assert r.status_code == 201, r.text
    fid = r.json()["id"]
    patch_r = c.patch(f"/api/forms/{fid}", json={"status": "active"})
    assert patch_r.status_code == 200, patch_r.text

    c = client_as(viewer)
    list_r = c.get("/api/forms")
    assert list_r.status_code == 200, list_r.text
    ids = [f["id"] for f in list_r.json()["items"]]
    assert fid in ids


def test_delete_form_removes_it(env, client_as):
    dept = env["dept"]
    editor = env["editor"]

    c = client_as(editor)
    r = c.post("/api/forms", json={"name": "to-delete", "department_id": str(dept.id)})
    assert r.status_code == 201, r.text
    fid = r.json()["id"]

    del_r = c.delete(f"/api/forms/{fid}")
    assert del_r.status_code == 204

    get_r = c.get(f"/api/forms/{fid}")
    assert get_r.status_code == 404


def test_viewer_cannot_delete_form(env, client_as):
    dept = env["dept"]
    editor = env["editor"]
    viewer = env["viewer"]

    c = client_as(editor)
    r = c.post("/api/forms", json={"name": "protected", "department_id": str(dept.id)})
    fid = r.json()["id"]
    # make it active so viewer can see it
    c.patch(f"/api/forms/{fid}", json={"status": "active"})

    c = client_as(viewer)
    assert c.delete(f"/api/forms/{fid}").status_code == 403


def test_targets_endpoint_returns_cor_key(env, client_as):
    editor = env["editor"]
    c = client_as(editor)
    r = c.get("/api/forms/targets")
    assert r.status_code == 200
    data = r.json()
    # #49: payload now carries the registry under "targets" plus the single
    # source-of-truth field_type_map the frontend derives compatibility from.
    assert "cor" in data["targets"]
    assert "fields" in data["targets"]["cor"]
    assert data["field_type_map"]["currency"] == "currency"
    assert data["field_type_map"]["long_text"] == "text"
    # Phase 27.9: user field type maps to "user"; the assignment target has an
    # assignee field of that type.
    assert data["field_type_map"]["user"] == "user"
    assignee = [f for f in data["targets"]["assignment"]["fields"] if f["key"] == "assignee"]
    assert assignee and assignee[0]["type"] == "user"


def test_user_options_returns_dept_users_for_viewer(env, client_as, db_session):
    # Phase 27.9: a viewer who can read an active form gets its department's
    # users for a user-picker field.
    dept = env["dept"]
    editor = env["editor"]
    viewer = env["viewer"]
    c = client_as(editor)
    fid = c.post("/api/forms", json={"name": "u", "department_id": str(dept.id)}).json()["id"]
    c.patch(f"/api/forms/{fid}", json={"status": "active"})

    r = client_as(viewer).get(f"/api/forms/{fid}/user-options")
    assert r.status_code == 200
    emails = {u["email"] for u in r.json()["items"]}
    # Both dept members are present; the list is scoped to the form's dept.
    assert "editor.a4@x.com" in emails and "viewer.a4@x.com" in emails


def test_user_options_404_for_outsider(env, client_as, db_session):
    from backend.tests.conftest import _make_dept, _make_user

    dept = env["dept"]
    editor = env["editor"]
    other_dept = _make_dept(db_session, code="FORMS_A4_OTHER")
    outsider = _make_user(db_session, email="outsider.a4@x.com", role="viewer",
                          department_id=other_dept.id)
    c = client_as(editor)
    fid = c.post("/api/forms", json={"name": "u2", "department_id": str(dept.id)}).json()["id"]
    c.patch(f"/api/forms/{fid}", json={"status": "active"})
    # An outsider can't read the form → can't list its users.
    r = client_as(outsider).get(f"/api/forms/{fid}/user-options")
    assert r.status_code == 404


def test_draft_not_listed_for_viewer(env, client_as):
    dept = env["dept"]
    editor = env["editor"]
    viewer = env["viewer"]

    c = client_as(editor)
    r = c.post("/api/forms", json={"name": "hidden-draft", "department_id": str(dept.id)})
    fid = r.json()["id"]

    c = client_as(viewer)
    list_r = c.get("/api/forms")
    assert list_r.status_code == 200
    ids = [f["id"] for f in list_r.json()["items"]]
    assert fid not in ids


def test_pending_count_in_list_for_reviewers_only(env, client_as):
    """#49: list payload carries pending_count — populated for reviewers
    (editor+), zero for non-reviewing viewers."""
    dept = env["dept"]
    editor = env["editor"]
    viewer = env["viewer"]

    # NOTE: client_as mutates the ONE shared client's cookie, so re-attach the
    # identity right before each call rather than caching `ce`/`cv`.
    fid = client_as(editor).post("/api/forms", json={
        "name": "Intake", "department_id": str(dept.id),  # collect-only
    }).json()["id"]
    # Activate so it accepts submissions.
    assert client_as(editor).patch(f"/api/forms/{fid}", json={"status": "active"}).status_code == 200

    # Viewer submits twice → two pending submissions.
    for _ in range(2):
        r = client_as(viewer).post(f"/api/forms/{fid}/submissions", json={"values": {}})
        assert r.status_code == 201, r.text

    # Editor (reviewer) sees the pending count.
    ed_items = {f["id"]: f for f in client_as(editor).get("/api/forms").json()["items"]}
    assert ed_items[fid]["pending_count"] == 2

    # Viewer sees the form but no review count (they don't review).
    vw_items = {f["id"]: f for f in client_as(viewer).get("/api/forms").json()["items"]}
    assert vw_items[fid]["pending_count"] == 0

