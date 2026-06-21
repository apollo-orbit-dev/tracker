"""Tests for form submission endpoints (Phase 17.10–17.11, Tasks B2–B3; C3).

TDD: tests written BEFORE the endpoints exist.

B2 scenarios (POST /api/forms/{form_id}/submissions):
1. viewer submits on an active form → 201, status "pending"
2. submit on a draft form (viewer) → 404 (drafts are hidden from non-editors)
3. active COR form with requires_project and no target_project_id → 422
4. a missing required field → 422
5. target_project_id the submitter can't view → 404

B3 scenarios (GET /api/forms/{form_id}/submissions[/{sid}]):
6. editor sees ALL submissions; viewer only sees their own
7. ?status=pending filters correctly
8. detail returns proposed_changes for a mapped long_text field bound to COR description
9. non-editor requesting another user's submission detail → 404

C3 scenarios (POST .../approve and .../reject):
10. editor approves → 200; COR created; submission approved with pushed_entity_*; audits exist
11. viewer cannot approve → 403
12. approving already-approved/rejected submission → 409
13. duplicate cor_number → 409; submission stays pending
14. reviewer lacking edit on target project → 403 (cross-dept)
15. reject sets rejected + note; no COR; re-rejecting → 409
16. final_values with invalid required value → 422
"""
import uuid

import pytest
from sqlalchemy.orm import Session

from backend.app.db.models import (
    AuditLog,
    Client,
    COR,
    Department,
    Discipline,
    Form,
    FormField,
    FormSubmission,
    Project,
    Template,
)
from backend.tests.conftest import _make_dept, _make_user


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_template(db_session: Session, dept: Department) -> Template:
    cl = Client(code=f"CL_{dept.code}", name="cl", department_id=dept.id)
    di = Discipline(code=f"DI_{dept.code}", name="di", department_id=dept.id)
    db_session.add_all([cl, di])
    db_session.flush()
    t = Template(
        name=f"tmpl-{dept.code}",
        department_id=dept.id,
        client_id=cl.id,
        discipline_id=di.id,
    )
    db_session.add(t)
    db_session.flush()
    return t


def _make_project(db_session: Session, dept: Department, creator, number: str) -> Project:
    t = _make_template(db_session, dept)
    p = Project(
        project_number=number,
        title=f"Project {number}",
        template_id=t.id,
        created_by=creator.id,
    )
    db_session.add(p)
    db_session.flush()
    return p


def _make_active_cor_form(
    db_session: Session,
    dept: Department,
    creator,
    *,
    with_required_field: bool = True,
    status: str = "active",
) -> tuple[Form, FormField | None]:
    """Create a COR-targeting form with an optional required text field."""
    form = Form(
        department_id=dept.id,
        name="CO Request Form",
        description=None,
        target_entity="cor",
        status=status,
        created_by=creator.id,
    )
    db_session.add(form)
    db_session.flush()

    field = None
    if with_required_field:
        field = FormField(
            form_id=form.id,
            label="Description",
            field_type="short_text",
            required=True,
            order_index=0,
        )
        db_session.add(field)
        db_session.flush()

    return form, field


# ---------------------------------------------------------------------------
# Fixture
# ---------------------------------------------------------------------------


@pytest.fixture
def env(db_session: Session):
    dept = _make_dept(db_session, code="FORMS_B2")
    other_dept = _make_dept(db_session, code="FORMS_B2_OTHER")

    creator = _make_user(
        db_session,
        email="editor.b2@x.com",
        role="project_editor",
        department_id=dept.id,
    )
    viewer = _make_user(
        db_session,
        email="viewer.b2@x.com",
        role="viewer",
        department_id=dept.id,
    )
    # A user in a different department — cannot view projects in `dept`
    outsider = _make_user(
        db_session,
        email="outsider.b2@x.com",
        role="viewer",
        department_id=other_dept.id,
    )

    return {
        "dept": dept,
        "other_dept": other_dept,
        "creator": creator,
        "viewer": viewer,
        "outsider": outsider,
    }


# ---------------------------------------------------------------------------
# Test 1: viewer submits on an active form → 201, status "pending"
# ---------------------------------------------------------------------------


def test_viewer_can_submit_active_form(env, db_session, client_as):
    dept = env["dept"]
    creator = env["creator"]
    viewer = env["viewer"]

    form, field = _make_active_cor_form(db_session, dept, creator)
    project = _make_project(db_session, dept, creator, "B2-001")

    c = client_as(viewer)
    r = c.post(
        f"/api/forms/{form.id}/submissions",
        json={
            "values": {str(field.id): "Some description text"},
            "target_project_id": str(project.id),
        },
    )
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "pending"
    assert body["form_id"] == str(form.id)
    assert body["submitted_by"] == str(viewer.id)
    # Resolved display name (not the raw UUID) is returned for the UI.
    assert body["submitted_by_name"] == viewer.display_name
    assert body["target_project_id"] == str(project.id)


