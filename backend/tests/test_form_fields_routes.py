"""Tests for form field management routes (Phase 17.5).

Four behaviors:
1. add and reorder fields
2. incompatible binding rejected (422)
3. field edit (PATCH)
4. field soft-delete (DELETE sets deleted_at, excluded from GET)
"""
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.models import AuditLog, FormField
from backend.app.schemas.forms import MAX_FIELDS_PER_FORM
from backend.tests.conftest import _make_dept, _make_user


def _form_audit_updates(db: Session, form_id):
    return list(db.execute(
        select(AuditLog).where(
            AuditLog.entity_type == "form",
            AuditLog.entity_id == form_id,
            AuditLog.operation == "update",
        )
    ).scalars())


@pytest.fixture
def env(db_session: Session):
    dept = _make_dept(db_session, code="FORMS_A5")
    editor = _make_user(db_session, email="editor.a5@x.com", role="project_editor",
                        department_id=dept.id)
    return {"dept": dept, "editor": editor}


def test_add_and_reorder_fields(env, client_as):
    dept = env["dept"]
    editor = env["editor"]

    c = client_as(editor)
    fid = c.post("/api/forms", json={
        "name": "f",
        "department_id": str(dept.id),
        "target_entity": "cor",
    }).json()["id"]

    a = c.post(f"/api/forms/{fid}/fields", json={
        "label": "Desc",
        "field_type": "long_text",
        "target_entity": "cor",
        "target_key": "description",
    })
    assert a.status_code == 201, a.text

    b = c.post(f"/api/forms/{fid}/fields", json={
        "label": "Amt",
        "field_type": "currency",
        "target_entity": "cor",
        "target_key": "amount",
    })
    assert b.status_code == 201, b.text

    aid, bid = a.json()["id"], b.json()["id"]

    r = c.post(f"/api/forms/{fid}/fields/reorder", json={"field_ids": [bid, aid]})
    assert r.status_code == 200, r.text

    order = [f["id"] for f in c.get(f"/api/forms/{fid}").json()["fields"]]
    assert order == [bid, aid]


def test_incompatible_binding_rejected(env, client_as):
    dept = env["dept"]
    editor = env["editor"]

    c = client_as(editor)
    fid = c.post("/api/forms", json={
        "name": "f2",
        "department_id": str(dept.id),
        "target_entity": "cor",
    }).json()["id"]

    # short_text cannot bind to amount (currency)
    r = c.post(f"/api/forms/{fid}/fields", json={
        "label": "x",
        "field_type": "short_text",
        "target_entity": "cor",
        "target_key": "amount",
    })
    assert r.status_code == 422, r.text


def test_edit_field(env, client_as):
    dept = env["dept"]
    editor = env["editor"]

    c = client_as(editor)
    fid = c.post("/api/forms", json={
        "name": "f3",
        "department_id": str(dept.id),
        "target_entity": "cor",
    }).json()["id"]

    add_r = c.post(f"/api/forms/{fid}/fields", json={
        "label": "Old label",
        "field_type": "long_text",
        "target_entity": "cor",
        "target_key": "description",
    })
    assert add_r.status_code == 201, add_r.text
    field_id = add_r.json()["id"]

    patch_r = c.patch(f"/api/forms/{fid}/fields/{field_id}", json={
        "label": "New label",
        "field_type": "long_text",
        "target_entity": "cor",
        "target_key": "description",
    })
    assert patch_r.status_code == 200, patch_r.text
    assert patch_r.json()["label"] == "New label"


def test_map_field_without_target_entity_in_body(env, client_as):
    """Regression: the real frontend (FieldConfigSheet) does NOT send
    `target_entity` in the field payload — only `target_key`. Mapping a
    field must still succeed; the route validates the binding against the
    form's own target_entity. (Bug: schema rejected target_key sans entity
    with 422 → 'Update field failed' toast.)"""
    dept = env["dept"]
    editor = env["editor"]

    c = client_as(editor)
    fid = c.post("/api/forms", json={
        "name": "f-map",
        "department_id": str(dept.id),
        "target_entity": "cor",
    }).json()["id"]

    # Field created with no mapping yet (like adding from the palette).
    add_r = c.post(f"/api/forms/{fid}/fields", json={
        "label": "Scope change",
        "field_type": "long_text",
    })
    assert add_r.status_code == 201, add_r.text
    field_id = add_r.json()["id"]

    # Now map it — exactly the body the frontend sends: target_key, NO target_entity.
    patch_r = c.patch(f"/api/forms/{fid}/fields/{field_id}", json={
        "label": "Scope change",
        "field_type": "long_text",
        "required": False,
        "placeholder": None,
        "help_text": None,
        "options": None,
        "target_key": "description",
    })
    assert patch_r.status_code == 200, patch_r.text
    assert patch_r.json()["target_key"] == "description"

    # And an incompatible mapping (no target_entity in body) is still rejected
    # by the route's form-aware check.
    bad_r = c.patch(f"/api/forms/{fid}/fields/{field_id}", json={
        "label": "Scope change",
        "field_type": "short_text",
        "target_key": "amount",
    })
    assert bad_r.status_code == 422, bad_r.text


