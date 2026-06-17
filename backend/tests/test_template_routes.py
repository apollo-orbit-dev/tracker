import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from backend.app.db.models import Client, Department, Discipline, User


@pytest.fixture
def taxonomy(db_session: Session):
    d = Department(code="DIV1", name="Division 1")
    db_session.add(d)
    db_session.flush()
    c = Client(code="CON", name="Contoso", department_id=d.id)
    di = Discipline(
        code="Design", name="Protection & Controls", department_id=d.id
    )
    db_session.add_all([c, di])
    db_session.flush()
    return d, c, di


def _create_template(client_as, admin_user: User, taxonomy) -> dict:
    d, c, di = taxonomy
    c_ = client_as(admin_user)
    r = c_.post(
        "/api/admin/templates",
        json={
            "name": "DIV1 / CON / Design",
            "department_id": str(d.id),
            "client_id": str(c.id),
            "discipline_id": str(di.id),
        },
    )
    assert r.status_code == 201, r.text
    return r.json()


# ---- auth gating ---------------------------------------------------------


def test_list_templates_requires_auth(client: TestClient):
    assert client.get("/api/admin/templates").status_code == 401


def test_list_templates_returns_empty_for_viewer_with_no_dept_overlap(
    client_as, viewer_user: User
):
    """Post-1.9.3: list is dept-scoped. The viewer user's dept has no
    templates, so the list comes back empty (no longer 403)."""
    c = client_as(viewer_user)
    r = c.get("/api/admin/templates")
    assert r.status_code == 200
    assert r.json()["total"] == 0


def test_list_templates_allowed_for_project_editor(
    client_as, project_editor_user: User
):
    """project_editor in their own dept can list. No templates exist in
    their dept by default → empty list, but the route is reachable."""
    c = client_as(project_editor_user)
    assert c.get("/api/admin/templates").status_code == 200


def test_create_template_forbidden_for_viewer(
    client_as, viewer_user: User, taxonomy
):
    d, cl, di = taxonomy
    c = client_as(viewer_user)
    r = c.post(
        "/api/admin/templates",
        json={
            "name": "x",
            "department_id": str(d.id),
            "client_id": str(cl.id),
            "discipline_id": str(di.id),
        },
    )
    assert r.status_code == 403


# ---- template CRUD -------------------------------------------------------


def test_create_then_get_template(client_as, admin_user: User, taxonomy):
    created = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    got = c.get(f"/api/admin/templates/{created['id']}")
    assert got.status_code == 200
    assert got.json()["name"] == "DIV1 / CON / Design"


def test_unique_intersection_409(client_as, admin_user: User, taxonomy):
    _create_template(client_as, admin_user, taxonomy)
    d, cl, di = taxonomy
    c = client_as(admin_user)
    r = c.post(
        "/api/admin/templates",
        json={
            "name": "dup",
            "department_id": str(d.id),
            "client_id": str(cl.id),
            "discipline_id": str(di.id),
        },
    )
    assert r.status_code == 409


def test_patch_template_name(client_as, admin_user: User, taxonomy):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    r = c.patch(f"/api/admin/templates/{t['id']}", json={"name": "Renamed"})
    assert r.status_code == 200
    assert r.json()["name"] == "Renamed"


def test_soft_delete_template_then_404(client_as, admin_user: User, taxonomy):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    r = c.delete(f"/api/admin/templates/{t['id']}")
    assert r.status_code == 204
    assert c.get(f"/api/admin/templates/{t['id']}").status_code == 404


def test_list_templates_includes_created(client_as, admin_user: User, taxonomy):
    _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    body = c.get("/api/admin/templates").json()
    assert body["total"] == 1
    assert body["items"][0]["name"] == "DIV1 / CON / Design"


# ---- field defs ----------------------------------------------------------


def test_create_field_def_text(client_as, admin_user: User, taxonomy):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    r = c.post(
        f"/api/admin/templates/{t['id']}/fields",
        json={"name": "Project Title", "field_type": "short_text"},
    )
    assert r.status_code == 201
    body = r.json()
    assert body["field_type"] == "short_text"
    assert body["options"] is None
    assert body["required"] is False
    # Phase 5.2: new fields default to is_project_metric = false.
    assert body["is_project_metric"] is False


# Phase 5.2 — is_project_metric flag.