# ---------------------------------------------------------------------------
# Test 2: submit on a draft form (viewer) → 404
# ---------------------------------------------------------------------------


def test_submit_draft_form_is_404_for_viewer(env, db_session, client_as):
    dept = env["dept"]
    creator = env["creator"]
    viewer = env["viewer"]

    form, field = _make_active_cor_form(db_session, dept, creator, status="draft")
    project = _make_project(db_session, dept, creator, "B2-002")

    c = client_as(viewer)
    r = c.post(
        f"/api/forms/{form.id}/submissions",
        json={
            "values": {str(field.id): "text"},
            "target_project_id": str(project.id),
        },
    )
    assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# Test 3: active COR form with requires_project, no target_project_id → 422
# ---------------------------------------------------------------------------


def test_cor_form_requires_target_project_id(env, db_session, client_as):
    dept = env["dept"]
    creator = env["creator"]
    viewer = env["viewer"]

    form, field = _make_active_cor_form(db_session, dept, creator)

    c = client_as(viewer)
    r = c.post(
        f"/api/forms/{form.id}/submissions",
        json={
            "values": {str(field.id): "some text"},
            # target_project_id omitted intentionally
        },
    )
    assert r.status_code == 422, r.text
    assert "target project" in r.text.lower()


# ---------------------------------------------------------------------------
# Test 4: missing required field → 422
# ---------------------------------------------------------------------------


def test_missing_required_field_returns_422(env, db_session, client_as):
    dept = env["dept"]
    creator = env["creator"]
    viewer = env["viewer"]

    form, _field = _make_active_cor_form(db_session, dept, creator, with_required_field=True)
    project = _make_project(db_session, dept, creator, "B2-003")

    c = client_as(viewer)
    # Submitting empty values — the required "Description" field is missing
    r = c.post(
        f"/api/forms/{form.id}/submissions",
        json={
            "values": {},
            "target_project_id": str(project.id),
        },
    )
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# Test 5: target_project_id the submitter can't view → 404
# ---------------------------------------------------------------------------


def test_target_project_not_visible_to_submitter_returns_404(env, db_session, client_as):
    dept = env["dept"]
    creator = env["creator"]
    outsider = env["outsider"]

    form, field = _make_active_cor_form(db_session, dept, creator)
    # project is in `dept`; outsider is only in `other_dept`
    project = _make_project(db_session, dept, creator, "B2-004")

    c = client_as(outsider)
    # Outsider IS in the form's dept? No — form is in dept, outsider is in other_dept.
    # So outsider can't even see the form (→ 404 too). To isolate the project 404,
    # we need a form the outsider CAN see. Create one in other_dept instead.
    other_dept = env["other_dept"]
    other_creator = _make_user(
        db_session,
        email="editor.b2.other@x.com",
        role="project_editor",
        department_id=other_dept.id,
    )
    other_form, other_field = _make_active_cor_form(db_session, other_dept, other_creator)

    r = c.post(
        f"/api/forms/{other_form.id}/submissions",
        json={
            "values": {str(other_field.id): "text"},
            "target_project_id": str(project.id),  # project is in `dept`, not `other_dept`
        },
    )
    assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# B3 fixtures / helpers
# ---------------------------------------------------------------------------


def _make_mapped_cor_form(
    db_session: Session, dept: Department, creator
) -> tuple[Form, FormField]:
    """Create a COR form with a long_text field bound to COR 'description'."""
    form = Form(
        department_id=dept.id,
        name="Mapped COR Form",
        target_entity="cor",
        status="active",
        created_by=creator.id,
    )
    db_session.add(form)
    db_session.flush()

    field = FormField(
        form_id=form.id,
        label="Description",
        field_type="long_text",
        required=False,
        order_index=0,
        target_key="description",
    )
    db_session.add(field)
    db_session.flush()
    return form, field


def _make_submission(
    db_session: Session,
    form: Form,
    submitter,
    values: dict,
    *,
    status: str = "pending",
    target_project_id=None,
) -> FormSubmission:
    sub = FormSubmission(
        form_id=form.id,
        submitted_by=submitter.id,
        values={str(k): v for k, v in values.items()},
        status=status,
        target_project_id=target_project_id,
    )
    db_session.add(sub)
    db_session.flush()
    return sub