def test_soft_delete_field(env, client_as):
    dept = env["dept"]
    editor = env["editor"]

    c = client_as(editor)
    fid = c.post("/api/forms", json={
        "name": "f4",
        "department_id": str(dept.id),
        "target_entity": "cor",
    }).json()["id"]

    add_r = c.post(f"/api/forms/{fid}/fields", json={
        "label": "Doomed",
        "field_type": "long_text",
        "target_entity": "cor",
        "target_key": "description",
    })
    assert add_r.status_code == 201, add_r.text
    field_id = add_r.json()["id"]

    del_r = c.delete(f"/api/forms/{fid}/fields/{field_id}")
    assert del_r.status_code == 204

    # Field should no longer appear in the form's live fields
    form_r = c.get(f"/api/forms/{fid}")
    assert form_r.status_code == 200
    field_ids = [f["id"] for f in form_r.json()["fields"]]
    assert field_id not in field_ids


def test_field_mutations_write_audit_rows(env, client_as, db_session):
    """#48: add / update / delete / reorder each write a form 'update' audit row,
    for parity with form CRUD and submission transitions."""
    import uuid

    dept = env["dept"]
    editor = env["editor"]
    c = client_as(editor)

    fid = c.post("/api/forms", json={
        "name": "audit-form",
        "department_id": str(dept.id),
        "target_entity": "cor",
    }).json()["id"]
    form_uuid = uuid.UUID(fid)

    # No field-update audit rows yet (form create is operation="create").
    assert _form_audit_updates(db_session, form_uuid) == []

    # add → 1 update row
    a = c.post(f"/api/forms/{fid}/fields", json={
        "label": "Desc", "field_type": "long_text", "target_key": "description",
    })
    assert a.status_code == 201, a.text
    b = c.post(f"/api/forms/{fid}/fields", json={
        "label": "Amt", "field_type": "currency", "target_key": "amount",
    })
    assert b.status_code == 201, b.text
    aid, bid = a.json()["id"], b.json()["id"]
    assert len(_form_audit_updates(db_session, form_uuid)) == 2

    # update → +1
    pr = c.patch(f"/api/forms/{fid}/fields/{aid}", json={
        "label": "Description", "field_type": "long_text", "target_key": "description",
    })
    assert pr.status_code == 200, pr.text
    assert len(_form_audit_updates(db_session, form_uuid)) == 3

    # reorder → +1
    rr = c.post(f"/api/forms/{fid}/fields/reorder", json={"field_ids": [bid, aid]})
    assert rr.status_code == 200, rr.text
    assert len(_form_audit_updates(db_session, form_uuid)) == 4

    # delete → +1
    dr = c.delete(f"/api/forms/{fid}/fields/{bid}")
    assert dr.status_code == 204
    rows = _form_audit_updates(db_session, form_uuid)
    assert len(rows) == 5
    # The changes payloads name the mutation kind.
    kinds = set()
    for r in rows:
        kinds |= set(r.changes.keys())
    assert {"field_added", "field_updated", "fields_reordered", "field_deleted"} <= kinds


def test_field_cap_enforced(env, client_as, db_session):
    """#50: a form can hold at most MAX_FIELDS_PER_FORM live fields; the next
    add → 422."""
    import uuid

    dept = env["dept"]
    editor = env["editor"]
    c = client_as(editor)

    fid = c.post("/api/forms", json={
        "name": "capped", "department_id": str(dept.id), "target_entity": "cor",
    }).json()["id"]

    # Bulk-insert the cap directly (faster than 50 API round-trips).
    db_session.add_all([
        FormField(form_id=uuid.UUID(fid), label=f"f{i}", field_type="short_text",
                  required=False, order_index=i)
        for i in range(MAX_FIELDS_PER_FORM)
    ])
    db_session.commit()

    # One more via the API → 422.
    r = c.post(f"/api/forms/{fid}/fields", json={
        "label": "one too many", "field_type": "short_text",
    })
    assert r.status_code == 422, r.text


