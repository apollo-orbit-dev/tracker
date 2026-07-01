"""Push service: turn an approved FormSubmission into a real COR (Phase 17.14).

The caller owns the transaction — this service does NOT commit.
It re-raises ``CORNumberConflict`` so the route can map it to HTTP 409.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import HTTPException

from backend.app.auth.scope import assert_can_edit_dept, assert_can_edit_project
from backend.app.db.models import Event, Project
from backend.app.services.audit import record_audit
from backend.app.services.cor_create import CORNumberConflict, create_cor_record


def _write_cor(db, user, submission, form, *, final_values: dict, ctx: dict):
    """COR target writer: map ``final_values`` → COR fields, create the COR, and
    mark the submission approved. Registered in ``_WRITERS`` and reached via
    ``push_submission`` (Phase 20.1 writer dispatch).

    Parameters
    ----------
    db / user / submission / form:
        Active session, reviewing user, the ``FormSubmission`` to approve, and
        the ``Form`` (with ``fields`` loaded).
    final_values:
        Dict keyed by ``str(field.id)`` → submitted value.
    ctx:
        Per-target approval inputs. COR keys: ``target_project_id`` (required),
        ``cor_number`` (required), ``cor_status`` (default ``"submitted"``).

    Returns
    -------
    COR
        The newly created COR instance (not yet committed).

    Raises
    ------
    HTTPException(422):
        Missing target project / COR number, or empty / over-length description.
    HTTPException(404):
        Target project does not exist or has been soft-deleted.
    HTTPException(403):
        Reviewer lacks project_editor+ on the target project's department.
    CORNumberConflict:
        A non-deleted COR with the same number already exists on the project.
    """
    target_project_id = ctx.get("target_project_id")
    cor_number = ctx.get("cor_number")
    cor_status = ctx.get("cor_status") or "submitted"

    # COR-specific approval-time requirements (moved out of the route in 20.1).
    if target_project_id is None:
        raise HTTPException(status_code=422, detail="A target project is required.")
    if not cor_number:
        raise HTTPException(status_code=422, detail="A COR number is required.")

    # Resolve and validate the target project.
    project = db.get(Project, target_project_id)
    if project is None or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Target project not found")

    # 403 if the reviewer can't edit the target project's department.
    assert_can_edit_project(user, project)

    # Map live form fields by target_key → submitted value.
    mapped: dict[str, object] = {}
    for field in form.fields:
        if field.deleted_at is None and field.target_key:
            mapped[field.target_key] = final_values.get(str(field.id))

    description = (mapped.get("description") or "").strip()
    if not description:
        raise HTTPException(status_code=422, detail="COR description is required.")
    if len(description) > 2000:
        raise HTTPException(
            status_code=422,
            detail="COR description must be 2000 characters or fewer.",
        )
    amount = Decimal(str(mapped.get("amount") or "0"))

    # Create the COR (raises CORNumberConflict on duplicate number).
    cor = create_cor_record(
        db,
        user,
        project,
        number=cor_number,
        description=description,
        amount=amount,
        status=cor_status,
    )

    # Mark the submission as approved and record push metadata.
    submission.status = "approved"
    submission.reviewed_by = user.id
    submission.reviewed_at = datetime.now(timezone.utc)
    submission.pushed_entity_type = "cor"
    submission.pushed_entity_id = cor.id

    # Audit the submission transition.
    record_audit(
        db,
        user=user,
        entity_type="form_submission",
        entity_id=submission.id,
        operation="transition",
        changes={"to": "approved", "pushed": {"cor": str(cor.id)}},
        project_id=project.id,
    )

    return cor


def _mapped_values(form, final_values: dict) -> dict:
    """Collapse live bound fields → {target_key: submitted value}."""
    mapped: dict[str, object] = {}
    for field in form.fields:
        if field.deleted_at is None and field.target_key:
            mapped[field.target_key] = final_values.get(str(field.id))
    return mapped


def _write_assignment(db, user, submission, form, *, final_values: dict, ctx: dict):
    """Assignment target writer (Phase 20.2, assignee mapping Phase 27.9).

    Maps ``description`` (required) + ``due_date`` (optional) + ``assignee``
    (a user-picker field) from form fields; the reviewer can override the
    assignee at approval (``ctx.assignee_user_id`` wins when set). The assignee
    is constrained to users who can view the project (enforced by
    ``create_assignment_record``). New assignments start ``open``. Caller owns
    the transaction.

    ``ctx`` keys: ``target_project_id`` (required), ``assignee_user_id``
    (optional override).

    Raises HTTPException(422) for missing project / assignee / description or an
    over-length description; (404) for a missing project; (403) via
    ``assert_can_edit_project``; (422) for an ineligible assignee (from the
    assignment-create service).
    """
    import uuid as _uuid

    from backend.app.services.assignment_create import create_assignment_record

    target_project_id = ctx.get("target_project_id")
    if target_project_id is None:
        raise HTTPException(status_code=422, detail="A target project is required.")

    project = db.get(Project, target_project_id)
    if project is None or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Target project not found")
    assert_can_edit_project(user, project)

    mapped = _mapped_values(form, final_values)

    # Assignee: reviewer override (ctx) takes precedence over the submitter's
    # mapped user-picker field. Coerce a string id to UUID; bad/empty → 422.
    raw_assignee = ctx.get("assignee_user_id") or mapped.get("assignee")
    if not raw_assignee:
        raise HTTPException(status_code=422, detail="An assignee is required.")
    if isinstance(raw_assignee, _uuid.UUID):
        assignee_user_id = raw_assignee
    else:
        try:
            assignee_user_id = _uuid.UUID(str(raw_assignee))
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid assignee.")

    description = (mapped.get("description") or "").strip()
    if not description:
        raise HTTPException(status_code=422, detail="An assignment description is required.")
    if len(description) > 2000:
        raise HTTPException(
            status_code=422,
            detail="Assignment description must be 2000 characters or fewer.",
        )

    raw_due = mapped.get("due_date")
    due_date = date.fromisoformat(raw_due) if raw_due else None

    obj = create_assignment_record(
        db,
        user,
        project,
        assignee_user_id=assignee_user_id,
        description=description,
        due_date=due_date,
        status="open",
    )

    submission.status = "approved"
    submission.reviewed_by = user.id
    submission.reviewed_at = datetime.now(timezone.utc)
    submission.pushed_entity_type = "assignment"
    submission.pushed_entity_id = obj.id
    record_audit(
        db,
        user=user,
        entity_type="form_submission",
        entity_id=submission.id,
        operation="transition",
        changes={"to": "approved", "pushed": {"assignment": str(obj.id)}},
        project_id=project.id,
    )
    return obj


def _write_milestone(db, user, submission, form, *, final_values: dict, ctx: dict):
    """Milestone target writer (Phase 20.3).

    Creates an ad-hoc milestone (``template_milestone_def_id`` NULL). ``name``
    (required) + ``planned_date`` (optional) map from form fields; ``direction``
    and ``date_model`` are supplied by the reviewer at approval (``ctx`` —
    Pattern B), validated against their enums. Caller owns the transaction.

    ``ctx`` keys: ``target_project_id`` (required), ``milestone_direction``
    (required), ``milestone_date_model`` (required).
    """
    from backend.app.services.milestone_create import create_milestone_record

    target_project_id = ctx.get("target_project_id")
    direction = ctx.get("milestone_direction")
    date_model = ctx.get("milestone_date_model")
    if target_project_id is None:
        raise HTTPException(status_code=422, detail="A target project is required.")
    if not direction:
        raise HTTPException(status_code=422, detail="A milestone direction is required.")
    if not date_model:
        raise HTTPException(status_code=422, detail="A milestone date model is required.")

    project = db.get(Project, target_project_id)
    if project is None or project.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Target project not found")
    assert_can_edit_project(user, project)

    mapped = _mapped_values(form, final_values)
    name = (mapped.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=422, detail="A milestone name is required.")
    if len(name) > 200:
        raise HTTPException(
            status_code=422, detail="Milestone name must be 200 characters or fewer."
        )

    raw_planned = mapped.get("planned_date")
    planned_date = date.fromisoformat(raw_planned) if raw_planned else None

    obj = create_milestone_record(
        db,
        user,
        project,
        name=name,
        direction=direction,
        date_model=date_model,
        planned_date=planned_date,
    )

    submission.status = "approved"
    submission.reviewed_by = user.id
    submission.reviewed_at = datetime.now(timezone.utc)
    submission.pushed_entity_type = "milestone"
    submission.pushed_entity_id = obj.id
    record_audit(
        db,
        user=user,
        entity_type="form_submission",
        entity_id=submission.id,
        operation="transition",
        changes={"to": "approved", "pushed": {"milestone": str(obj.id)}},
        project_id=project.id,
    )
    return obj


def _write_event(db, user, submission, form, *, final_values: dict, ctx: dict):
    """Event target writer (Phase 20.4) — the first no-project writer (Pattern D).

    Creates a single, all-day, non-recurring dept calendar event in the form's
    department. ``title`` (required) + ``start_date`` (required) + ``end_date``
    (optional) + ``description`` (optional) map from form fields; there is no
    target project and no approval-time input. Caller owns the transaction.
    """
    # RBAC: the event lands in the form's department; the reviewer must be able
    # to edit there (they already passed the form-edit gate, but the writer owns
    # its own check — no new surface).
    assert_can_edit_dept(user, form.department_id)

    mapped = _mapped_values(form, final_values)
    title = (mapped.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="An event title is required.")
    if len(title) > 200:
        raise HTTPException(
            status_code=422, detail="Event title must be 200 characters or fewer."
        )

    raw_start = mapped.get("start_date")
    if not raw_start:
        raise HTTPException(status_code=422, detail="An event start date is required.")
    start_date = date.fromisoformat(raw_start)
    raw_end = mapped.get("end_date")
    end_date = date.fromisoformat(raw_end) if raw_end else None
    if end_date is not None and end_date < start_date:
        raise HTTPException(status_code=422, detail="end_date must be >= start_date")

    description = (mapped.get("description") or "").strip() or None

    obj = Event(
        department_id=form.department_id,
        created_by=user.id,
        title=title,
        description=description,
        all_day=True,
        start_date=start_date,
        end_date=end_date,
        recurrence=None,  # single, non-recurring event
    )
    db.add(obj)
    db.flush()
    record_audit(
        db,
        user=user,
        entity_type="event",
        entity_id=obj.id,
        operation="create",
        changes={"initial": {"title": obj.title, "start_date": obj.start_date,
                             "end_date": obj.end_date}},
    )

    submission.status = "approved"
    submission.reviewed_by = user.id
    submission.reviewed_at = datetime.now(timezone.utc)
    submission.pushed_entity_type = "event"
    submission.pushed_entity_id = obj.id
    record_audit(
        db,
        user=user,
        entity_type="form_submission",
        entity_id=submission.id,
        operation="transition",
        changes={"to": "approved", "pushed": {"event": str(obj.id)}},
    )
    return obj


def _write_intake(db, user, submission, form, *, final_values: dict, ctx: dict):
    """Project-intake target writer (Phase 20.5) — creates a NEW project.

    The form is bound to a template at build time (``form.target_template_id``);
    every approved submission creates a project under that template (milestones
    auto-spawn). ``title`` maps from a form field; ``project_number`` is entered
    by the reviewer at approval (``ctx``). Custom-field mapping arrives in 20.5c
    (custom_field_values is empty here). Caller owns the transaction.

    RBAC: ``assert_can_edit_dept`` on the bound template's department (the same
    check normal project creation uses; the template must be in the form's dept,
    enforced at build time).

    Raises HTTPException(422) for a missing template binding / project number /
    title; (404) for a missing template; (403) via assert_can_edit_dept;
    re-raises ``ProjectNumberConflict`` (route → 409).
    """
    from backend.app.db.models import Template
    from backend.app.services.project_create import create_project_record

    if form.target_template_id is None:
        raise HTTPException(
            status_code=422, detail="This intake form has no bound template."
        )
    project_number = (ctx.get("project_number") or "").strip()
    if not project_number:
        raise HTTPException(status_code=422, detail="A project number is required.")

    template = db.get(Template, form.target_template_id)
    if template is None or template.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Bound template not found")
    assert_can_edit_dept(user, template.department_id)

    mapped = _mapped_values(form, final_values)
    title = (mapped.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=422, detail="A project title is required.")
    if len(title) > 200:
        raise HTTPException(
            status_code=422, detail="Project title must be 200 characters or fewer."
        )

    # Non-"title" bound fields map to the bound template's custom-field defs
    # (target_key = def id). Values are already type-coerced by the submit/review
    # layer; create_project_record validates them against the template (20.5c).
    custom_field_values = {
        key: val
        for key, val in mapped.items()
        if key != "title" and val is not None and val != ""
    }

    project = create_project_record(
        db,
        user,
        template,
        project_number=project_number,
        title=title,
        custom_field_values=custom_field_values,
    )

    submission.status = "approved"
    submission.reviewed_by = user.id
    submission.reviewed_at = datetime.now(timezone.utc)
    submission.pushed_entity_type = "project"
    submission.pushed_entity_id = project.id
    record_audit(
        db,
        user=user,
        entity_type="form_submission",
        entity_id=submission.id,
        operation="transition",
        changes={"to": "approved", "pushed": {"project": str(project.id)}},
        project_id=project.id,
    )
    return project


# Registry of per-target writers, keyed by the descriptor's ``writer`` (Phase
# 20.1). All five form targets are registered.
_WRITERS = {
    "cor": _write_cor,
    "assignment": _write_assignment,
    "milestone": _write_milestone,
    "event": _write_event,
    "intake": _write_intake,
}


def push_submission(db, user, submission, form, *, final_values: dict, ctx: dict):
    """Dispatch an approved submission to its target's writer.

    Looks up the writer named by the form's target descriptor and delegates.
    Returns ``None`` for a collect-only form (no target — nothing to write).
    The caller owns the transaction (writers do NOT commit). Per-target inputs
    travel in ``ctx`` so this signature is stable as targets are added.

    Raises:
        HTTPException(500): the descriptor names a writer with no registration.
        Anything the chosen writer raises (e.g. ``CORNumberConflict``, 4xx).
    """
    from backend.app.services.form_targets import target_descriptor

    descriptor = target_descriptor(form.target_entity)
    if descriptor is None:
        return None  # collect-only: nothing to push
    writer = _WRITERS.get(descriptor.get("writer"))
    if writer is None:
        raise HTTPException(
            status_code=500, detail="No writer registered for this form target"
        )
    return writer(db, user, submission, form, final_values=final_values, ctx=ctx)