@pytest.fixture
def b3_env(db_session: Session):
    dept = _make_dept(db_session, code="FORMS_B3")

    editor = _make_user(
        db_session,
        email="editor.b3@x.com",
        role="project_editor",
        department_id=dept.id,
    )
    viewer1 = _make_user(
        db_session,
        email="viewer1.b3@x.com",
        role="viewer",
        department_id=dept.id,
    )
    viewer2 = _make_user(
        db_session,
        email="viewer2.b3@x.com",
        role="viewer",
        department_id=dept.id,
    )

    return {
        "dept": dept,
        "editor": editor,
        "viewer1": viewer1,
        "viewer2": viewer2,
    }


# ---------------------------------------------------------------------------
# Test B3-1: editor sees ALL submissions; viewer sees only their own
# ---------------------------------------------------------------------------


def test_list_submissions_editor_sees_all(b3_env, db_session, client_as):
    dept = b3_env["dept"]
    editor = b3_env["editor"]
    viewer1 = b3_env["viewer1"]
    viewer2 = b3_env["viewer2"]

    form, field = _make_active_cor_form(db_session, dept, editor)
    sub1 = _make_submission(db_session, form, viewer1, {field.id: "v1"})
    sub2 = _make_submission(db_session, form, viewer2, {field.id: "v2"})

    # Editor should see both
    c = client_as(editor)
    r = c.get(f"/api/forms/{form.id}/submissions")
    assert r.status_code == 200, r.text
    body = r.json()
    ids = {item["id"] for item in body["items"]}
    assert str(sub1.id) in ids
    assert str(sub2.id) in ids
    assert body["total"] == 2

    # viewer1 should see only their own submission
    c2 = client_as(viewer1)
    r2 = c2.get(f"/api/forms/{form.id}/submissions")
    assert r2.status_code == 200, r2.text
    body2 = r2.json()
    ids2 = {item["id"] for item in body2["items"]}
    assert str(sub1.id) in ids2
    assert str(sub2.id) not in ids2
    assert body2["total"] == 1


# ---------------------------------------------------------------------------
# Test B3-2: ?status=pending filters correctly
# ---------------------------------------------------------------------------


def test_list_submissions_status_filter(b3_env, db_session, client_as):
    dept = b3_env["dept"]
    editor = b3_env["editor"]
    viewer1 = b3_env["viewer1"]

    form, field = _make_active_cor_form(db_session, dept, editor)
    sub_pending = _make_submission(db_session, form, viewer1, {field.id: "p"}, status="pending")
    sub_approved = _make_submission(
        db_session, form, viewer1, {field.id: "a"}, status="approved"
    )

    c = client_as(editor)
    r = c.get(f"/api/forms/{form.id}/submissions?status=pending")
    assert r.status_code == 200, r.text
    body = r.json()
    ids = {item["id"] for item in body["items"]}
    assert str(sub_pending.id) in ids
    assert str(sub_approved.id) not in ids

    # unknown status → 422
    r2 = c.get(f"/api/forms/{form.id}/submissions?status=bogus")
    assert r2.status_code == 422, r2.text


# ---------------------------------------------------------------------------
# Test B3-3: detail returns proposed_changes for a mapped field
# ---------------------------------------------------------------------------


def test_submission_detail_proposed_changes(b3_env, db_session, client_as):
    dept = b3_env["dept"]
    editor = b3_env["editor"]
    viewer1 = b3_env["viewer1"]

    form, field = _make_mapped_cor_form(db_session, dept, editor)
    sub = _make_submission(
        db_session, form, viewer1, {field.id: "Fix the framing"}
    )

    c = client_as(editor)
    r = c.get(f"/api/forms/{form.id}/submissions/{sub.id}")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["id"] == str(sub.id)

    changes = body["proposed_changes"]
    assert len(changes) == 1
    change = changes[0]
    assert change["group"] == "Change order"
    assert change["target"] == "Description"
    assert change["value"] == "Fix the framing"
    assert change["field_id"] == str(field.id)


# ---------------------------------------------------------------------------
# Test B3-4: non-editor requesting another user's submission detail → 404
# ---------------------------------------------------------------------------


def test_submission_detail_other_user_is_404_for_viewer(b3_env, db_session, client_as):
    dept = b3_env["dept"]
    editor = b3_env["editor"]
    viewer1 = b3_env["viewer1"]
    viewer2 = b3_env["viewer2"]

    form, field = _make_active_cor_form(db_session, dept, editor)
    # viewer2 submits
    sub = _make_submission(db_session, form, viewer2, {field.id: "v2 text"})

    # viewer1 tries to read viewer2's submission → 404 (no existence leak)
    c = client_as(viewer1)
    r = c.get(f"/api/forms/{form.id}/submissions/{sub.id}")
    assert r.status_code == 404, r.text