def test_intake_field_binds_to_template_custom_field(env, client_as, db_session):
    """#20.5c: on an intake form, a field can bind to the bound template's
    custom-field def id (a dynamic target); an incompatible bind is rejected."""
    import uuid as _uuid
    from backend.app.db.models import (
        Client, Discipline, Template, TemplateFieldDef,
    )

    dept = env["dept"]
    editor = env["editor"]
    c = client_as(editor)

    # Template (Dept×Client×Discipline) + a numeric custom-field def.
    cl = Client(code="CL_A5I", name="cl", department_id=dept.id)
    di = Discipline(code="DI_A5I", name="di", department_id=dept.id)
    db_session.add_all([cl, di])
    db_session.flush()
    tmpl = Template(name="t-intake", department_id=dept.id, client_id=cl.id, discipline_id=di.id)
    db_session.add(tmpl)
    db_session.flush()
    budget = TemplateFieldDef(template_id=tmpl.id, name="Budget", field_type="currency", order_index=0)
    db_session.add(budget)
    db_session.commit()

    # Intake form bound to that template.
    fid = c.post("/api/forms", json={
        "name": "intake", "department_id": str(dept.id), "target_entity": "intake",
    }).json()["id"]
    assert c.patch(f"/api/forms/{fid}", json={"target_template_id": str(tmpl.id)}).status_code == 200

    # A currency field binds to the currency def → 201.
    ok = c.post(f"/api/forms/{fid}/fields", json={
        "label": "Budget", "field_type": "currency", "target_key": str(budget.id),
    })
    assert ok.status_code == 201, ok.text
    assert ok.json()["target_key"] == str(budget.id)

    # A short_text field can't bind to the currency def → 422.
    bad = c.post(f"/api/forms/{fid}/fields", json={
        "label": "Note", "field_type": "short_text", "target_key": str(budget.id),
    })
    assert bad.status_code == 422, bad.text

    # An unknown def id → 422.
    bad2 = c.post(f"/api/forms/{fid}/fields", json={
        "label": "Ghost", "field_type": "currency", "target_key": str(_uuid.uuid4()),
    })
    assert bad2.status_code == 422, bad2.text


def test_published_form_structure_is_locked(env, client_as):
    """#1 (Phase 21): an active form rejects field mutations + target changes;
    unpublishing re-enables them."""
    dept = env["dept"]
    editor = env["editor"]
    c = client_as(editor)

    fid = c.post("/api/forms", json={
        "name": "lockme", "department_id": str(dept.id), "target_entity": "cor",
    }).json()["id"]
    # While draft, adding a field works.
    a = c.post(f"/api/forms/{fid}/fields", json={"label": "Desc", "field_type": "long_text"})
    assert a.status_code == 201, a.text
    aid = a.json()["id"]

    # Publish.
    assert c.patch(f"/api/forms/{fid}", json={"status": "active"}).status_code == 200

    # Now structural edits are blocked (409).
    assert c.post(f"/api/forms/{fid}/fields",
                  json={"label": "More", "field_type": "short_text"}).status_code == 409
    assert c.patch(f"/api/forms/{fid}/fields/{aid}",
                   json={"label": "X", "field_type": "long_text"}).status_code == 409
    assert c.delete(f"/api/forms/{fid}/fields/{aid}").status_code == 409
    assert c.post(f"/api/forms/{fid}/fields/reorder",
                  json={"field_ids": [aid]}).status_code == 409
    # Changing the target while active is blocked too.
    assert c.patch(f"/api/forms/{fid}", json={"target_entity": "assignment"}).status_code == 409
    # …but name/description/status edits are still allowed.
    assert c.patch(f"/api/forms/{fid}", json={"name": "renamed"}).status_code == 200

    # Unpublish → structural edits work again.
    assert c.patch(f"/api/forms/{fid}", json={"status": "draft"}).status_code == 200
    assert c.delete(f"/api/forms/{fid}/fields/{aid}").status_code == 204