def test_create_field_def_with_project_metric(
    client_as, admin_user: User, taxonomy
):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    r = c.post(
        f"/api/admin/templates/{t['id']}/fields",
        json={
            "name": "Design Budget",
            "field_type": "currency",
            "is_project_metric": True,
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["is_project_metric"] is True


def test_patch_field_def_flips_project_metric(
    client_as, admin_user: User, taxonomy
):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    fid = c.post(
        f"/api/admin/templates/{t['id']}/fields",
        json={"name": "Spent", "field_type": "currency"},
    ).json()["id"]

    # Flip on.
    r = c.patch(
        f"/api/admin/templates/{t['id']}/fields/{fid}",
        json={"is_project_metric": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["is_project_metric"] is True

    # Flip off.
    r = c.patch(
        f"/api/admin/templates/{t['id']}/fields/{fid}",
        json={"is_project_metric": False},
    )
    assert r.status_code == 200
    assert r.json()["is_project_metric"] is False


def test_create_field_def_select_requires_options(
    client_as, admin_user: User, taxonomy
):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    r = c.post(
        f"/api/admin/templates/{t['id']}/fields",
        json={"name": "Phase", "field_type": "single_select"},
    )
    assert r.status_code == 422


def test_create_field_def_select_with_choices(
    client_as, admin_user: User, taxonomy
):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    r = c.post(
        f"/api/admin/templates/{t['id']}/fields",
        json={
            "name": "Phase",
            "field_type": "single_select",
            "options": {"choices": ["scoping", "design", "build"]},
        },
    )
    assert r.status_code == 201
    assert r.json()["options"] == {"choices": ["scoping", "design", "build"]}


def test_create_field_def_select_empty_choices_422(
    client_as, admin_user: User, taxonomy
):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    r = c.post(
        f"/api/admin/templates/{t['id']}/fields",
        json={
            "name": "Phase",
            "field_type": "single_select",
            "options": {"choices": []},
        },
    )
    assert r.status_code == 422


def test_create_field_def_unknown_type_422(
    client_as, admin_user: User, taxonomy
):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    r = c.post(
        f"/api/admin/templates/{t['id']}/fields",
        json={"name": "x", "field_type": "weirdtype"},
    )
    assert r.status_code == 422


def test_field_list_appends_in_creation_order(
    client_as, admin_user: User, taxonomy
):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    c.post(
        f"/api/admin/templates/{t['id']}/fields",
        json={"name": "A", "field_type": "short_text"},
    )
    c.post(
        f"/api/admin/templates/{t['id']}/fields",
        json={"name": "B", "field_type": "short_text"},
    )
    # Server auto-assigns order_index — new rows go to the end.
    body = c.get(f"/api/admin/templates/{t['id']}/fields").json()
    assert [f["name"] for f in body["items"]] == ["A", "B"]


def test_patch_field_change_type_clears_options(
    client_as, admin_user: User, taxonomy
):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    f = c.post(
        f"/api/admin/templates/{t['id']}/fields",
        json={
            "name": "Phase",
            "field_type": "single_select",
            "options": {"choices": ["a", "b"]},
        },
    ).json()
    # Move from select → short_text while explicitly nulling options.
    r = c.patch(
        f"/api/admin/templates/{t['id']}/fields/{f['id']}",
        json={"field_type": "short_text", "options": None},
    )
    assert r.status_code == 200
    assert r.json()["field_type"] == "short_text"
    assert r.json()["options"] is None


def test_patch_field_change_type_without_clearing_options_422(
    client_as, admin_user: User, taxonomy
):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    f = c.post(
        f"/api/admin/templates/{t['id']}/fields",
        json={
            "name": "Phase",
            "field_type": "single_select",
            "options": {"choices": ["a", "b"]},
        },
    ).json()
    r = c.patch(
        f"/api/admin/templates/{t['id']}/fields/{f['id']}",
        json={"field_type": "short_text"},
    )
    assert r.status_code == 422


def test_delete_field_soft_deletes(client_as, admin_user: User, taxonomy):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    f = c.post(
        f"/api/admin/templates/{t['id']}/fields",
        json={"name": "X", "field_type": "short_text"},
    ).json()
    assert c.delete(
        f"/api/admin/templates/{t['id']}/fields/{f['id']}"
    ).status_code == 204
    # GET → 404
    assert c.get(
        f"/api/admin/templates/{t['id']}/fields/{f['id']}"
    ).status_code == 404
    # include_deleted shows it
    body = c.get(
        f"/api/admin/templates/{t['id']}/fields?include_deleted=true"
    ).json()
    assert body["total"] == 1


def test_field_under_missing_template_404(client_as, admin_user: User):
    c = client_as(admin_user)
    r = c.get(
        "/api/admin/templates/00000000-0000-0000-0000-000000000000/fields"
    )
    assert r.status_code == 404


# ---- milestone defs ------------------------------------------------------


def test_create_milestone(client_as, admin_user: User, taxonomy):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    r = c.post(
        f"/api/admin/templates/{t['id']}/milestones",
        json={
            "name": "IFC",
            "direction": "outbound",
            "date_model": "planned_actual",
        },
    )
    assert r.status_code == 201


def test_create_milestone_invalid_direction_422(
    client_as, admin_user: User, taxonomy
):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    r = c.post(
        f"/api/admin/templates/{t['id']}/milestones",
        json={
            "name": "IFC",
            "direction": "sideways",
            "date_model": "single",
        },
    )
    assert r.status_code == 422


def test_create_milestone_invalid_date_model_422(
    client_as, admin_user: User, taxonomy
):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    r = c.post(
        f"/api/admin/templates/{t['id']}/milestones",
        json={
            "name": "IFC",
            "direction": "outbound",
            "date_model": "quarterly",
        },
    )
    assert r.status_code == 422


def test_patch_milestone(client_as, admin_user: User, taxonomy):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    m = c.post(
        f"/api/admin/templates/{t['id']}/milestones",
        json={
            "name": "IFC",
            "direction": "outbound",
            "date_model": "single",
        },
    ).json()
    r = c.patch(
        f"/api/admin/templates/{t['id']}/milestones/{m['id']}",
        json={"name": "Issued for Construction"},
    )
    assert r.status_code == 200
    assert r.json()["name"] == "Issued for Construction"


def test_milestone_list_appends_in_creation_order(
    client_as, admin_user: User, taxonomy
):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    c.post(
        f"/api/admin/templates/{t['id']}/milestones",
        json={
            "name": "First",
            "direction": "outbound",
            "date_model": "single",
        },
    )
    c.post(
        f"/api/admin/templates/{t['id']}/milestones",
        json={
            "name": "Second",
            "direction": "outbound",
            "date_model": "single",
        },
    )
    body = c.get(f"/api/admin/templates/{t['id']}/milestones").json()
    assert [m["name"] for m in body["items"]] == ["First", "Second"]


def test_milestone_under_missing_template_404(
    client_as, admin_user: User
):
    c = client_as(admin_user)
    r = c.get(
        "/api/admin/templates/00000000-0000-0000-0000-000000000000/milestones"
    )
    assert r.status_code == 404


# ---- bulk reorder --------------------------------------------------------


def _three_fields(client_as, admin_user, taxonomy):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    a = c.post(
        f"/api/admin/templates/{t['id']}/fields",
        json={"name": "A", "field_type": "short_text"},
    ).json()
    b = c.post(
        f"/api/admin/templates/{t['id']}/fields",
        json={"name": "B", "field_type": "short_text"},
    ).json()
    cf = c.post(
        f"/api/admin/templates/{t['id']}/fields",
        json={"name": "C", "field_type": "short_text"},
    ).json()
    return t, [a, b, cf]


def test_reorder_fields_happy_path(client_as, admin_user: User, taxonomy):
    t, [a, b, cf] = _three_fields(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    r = c.post(
        f"/api/admin/templates/{t['id']}/fields/reorder",
        json={"ordered_ids": [cf["id"], a["id"], b["id"]]},
    )
    assert r.status_code == 204
    body = c.get(f"/api/admin/templates/{t['id']}/fields").json()
    assert [f["name"] for f in body["items"]] == ["C", "A", "B"]


def test_reorder_fields_missing_id_422(client_as, admin_user: User, taxonomy):
    t, [a, b, _cf] = _three_fields(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    r = c.post(
        f"/api/admin/templates/{t['id']}/fields/reorder",
        json={"ordered_ids": [a["id"], b["id"]]},  # missing C
    )
    assert r.status_code == 422
    assert any("missing id" in d for d in r.json()["detail"])


def test_reorder_fields_extra_id_422(client_as, admin_user: User, taxonomy):
    t, [a, b, cf] = _three_fields(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    r = c.post(
        f"/api/admin/templates/{t['id']}/fields/reorder",
        json={
            "ordered_ids": [
                a["id"],
                b["id"],
                cf["id"],
                "00000000-0000-0000-0000-000000000000",
            ]
        },
    )
    assert r.status_code == 422
    assert any("not in template" in d for d in r.json()["detail"])


def test_reorder_fields_duplicate_422(client_as, admin_user: User, taxonomy):
    t, [a, b, _cf] = _three_fields(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    r = c.post(
        f"/api/admin/templates/{t['id']}/fields/reorder",
        json={"ordered_ids": [a["id"], a["id"], b["id"]]},
    )
    assert r.status_code == 422


def test_reorder_forbidden_for_viewer(
    client_as, viewer_user: User, admin_user: User, taxonomy
):
    # Build state as admin.
    t, [a, b, cf] = _three_fields(client_as, admin_user, taxonomy)
    # Attempt reorder as viewer.
    c = client_as(viewer_user)
    r = c.post(
        f"/api/admin/templates/{t['id']}/fields/reorder",
        json={"ordered_ids": [cf["id"], a["id"], b["id"]]},
    )
    assert r.status_code == 403


def test_reorder_milestones_happy_path(
    client_as, admin_user: User, taxonomy
):
    t = _create_template(client_as, admin_user, taxonomy)
    c = client_as(admin_user)
    a = c.post(
        f"/api/admin/templates/{t['id']}/milestones",
        json={"name": "A", "direction": "outbound", "date_model": "single"},
    ).json()
    b = c.post(
        f"/api/admin/templates/{t['id']}/milestones",
        json={"name": "B", "direction": "outbound", "date_model": "single"},
    ).json()
    r = c.post(
        f"/api/admin/templates/{t['id']}/milestones/reorder",
        json={"ordered_ids": [b["id"], a["id"]]},
    )
    assert r.status_code == 204
    body = c.get(f"/api/admin/templates/{t['id']}/milestones").json()
    assert [m["name"] for m in body["items"]] == ["B", "A"]


def test_reorder_under_missing_template_404(
    client_as, admin_user: User
):
    c = client_as(admin_user)
    r = c.post(
        "/api/admin/templates/00000000-0000-0000-0000-000000000000/fields/reorder",
        json={"ordered_ids": []},
    )
    assert r.status_code == 404