# ---------------------------------------------------------------------------
# C3 helpers
# ---------------------------------------------------------------------------


def _make_cor_form_with_amount(
    db_session: Session, dept: Department, creator
) -> tuple[Form, FormField, FormField]:
    """COR form with description (long_text → description) and amount (currency → amount)."""
    form = Form(
        department_id=dept.id,
        name="COR Push Form",
        target_entity="cor",
        status="active",
        created_by=creator.id,
    )
    db_session.add(form)
    db_session.flush()

    desc_field = FormField(
        form_id=form.id,
        label="Description",
        field_type="long_text",
        required=True,
        order_index=0,
        target_key="description",
    )
    amount_field = FormField(
        form_id=form.id,
        label="Amount",
        field_type="currency",
        required=False,
        order_index=1,
        target_key="amount",
    )
    db_session.add_all([desc_field, amount_field])
    db_session.flush()
    return form, desc_field, amount_field


@pytest.fixture
def c3_env(db_session: Session):
    dept = _make_dept(db_session, code="FORMS_C3")
    other_dept = _make_dept(db_session, code="FORMS_C3_OTHER")

    editor = _make_user(
        db_session,
        email="editor.c3@x.com",
        role="project_editor",
        department_id=dept.id,
    )
    viewer = _make_user(
        db_session,
        email="viewer.c3@x.com",
        role="viewer",
        department_id=dept.id,
    )
    # An editor scoped only to other_dept — cannot edit projects in dept
    other_editor = _make_user(
        db_session,
        email="other_editor.c3@x.com",
        role="project_editor",
        department_id=other_dept.id,
    )

    return {
        "dept": dept,
        "other_dept": other_dept,
        "editor": editor,
        "viewer": viewer,
        "other_editor": other_editor,
    }


# ---------------------------------------------------------------------------
# C3-1: editor approves → 200, COR created, submission approved, audits exist
# ---------------------------------------------------------------------------


