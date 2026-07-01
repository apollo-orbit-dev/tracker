import uuid
from datetime import datetime, timezone

from backend.app.db.models import (
    Form, FormField, FormSubmission,
    FORM_FIELD_TYPES, FORM_TARGET_ENTITIES, FORM_STATUSES, FORM_SUBMISSION_STATUSES,
)
from backend.tests.conftest import _make_user, _make_dept


def _seed_dept_and_user(db_session):
    dept = _make_dept(db_session, code="FORMS_TEST")
    user = _make_user(
        db_session,
        email="forms_editor@example.com",
        role="project_editor",
        department_id=dept.id,
    )
    return (dept.id, user.id)


def test_form_constants_are_curated():
    assert FORM_FIELD_TYPES == {
        "short_text", "long_text", "integer", "decimal",
        "currency", "date", "single_select", "boolean", "user",
    }
    assert FORM_TARGET_ENTITIES == {"cor", "assignment", "milestone", "event", "intake"}
    assert FORM_STATUSES == {"draft", "active", "archived"}
    assert FORM_SUBMISSION_STATUSES == {"pending", "approved", "rejected"}


def test_can_persist_form_with_field_and_submission(db_session):
    dept_id, user_id = _seed_dept_and_user(db_session)
    form = Form(department_id=dept_id, name="COR request",
                target_entity="cor", status="draft", created_by=user_id)
    db_session.add(form)
    db_session.flush()
    field = FormField(form_id=form.id, label="Description",
                      field_type="long_text", order_index=0, target_key="description")
    db_session.add(field)
    db_session.flush()
    sub = FormSubmission(form_id=form.id, submitted_by=user_id,
                         values={str(field.id): "Need a CO"}, status="pending")
    db_session.add(sub)
    db_session.flush()
    assert form.id and field.form_id == form.id and sub.form_id == form.id