def test_approve_creates_cor_and_marks_approved(c3_env, db_session, client_as):
    dept = c3_env["dept"]
    editor = c3_env["editor"]
    viewer = c3_env["viewer"]

    form, desc_field, amount_field = _make_cor_form_with_amount(db_session, dept, editor)
    project = _make_project(db_session, dept, editor, "C3-001")

    sub = _make_submission(
        db_session,
        form,
        viewer,
        {desc_field.id: "Fix the roof", amount_field.id: "1500.00"},
        target_project_id=project.id,
    )

    c = client_as(editor)
    r = c.post(
        f"/api/forms/{form.id}/submissions/{sub.id}/approve",
        json={
            "final_values": {
                str(desc_field.id): "Fix the roof (reviewed)",
                str(amount_field.id): "1500.00",
            },
            "target_project_id": str(project.id),
            "cor_number": "CO-001",
            "cor_status": "submitted",
        },
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "approved"
    assert body["pushed_entity_type"] == "cor"
    assert body["pushed_entity_id"] is not None
    cor_id = body["pushed_entity_id"]

    # Verify the COR was created in the DB.
    db_session.expire_all()
    cor = db_session.get(COR, cor_id)
    assert cor is not None
    assert cor.number == "CO-001"
    assert cor.description == "Fix the roof (reviewed)"

    # Verify submission updated.
    db_session.refresh(sub)
    assert sub.status == "approved"
    assert sub.reviewed_by == editor.id
    assert sub.pushed_entity_type == "cor"

    # Audit rows: one for the COR create, one for the submission transition.
    from sqlalchemy import select as sa_select
    cor_audits = list(db_session.execute(
        sa_select(AuditLog).where(
            AuditLog.entity_type == "cor",
            AuditLog.entity_id == cor.id,
            AuditLog.operation == "create",
        )
    ).scalars())
    assert len(cor_audits) == 1

    sub_audits = list(db_session.execute(
        sa_select(AuditLog).where(
            AuditLog.entity_type == "form_submission",
            AuditLog.entity_id == sub.id,
            AuditLog.operation == "transition",
        )
    ).scalars())
    assert len(sub_audits) == 1
    assert sub_audits[0].changes.get("to") == "approved"


# ---------------------------------------------------------------------------
# C3-2: viewer cannot approve → 403
# ---------------------------------------------------------------------------


def test_viewer_cannot_approve(c3_env, db_session, client_as):
    dept = c3_env["dept"]
    editor = c3_env["editor"]
    viewer = c3_env["viewer"]

    form, desc_field, _ = _make_cor_form_with_amount(db_session, dept, editor)
    project = _make_project(db_session, dept, editor, "C3-002")
    sub = _make_submission(
        db_session, form, viewer, {desc_field.id: "text"}, target_project_id=project.id
    )

    c = client_as(viewer)
    r = c.post(
        f"/api/forms/{form.id}/submissions/{sub.id}/approve",
        json={
            "final_values": {str(desc_field.id): "text"},
            "target_project_id": str(project.id),
            "cor_number": "CO-002",
        },
    )
    assert r.status_code == 403, r.text


# ---------------------------------------------------------------------------
# C3-3: approving already-approved/rejected submission → 409
# ---------------------------------------------------------------------------


def test_approve_already_reviewed_returns_409(c3_env, db_session, client_as):
    dept = c3_env["dept"]
    editor = c3_env["editor"]
    viewer = c3_env["viewer"]

    form, desc_field, _ = _make_cor_form_with_amount(db_session, dept, editor)
    project = _make_project(db_session, dept, editor, "C3-003")

    for already_status in ("approved", "rejected"):
        sub = _make_submission(
            db_session,
            form,
            viewer,
            {desc_field.id: "text"},
            status=already_status,
            target_project_id=project.id,
        )
        c = client_as(editor)
        r = c.post(
            f"/api/forms/{form.id}/submissions/{sub.id}/approve",
            json={
                "final_values": {str(desc_field.id): "text"},
                "target_project_id": str(project.id),
                "cor_number": "CO-003x",
            },
        )
        assert r.status_code == 409, f"Expected 409 for status={already_status}, got {r.status_code}"
        assert "already been reviewed" in r.text


# ---------------------------------------------------------------------------
# C3-4: duplicate cor_number → 409, submission stays pending
# ---------------------------------------------------------------------------


def test_approve_duplicate_cor_number_returns_409(c3_env, db_session, client_as):
    dept = c3_env["dept"]
    editor = c3_env["editor"]
    viewer = c3_env["viewer"]

    form, desc_field, _ = _make_cor_form_with_amount(db_session, dept, editor)
    project = _make_project(db_session, dept, editor, "C3-004")

    # Pre-create a COR with the same number on the same project.
    existing_cor = COR(
        project_id=project.id,
        number="DUPE-001",
        description="pre-existing",
        amount=0,
        status="submitted",
    )
    db_session.add(existing_cor)
    db_session.flush()

    sub = _make_submission(
        db_session, form, viewer, {desc_field.id: "text"}, target_project_id=project.id
    )
    # Commit test fixture data so it survives the rollback inside create_cor_record.
    db_session.commit()

    c = client_as(editor)
    r = c.post(
        f"/api/forms/{form.id}/submissions/{sub.id}/approve",
        json={
            "final_values": {str(desc_field.id): "text"},
            "target_project_id": str(project.id),
            "cor_number": "DUPE-001",
        },
    )
    assert r.status_code == 409, r.text
    assert "already exists" in r.text

    # Submission must still be pending — the savepoint rollback was clean.
    db_session.expire_all()
    from sqlalchemy import select as sa_select
    sub_reloaded = db_session.execute(
        sa_select(FormSubmission).where(FormSubmission.id == sub.id)
    ).scalar_one()
    assert sub_reloaded.status == "pending"


# ---------------------------------------------------------------------------
# C3-5: reviewer lacking edit on target project → 403 (cross-dept)
# ---------------------------------------------------------------------------


def test_approve_cross_dept_reviewer_returns_403(c3_env, db_session, client_as):
    dept = c3_env["dept"]
    editor = c3_env["editor"]
    viewer = c3_env["viewer"]
    other_editor = c3_env["other_editor"]

    form, desc_field, _ = _make_cor_form_with_amount(db_session, dept, editor)
    project = _make_project(db_session, dept, editor, "C3-005")
    sub = _make_submission(
        db_session, form, viewer, {desc_field.id: "text"}, target_project_id=project.id
    )

    # other_editor is a project_editor but in other_dept, so cannot edit
    # the form (in dept) → _fetch_form_for_edit raises 403 before we
    # even reach the project check.
    # To isolate the cross-dept *project* 403, give other_editor edit on
    # form's dept too, but the project is still in dept. Actually, the
    # simplest correct test: other_editor has no access to dept at all,
    # so they get 403 from _fetch_form_for_edit.
    c = client_as(other_editor)
    r = c.post(
        f"/api/forms/{form.id}/submissions/{sub.id}/approve",
        json={
            "final_values": {str(desc_field.id): "text"},
            "target_project_id": str(project.id),
            "cor_number": "CO-005",
        },
    )
    assert r.status_code == 403, r.text


# ---------------------------------------------------------------------------
# C3-6: reject sets rejected + note; no COR; re-rejecting → 409
# ---------------------------------------------------------------------------


def test_reject_sets_status_and_no_cor_created(c3_env, db_session, client_as):
    dept = c3_env["dept"]
    editor = c3_env["editor"]
    viewer = c3_env["viewer"]

    form, desc_field, _ = _make_cor_form_with_amount(db_session, dept, editor)
    project = _make_project(db_session, dept, editor, "C3-006")
    sub = _make_submission(
        db_session, form, viewer, {desc_field.id: "text"}, target_project_id=project.id
    )

    c = client_as(editor)
    r = c.post(
        f"/api/forms/{form.id}/submissions/{sub.id}/reject",
        json={"review_note": "Insufficient justification"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "rejected"
    assert body["review_note"] == "Insufficient justification"
    assert body["pushed_entity_type"] is None
    assert body["pushed_entity_id"] is None

    # Verify no COR was created.
    from sqlalchemy import select as sa_select, func as sa_func
    count = db_session.execute(
        sa_select(sa_func.count(COR.id)).where(COR.project_id == project.id)
    ).scalar()
    assert count == 0

    # Verify audit transition row.
    sub_audits = list(db_session.execute(
        sa_select(AuditLog).where(
            AuditLog.entity_type == "form_submission",
            AuditLog.entity_id == sub.id,
            AuditLog.operation == "transition",
        )
    ).scalars())
    assert len(sub_audits) == 1
    assert sub_audits[0].changes.get("to") == "rejected"

    # Re-rejecting → 409.
    r2 = c.post(
        f"/api/forms/{form.id}/submissions/{sub.id}/reject",
        json={"review_note": "again"},
    )
    assert r2.status_code == 409, r2.text
    assert "already been reviewed" in r2.text


# ---------------------------------------------------------------------------
# C3-14: reviewer can edit form's dept but not target project's dept → 403
# ---------------------------------------------------------------------------


def test_approve_blocked_when_reviewer_cannot_edit_target_project(
    db_session: Session, client_as
):
    """A reviewer who passes _fetch_form_for_edit (project_editor in dept A)
    but whose dept doesn't cover the target project (in dept B) must get a 403
    from push_submission's assert_can_edit_project.  The submission must remain
    pending and no COR must be created."""
    from sqlalchemy import select as sa_select, func as sa_func

    # Two departments: form lives in A, project lives in B.
    dept_a = _make_dept(db_session, code="C3_PROJ_A")
    dept_b = _make_dept(db_session, code="C3_PROJ_B")

    # Reviewer is project_editor in dept A only — can edit the form, but not
    # any project that belongs to dept B.
    reviewer = _make_user(
        db_session,
        email="reviewer.c3proj@x.com",
        role="project_editor",
        department_id=dept_a.id,
    )
    # Creator for dept B (needed to satisfy created_by FK on the project).
    creator_b = _make_user(
        db_session,
        email="creator.c3proj.b@x.com",
        role="project_editor",
        department_id=dept_b.id,
    )

    form, desc_field, _ = _make_cor_form_with_amount(db_session, dept_a, reviewer)
    project_b = _make_project(db_session, dept_b, creator_b, "C3-014-B")

    # Create the submission directly — reviewer passes form visibility but
    # target project is in dept B.
    sub = _make_submission(
        db_session,
        form,
        reviewer,
        {desc_field.id: "work description"},
        target_project_id=project_b.id,
    )

    c = client_as(reviewer)
    r = c.post(
        f"/api/forms/{form.id}/submissions/{sub.id}/approve",
        json={
            "final_values": {str(desc_field.id): "work description"},
            "target_project_id": str(project_b.id),
            "cor_number": "CO-014",
        },
    )
    assert r.status_code == 403, r.text

    # Submission must still be pending — no state mutation on 403.
    db_session.expire_all()
    sub_reloaded = db_session.get(FormSubmission, sub.id)
    assert sub_reloaded.status == "pending"

    # No COR should exist on the dept-B project.
    cor_count = db_session.execute(
        sa_select(sa_func.count(COR.id)).where(COR.project_id == project_b.id)
    ).scalar()
    assert cor_count == 0


# ---------------------------------------------------------------------------
# C3-7: final_values with invalid required value → 422
# ---------------------------------------------------------------------------


def test_approve_invalid_final_values_returns_422(c3_env, db_session, client_as):
    dept = c3_env["dept"]
    editor = c3_env["editor"]
    viewer = c3_env["viewer"]

    form, desc_field, amount_field = _make_cor_form_with_amount(db_session, dept, editor)
    project = _make_project(db_session, dept, editor, "C3-007")
    sub = _make_submission(
        db_session,
        form,
        viewer,
        {desc_field.id: "valid description"},
        target_project_id=project.id,
    )

    c = client_as(editor)
    # Pass an empty string for the required description field (treated as missing).
    r = c.post(
        f"/api/forms/{form.id}/submissions/{sub.id}/approve",
        json={
            "final_values": {str(desc_field.id): ""},   # empty = missing required
            "target_project_id": str(project.id),
            "cor_number": "CO-007",
        },
    )
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# General (collect-only) form approval: marks approved, no COR pushed
# (Phase 18.1)
# ---------------------------------------------------------------------------


def test_approve_general_form_marks_approved_no_push(env, db_session, client_as):
    dept = env["dept"]
    creator = env["creator"]
    viewer = env["viewer"]

    # A collect-only ("General") form: target_entity is None.
    form = Form(
        department_id=dept.id,
        name="Feedback",
        description=None,
        target_entity=None,
        status="active",
        created_by=creator.id,
    )
    db_session.add(form)
    db_session.flush()
    field = FormField(
        form_id=form.id,
        label="Comments",
        field_type="long_text",
        required=False,
        order_index=0,
    )
    db_session.add(field)
    db_session.flush()

    # Viewer submits — no target project required for a collect-only form.
    cv = client_as(viewer)
    r = cv.post(
        f"/api/forms/{form.id}/submissions",
        json={"values": {str(field.id): "looks good"}},
    )
    assert r.status_code == 201, r.text
    sid = r.json()["id"]

    # Editor approves with NO cor_number / target_project_id.
    ce = client_as(creator)
    a = ce.post(
        f"/api/forms/{form.id}/submissions/{sid}/approve",
        json={"final_values": {str(field.id): "looks good"}},
    )
    assert a.status_code == 200, a.text
    body = a.json()
    assert body["status"] == "approved"
    assert body["pushed_entity_type"] is None
    assert body["pushed_entity_id"] is None

    # No COR was created.
    assert db_session.query(COR).count() == 0


# ---------------------------------------------------------------------------
# #47: a collect-only form (no project-requiring target) must NOT persist a
# stray target_project_id, even if the client sends one.
# ---------------------------------------------------------------------------


def test_collect_only_submission_drops_target_project_id(env, db_session, client_as):
    dept = env["dept"]
    creator = env["creator"]
    viewer = env["viewer"]

    # Collect-only form: target_entity is None → no requires_project.
    form = Form(
        department_id=dept.id,
        name="General intake",
        description=None,
        target_entity=None,
        status="active",
        created_by=creator.id,
    )
    db_session.add(form)
    db_session.flush()

    c = client_as(viewer)
    # Client sends a stray target_project_id; it must be ignored/cleared.
    r = c.post(
        f"/api/forms/{form.id}/submissions",
        json={"values": {}, "target_project_id": str(uuid.uuid4())},
    )
    assert r.status_code == 201, r.text
    assert r.json()["target_project_id"] is None

    # Persisted value is None, not the stray UUID.
    sub = db_session.query(FormSubmission).filter_by(form_id=form.id).one()
    assert sub.target_project_id is None


# ---------------------------------------------------------------------------
# #50: a non-editor (viewer) may combine ?status= with the visibility rule and
# still only ever sees their OWN submissions.
# ---------------------------------------------------------------------------


def test_non_editor_status_filter_scopes_to_own(b3_env, db_session, client_as):
    dept = b3_env["dept"]
    editor = b3_env["editor"]
    viewer1 = b3_env["viewer1"]
    viewer2 = b3_env["viewer2"]

    form, field = _make_active_cor_form(db_session, dept, editor)
    mine_pending = _make_submission(db_session, form, viewer1, {field.id: "p"}, status="pending")
    _make_submission(db_session, form, viewer1, {field.id: "a"}, status="approved")
    _make_submission(db_session, form, viewer2, {field.id: "p2"}, status="pending")

    r = client_as(viewer1).get(f"/api/forms/{form.id}/submissions?status=pending")
    assert r.status_code == 200, r.text
    ids = [item["id"] for item in r.json()["items"]]
    # Only viewer1's pending — not their approved, not viewer2's pending.
    assert ids == [str(mine_pending.id)]


# ---------------------------------------------------------------------------
# #50: submission list is ordered newest-first (created_at desc).
# ---------------------------------------------------------------------------


def test_submission_list_ordered_newest_first(b3_env, db_session, client_as):
    from datetime import datetime, timedelta, timezone

    dept = b3_env["dept"]
    editor = b3_env["editor"]
    viewer1 = b3_env["viewer1"]

    form, field = _make_active_cor_form(db_session, dept, editor)
    base = datetime(2026, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
    subs = []
    for i in range(3):
        s = _make_submission(db_session, form, viewer1, {field.id: f"v{i}"})
        s.created_at = base + timedelta(minutes=i)  # oldest → newest
        subs.append(s)
    db_session.flush()

    r = client_as(editor).get(f"/api/forms/{form.id}/submissions")
    assert r.status_code == 200, r.text
    ids = [item["id"] for item in r.json()["items"]]
    # Newest (largest created_at) first.
    assert ids == [str(subs[2].id), str(subs[1].id), str(subs[0].id)]


# ---------------------------------------------------------------------------
# #50: an editor submitting to a DRAFT form → 422 (not 404 — editors can read
# drafts, but no one can submit to a non-active form).
# ---------------------------------------------------------------------------


def test_editor_submit_to_draft_returns_422(env, db_session, client_as):
    dept = env["dept"]
    creator = env["creator"]

    form, field = _make_active_cor_form(db_session, dept, creator, status="draft")
    project = _make_project(db_session, dept, creator, "DRAFT-422")

    r = client_as(creator).post(
        f"/api/forms/{form.id}/submissions",
        json={"values": {str(field.id): "x"}, "target_project_id": str(project.id)},
    )
    assert r.status_code == 422, r.text


# ---------------------------------------------------------------------------
# Phase 20.2: assignment-target approval creates an Assignment with the
# reviewer-chosen assignee (Pattern B).
# ---------------------------------------------------------------------------


def test_approve_assignment_target_creates_assignment(env, db_session, client_as):
    from backend.app.db.models import Assignment, Form, FormField

    dept = env["dept"]
    creator = env["creator"]   # project_editor in dept
    viewer = env["viewer"]     # viewer in dept (eligible assignee + can submit)

    project = _make_project(db_session, dept, creator, "ASG-RT-1")
    form = Form(department_id=dept.id, name="Task form", target_entity="assignment",
                status="active", created_by=creator.id)
    db_session.add(form)
    db_session.flush()
    desc = FormField(form_id=form.id, label="What", field_type="long_text",
                     required=True, order_index=0, target_key="description")
    db_session.add(desc)
    db_session.flush()

    # Viewer submits against the project.
    r = client_as(viewer).post(
        f"/api/forms/{form.id}/submissions",
        json={"values": {str(desc.id): "Inspect rebar"},
              "target_project_id": str(project.id)},
    )
    assert r.status_code == 201, r.text
    sid = r.json()["id"]

    # Editor approves, choosing the viewer as assignee.
    a = client_as(creator).post(
        f"/api/forms/{form.id}/submissions/{sid}/approve",
        json={"final_values": {str(desc.id): "Inspect rebar"},
              "target_project_id": str(project.id),
              "assignee_user_id": str(viewer.id)},
    )
    assert a.status_code == 200, a.text
    body = a.json()
    assert body["status"] == "approved"
    assert body["pushed_entity_type"] == "assignment"

    asg = db_session.query(Assignment).filter_by(project_id=project.id).one()
    assert asg.description == "Inspect rebar"
    assert asg.assignee_user_id == viewer.id
    assert asg.status == "open"


def test_approve_assignment_missing_assignee_422(env, db_session, client_as):
    from backend.app.db.models import Form, FormField

    dept = env["dept"]
    creator = env["creator"]
    viewer = env["viewer"]

    project = _make_project(db_session, dept, creator, "ASG-RT-2")
    form = Form(department_id=dept.id, name="Task form 2", target_entity="assignment",
                status="active", created_by=creator.id)
    db_session.add(form)
    db_session.flush()
    desc = FormField(form_id=form.id, label="What", field_type="long_text",
                     required=True, order_index=0, target_key="description")
    db_session.add(desc)
    db_session.flush()

    r = client_as(viewer).post(
        f"/api/forms/{form.id}/submissions",
        json={"values": {str(desc.id): "x"}, "target_project_id": str(project.id)},
    )
    sid = r.json()["id"]

    # No assignee_user_id → 422; submission stays pending.
    a = client_as(creator).post(
        f"/api/forms/{form.id}/submissions/{sid}/approve",
        json={"final_values": {str(desc.id): "x"},
              "target_project_id": str(project.id)},
    )
    assert a.status_code == 422, a.text
