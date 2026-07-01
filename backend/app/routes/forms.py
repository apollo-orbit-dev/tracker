"""Dept-shared custom forms. Build/edit gated by project_editor+ in the
form's department; active forms are readable by any viewer+ in the dept."""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.scope import (
    accessible_department_ids, assert_can_edit_dept, assert_can_view_project,
    has_role_in_dept,
)
from backend.app.auth.roles import PROJECT_EDITOR
from backend.app.db.models import (
    FORM_SUBMISSION_STATUSES,
    Form,
    FormField,
    FormSubmission,
    Project,
    Template,
    User,
    UserRole,
)
from backend.app.services.cor_create import CORNumberConflict
from backend.app.db.session import get_db
from backend.app.schemas.forms import (
    ApproveRequest, FieldReorderRequest, FormCreate, FormFieldCreate, FormFieldOut,
    FormFieldUpdate, FormListItem, FormListResponse, FormOut, FormUpdate,
    MAX_FIELDS_PER_FORM, RejectRequest,
    SubmissionCreate, SubmissionListItem, SubmissionListResponse, SubmissionOut,
)
from backend.app.schemas.roster import UserPickerItem, UserPickerResponse
from backend.app.services.audit import diff, record_audit

router = APIRouter(prefix="/api/forms", tags=["forms"])


@router.get("/targets")
def get_form_targets(current_user: User = Depends(get_current_user)):
    from backend.app.services.form_targets import FORM_TARGETS, field_type_map
    # `field_type_map` is the single source of truth for field↔target
    # compatibility; the frontend derives its compat check from it (#49).
    return {"targets": FORM_TARGETS, "field_type_map": field_type_map()}


def _fetch_form(db: Session, form_id: uuid.UUID) -> Form:
    obj = db.execute(
        select(Form).options(selectinload(Form.fields)).where(Form.id == form_id)
    ).scalar_one_or_none()
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Form not found")
    return obj


def _can_edit_form_dept(user: User, dept_id) -> bool:
    return has_role_in_dept(user, dept_id, PROJECT_EDITOR)


def _assert_template_binding(db: Session, department_id, target_entity, target_template_id) -> None:
    """Intake forms may bind a template that exists and lives in the form's
    department; non-intake forms must not carry a template binding (#20.5)."""
    if target_entity == "intake":
        if target_template_id is not None:
            tmpl = db.get(Template, target_template_id)
            if tmpl is None or tmpl.deleted_at is not None:
                raise HTTPException(status_code=422, detail="Bound template not found")
            if tmpl.department_id != department_id:
                raise HTTPException(
                    status_code=422,
                    detail="Bound template must be in the form's department",
                )
    elif target_template_id is not None:
        raise HTTPException(
            status_code=422, detail="Only intake forms can bind a template"
        )


def _assert_form_structure_mutable(form: Form) -> None:
    """Block structural edits (fields, target, template) on a published form.
    Editors must unpublish (move to draft) first. (#1, Phase 21)"""
    if form.status == "active":
        raise HTTPException(
            status_code=409,
            detail="Unpublish this form (move it to draft) before changing its structure.",
        )


def _fetch_form_for_edit(db: Session, user: User, form_id: uuid.UUID) -> Form:
    obj = _fetch_form(db, form_id)
    assert_can_edit_dept(user, obj.department_id)  # 403 if not editor+
    return obj


def _fetch_form_for_read(db: Session, user: User, form_id: uuid.UUID) -> Form:
    obj = _fetch_form(db, form_id)
    allowed = accessible_department_ids(user)  # None = org-wide
    in_scope = allowed is None or obj.department_id in allowed
    # Drafts/archived are editor-only; active visible to any viewer in dept.
    if obj.status == "active":
        if not in_scope:
            raise HTTPException(status_code=404, detail="Form not found")
        return obj
    if not _can_edit_form_dept(user, obj.department_id):
        raise HTTPException(status_code=404, detail="Form not found")
    return obj


def _live_fields(form: Form):
    return sorted(
        [f for f in form.fields if f.deleted_at is None],
        key=lambda f: (f.order_index, f.created_at),
    )


def _form_out(form: Form) -> FormOut:
    return FormOut.model_validate(
        {**form.__dict__, "fields": _live_fields(form)}
    )


@router.get("", response_model=FormListResponse)
def list_forms(
    department_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FormListResponse:
    allowed = accessible_department_ids(user)
    q = select(Form).where(Form.deleted_at.is_(None))
    if allowed is not None:
        q = q.where(Form.department_id.in_(allowed))
    if department_id is not None:
        q = q.where(Form.department_id == department_id)
    rows = list(db.execute(q.order_by(Form.updated_at.desc())).scalars())

    # Hide drafts/archived from non-editors.
    visible = [
        f for f in rows
        if f.status == "active" or _can_edit_form_dept(user, f.department_id)
    ]

    # #49: pending-review counts, only for forms the requester can review.
    # One grouped query — no N+1.
    editable_ids = [f.id for f in visible if _can_edit_form_dept(user, f.department_id)]
    pending_counts: dict[uuid.UUID, int] = {}
    if editable_ids:
        for fid, cnt in db.execute(
            select(FormSubmission.form_id, func.count())
            .where(
                FormSubmission.form_id.in_(editable_ids),
                FormSubmission.status == "pending",
            )
            .group_by(FormSubmission.form_id)
        ).all():
            pending_counts[fid] = cnt

    items = [
        FormListItem.model_validate(
            {**f.__dict__, "pending_count": pending_counts.get(f.id, 0)}
        )
        for f in visible
    ]
    return FormListResponse(items=items, total=len(items))


@router.post("", response_model=FormOut, status_code=status.HTTP_201_CREATED)
def create_form(
    payload: FormCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FormOut:
    assert_can_edit_dept(user, payload.department_id)
    _assert_template_binding(db, payload.department_id, payload.target_entity,
                             payload.target_template_id)
    form = Form(
        department_id=payload.department_id,
        name=payload.name,
        description=payload.description,
        target_entity=payload.target_entity,
        target_template_id=(
            payload.target_template_id if payload.target_entity == "intake" else None
        ),
        status="draft",
        created_by=user.id,
    )
    db.add(form)
    db.flush()
    record_audit(db, user=user, entity_type="form", entity_id=form.id,
                 operation="create",
                 changes={"initial": {"name": form.name,
                                      "department_id": form.department_id,
                                      "target_entity": form.target_entity,
                                      "status": form.status}})
    db.commit()
    db.refresh(form)
    return _form_out(form)


@router.get("/{form_id}", response_model=FormOut)
def get_form(form_id: uuid.UUID, db: Session = Depends(get_db),
             user: User = Depends(get_current_user)) -> FormOut:
    return _form_out(_fetch_form_for_read(db, user, form_id))


@router.get("/{form_id}/user-options", response_model=UserPickerResponse)
def form_user_options(
    form_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserPickerResponse:
    """Users in the form's department — populates a user-picker field at fill-out.

    Gated by form read-access (viewer+), so any submitter who can fill the form
    can resolve its user-picker fields. Scoped to the form's department, so
    submitters only see colleagues there (Phase 27.9). The picked assignee's
    project-view eligibility is re-checked at push (defence in depth)."""
    form = _fetch_form_for_read(db, user, form_id)
    rows = db.execute(
        select(User)
        .join(UserRole, UserRole.user_id == User.id)
        .where(
            UserRole.department_id == form.department_id,
            User.deleted_at.is_(None),
        )
        .distinct()
        .order_by(User.display_name.asc())
    ).scalars().all()
    items = [UserPickerItem.model_validate(u) for u in rows]
    return UserPickerResponse(items=items, total=len(items))


@router.patch("/{form_id}", response_model=FormOut)
def update_form(form_id: uuid.UUID, payload: FormUpdate,
                db: Session = Depends(get_db),
                user: User = Depends(get_current_user)) -> FormOut:
    form = _fetch_form_for_edit(db, user, form_id)
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=422, detail="At least one field is required")
    # Structural changes (target / bound template) are locked while published —
    # status/name/description may still change (so you can unpublish). (#1)
    if form.status == "active" and (
        "target_entity" in data or "target_template_id" in data
    ):
        _assert_form_structure_mutable(form)
    _tracked = ("name", "description", "target_entity", "target_template_id", "status")
    before = {k: getattr(form, k) for k in _tracked}
    for k, v in data.items():
        setattr(form, k, v)
    # If target_entity changed, unmap fields whose target is no longer valid.
    if "target_entity" in data:
        from backend.app.services.form_targets import target_field
        for f in form.fields:
            if f.target_key and target_field(form.target_entity, f.target_key) is None:
                f.target_key = None
    # A non-intake form must not retain a template binding.
    if form.target_entity != "intake":
        form.target_template_id = None
    _assert_template_binding(db, form.department_id, form.target_entity,
                             form.target_template_id)
    # An intake form can't go active without a bound template (nothing to create).
    if form.status == "active" and form.target_entity == "intake" and form.target_template_id is None:
        raise HTTPException(
            status_code=422,
            detail="Bind a template before activating an intake form.",
        )
    after = {k: getattr(form, k) for k in _tracked}
    record_audit(db, user=user, entity_type="form", entity_id=form.id,
                 operation="update", changes=diff(before, after, fields=list(_tracked)))
    db.commit()
    db.refresh(form)
    return _form_out(form)


@router.delete("/{form_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_form(form_id: uuid.UUID, db: Session = Depends(get_db),
                user: User = Depends(get_current_user)) -> Response:
    form = _fetch_form_for_edit(db, user, form_id)
    form.deleted_at = datetime.now(timezone.utc)
    form.deleted_by = user.id
    record_audit(db, user=user, entity_type="form", entity_id=form.id,
                 operation="delete", changes={})
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _validate_field_against_form(db: Session, form: Form, payload) -> None:
    """Re-run binding compat with the FORM's target_entity (the schema only
    knows the entity the client passed; the form is the source of truth).

    For an intake form, ``target_key`` may also be one of the bound template's
    custom-field def ids — those are dynamic, per-form targets not in the static
    registry (Phase 20.5c). The "title" built-in stays in the registry.
    """
    from backend.app.services.form_targets import is_compatible, target_field

    if payload.target_key is None:
        return

    tf = target_field(form.target_entity, payload.target_key)
    if tf is not None:
        if not is_compatible(payload.field_type, tf["type"]):
            raise HTTPException(
                status_code=422,
                detail=f"field cannot bind to {payload.target_key} on this form",
            )
        return

    # Intake: the target may be a live custom-field def of the bound template.
    if form.target_entity == "intake" and form.target_template_id is not None:
        from backend.app.services.project_create import live_field_defs

        for fd in live_field_defs(db, form.target_template_id):
            if str(fd.id) == payload.target_key:
                if not is_compatible(payload.field_type, fd.field_type):
                    raise HTTPException(
                        status_code=422,
                        detail=f"field cannot bind to {payload.target_key} on this form",
                    )
                return

    raise HTTPException(
        status_code=422,
        detail=f"field cannot bind to {payload.target_key} on this form",
    )


@router.post("/{form_id}/fields", response_model=FormFieldOut,
             status_code=status.HTTP_201_CREATED)
def add_field(form_id: uuid.UUID, payload: FormFieldCreate,
              db: Session = Depends(get_db),
              user: User = Depends(get_current_user)) -> FormFieldOut:
    form = _fetch_form_for_edit(db, user, form_id)
    _assert_form_structure_mutable(form)
    live = _live_fields(form)
    if len(live) >= MAX_FIELDS_PER_FORM:
        raise HTTPException(status_code=422, detail="Too many fields")
    _validate_field_against_form(db, form, payload)
    field = FormField(
        form_id=form.id, label=payload.label, field_type=payload.field_type,
        required=payload.required, help_text=payload.help_text,
        placeholder=payload.placeholder, options=payload.options,
        order_index=(live[-1].order_index + 1 if live else 0),
        target_key=payload.target_key,
    )
    db.add(field)
    db.flush()  # populate field.id before auditing
    record_audit(db, user=user, entity_type="form", entity_id=form.id,
                 operation="update",
                 changes={"field_added": {"id": str(field.id), "label": field.label,
                                          "field_type": field.field_type,
                                          "target_key": field.target_key}})
    db.commit()
    db.refresh(field)
    return FormFieldOut.model_validate(field)


@router.patch("/{form_id}/fields/{field_id}", response_model=FormFieldOut)
def update_field(form_id: uuid.UUID, field_id: uuid.UUID, payload: FormFieldUpdate,
                 db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)) -> FormFieldOut:
    form = _fetch_form_for_edit(db, user, form_id)
    _assert_form_structure_mutable(form)
    field = next((f for f in form.fields if f.id == field_id and f.deleted_at is None), None)
    if field is None:
        raise HTTPException(status_code=404, detail="Field not found")
    _validate_field_against_form(db, form, payload)
    tracked = ("label", "field_type", "required", "help_text", "placeholder", "options", "target_key")
    before = {k: getattr(field, k) for k in tracked}
    for k in tracked:
        setattr(field, k, getattr(payload, k))
    after = {k: getattr(field, k) for k in tracked}
    record_audit(db, user=user, entity_type="form", entity_id=form.id,
                 operation="update",
                 changes={"field_updated": {"id": str(field.id),
                                            **diff(before, after, fields=list(tracked))}})
    db.commit()
    db.refresh(field)
    return FormFieldOut.model_validate(field)


@router.delete("/{form_id}/fields/{field_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_field(form_id: uuid.UUID, field_id: uuid.UUID,
                 db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)) -> Response:
    form = _fetch_form_for_edit(db, user, form_id)
    _assert_form_structure_mutable(form)
    field = next((f for f in form.fields if f.id == field_id and f.deleted_at is None), None)
    if field is None:
        raise HTTPException(status_code=404, detail="Field not found")
    field.deleted_at = datetime.now(timezone.utc)
    record_audit(db, user=user, entity_type="form", entity_id=form.id,
                 operation="update",
                 changes={"field_deleted": {"id": str(field.id), "label": field.label}})
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{form_id}/fields/reorder", response_model=FormOut)
def reorder_fields(form_id: uuid.UUID, payload: FieldReorderRequest,
                   db: Session = Depends(get_db),
                   user: User = Depends(get_current_user)) -> FormOut:
    form = _fetch_form_for_edit(db, user, form_id)
    _assert_form_structure_mutable(form)
    live = {f.id: f for f in _live_fields(form)}
    if set(payload.field_ids) != set(live.keys()):
        raise HTTPException(status_code=422, detail="field_ids must list every live field exactly once")
    for i, fid in enumerate(payload.field_ids):
        live[fid].order_index = i
    record_audit(db, user=user, entity_type="form", entity_id=form.id,
                 operation="update",
                 changes={"fields_reordered": [str(fid) for fid in payload.field_ids]})
    db.commit()
    db.refresh(form)
    return _form_out(form)


@router.post("/{form_id}/submissions", response_model=SubmissionOut,
             status_code=status.HTTP_201_CREATED)
def create_submission(
    form_id: uuid.UUID,
    payload: SubmissionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubmissionOut:
    """Submit a response to an active form.

    - Drafts/archived forms → 404 for non-editors (same as GET).
    - Non-active forms (draft/archived) → 422 even for editors.
    - Value validation via ``validate_submission_values``.
    - If the target entity ``requires_project``, ``target_project_id`` must be
      supplied and the submitter must be able to view that project.
    """
    from backend.app.services.form_targets import target_descriptor
    from backend.app.services.form_values import (
        SubmissionValidationError,
        validate_submission_values,
    )

    # Step 1: fetch form — 404 hides drafts from non-editors.
    form = _fetch_form_for_read(db, user, form_id)

    # Step 2: reject non-active forms (even editors can't submit to draft/archived).
    if form.status != "active":
        raise HTTPException(status_code=422, detail="This form is not accepting submissions.")

    # Step 3: validate submitted values against live fields.
    fields = _live_fields(form)
    try:
        validate_submission_values(payload.values, fields)
    except SubmissionValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.reasons)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Step 4: if target entity requires a project, validate it.
    descriptor = target_descriptor(form.target_entity)
    if descriptor and descriptor.get("requires_project"):
        if payload.target_project_id is None:
            raise HTTPException(status_code=422, detail="A target project is required.")
        project = db.execute(
            select(Project).where(
                Project.id == payload.target_project_id,
                Project.deleted_at.is_(None),
            )
        ).scalar_one_or_none()
        if project is None:
            raise HTTPException(status_code=404, detail="Project not found")
        assert_can_view_project(user, project)  # 404 if not viewable

    # Step 5: insert submission.
    # #47: only persist a target project for forms whose target requires one.
    # A collect-only / no-project form must not store a stray target_project_id
    # (harmless today with only the COR target, but wrong for the intake/
    # collect-only path Stage 2 / Phase 20 adds).
    requires_project = bool(descriptor and descriptor.get("requires_project"))
    stored_project_id = payload.target_project_id if requires_project else None
    submission = FormSubmission(
        form_id=form.id,
        submitted_by=user.id,
        values=payload.values,
        target_project_id=stored_project_id,
        status="pending",
    )
    db.add(submission)
    db.flush()

    # Step 6: audit log.
    record_audit(
        db,
        user=user,
        entity_type="form_submission",
        entity_id=submission.id,
        operation="create",
        changes={"initial": {"form_id": str(form.id), "status": submission.status}},
        project_id=stored_project_id,
    )

    # Step 7: commit and return.
    db.commit()
    db.refresh(submission)
    return _submission_out(db, submission, [])


def _user_name_map(db: Session, ids) -> dict:
    """Resolve a set of user ids → display_name (one query, no N+1)."""
    wanted = {i for i in ids if i is not None}
    if not wanted:
        return {}
    rows = db.execute(
        select(User.id, User.display_name).where(User.id.in_(wanted))
    ).all()
    return {r[0]: r[1] for r in rows}


def _submission_out(db: Session, submission: FormSubmission, proposed_changes) -> SubmissionOut:
    """Build a SubmissionOut with submitter/reviewer display names resolved."""
    names = _user_name_map(db, {submission.submitted_by, submission.reviewed_by})
    return SubmissionOut.model_validate({
        **submission.__dict__,
        "submitted_by_name": names.get(submission.submitted_by),
        "reviewed_by_name": names.get(submission.reviewed_by),
        "proposed_changes": proposed_changes,
    })


@router.get("/{form_id}/submissions", response_model=SubmissionListResponse)
def list_submissions(
    form_id: uuid.UUID,
    status: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubmissionListResponse:
    """List submissions for a form.

    - Drafts hidden from non-editors (via _fetch_form_for_read).
    - Editors (project_editor+ in the form's dept) see ALL submissions.
    - Viewers see only their own submissions.
    - Optional ?status= filter (pending/approved/rejected); unknown value → 422.
    - Ordered newest-first.
    """
    if status is not None and status not in FORM_SUBMISSION_STATUSES:
        raise HTTPException(
            status_code=422,
            detail=f"Unknown status '{status}'. Must be one of: {sorted(FORM_SUBMISSION_STATUSES)}",
        )

    form = _fetch_form_for_read(db, user, form_id)

    q = select(FormSubmission).where(FormSubmission.form_id == form_id)

    if not _can_edit_form_dept(user, form.department_id):
        # Non-editors see only their own submissions.
        q = q.where(FormSubmission.submitted_by == user.id)

    if status is not None:
        q = q.where(FormSubmission.status == status)

    q = q.order_by(FormSubmission.created_at.desc())
    rows = list(db.execute(q).scalars())
    names = _user_name_map(db, {s.submitted_by for s in rows})
    items = [
        SubmissionListItem.model_validate({
            **s.__dict__,
            "submitted_by_name": names.get(s.submitted_by),
        })
        for s in rows
    ]
    return SubmissionListResponse(items=items, total=len(items))


@router.get("/{form_id}/submissions/{sid}", response_model=SubmissionOut)
def get_submission(
    form_id: uuid.UUID,
    sid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubmissionOut:
    """Fetch a single submission with proposed_changes populated.

    Visibility: editors see any submission; non-editors only see their own.
    Returns 404 (not 403) when a non-editor requests another user's submission
    to avoid existence leaks.
    """
    from backend.app.services.form_values import compute_proposed_changes

    form = _fetch_form_for_read(db, user, form_id)

    submission = db.execute(
        select(FormSubmission).where(
            FormSubmission.id == sid,
            FormSubmission.form_id == form_id,
        )
    ).scalar_one_or_none()

    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Visibility: non-editors may only see their own submissions.
    if not _can_edit_form_dept(user, form.department_id):
        if submission.submitted_by != user.id:
            raise HTTPException(status_code=404, detail="Submission not found")

    fields = _live_fields(form)
    proposed = compute_proposed_changes(form, fields, submission.values)

    return _submission_out(db, submission, proposed)


@router.post("/{form_id}/submissions/{sid}/approve", response_model=SubmissionOut)
def approve_submission(
    form_id: uuid.UUID,
    sid: uuid.UUID,
    payload: ApproveRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubmissionOut:
    """Approve a pending submission: validate values, push to COR, mark approved.

    Requires project_editor+ in the form's department (via _fetch_form_for_edit).
    The reviewer must also have project_editor+ on the target project's department
    (enforced inside push_submission via assert_can_edit_project).
    """
    from backend.app.services.form_push import push_submission
    from backend.app.services.form_targets import target_descriptor
    from backend.app.services.form_values import (
        SubmissionValidationError,
        validate_submission_values,
    )

    # Step 1: fetch form — editor+ only.
    form = _fetch_form_for_edit(db, user, form_id)

    # Step 2: fetch the submission and verify it belongs to this form.
    submission = db.execute(
        select(FormSubmission).where(
            FormSubmission.id == sid,
            FormSubmission.form_id == form_id,
        )
    ).scalar_one_or_none()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Step 3: reject if already reviewed.
    if submission.status != "pending":
        raise HTTPException(status_code=409, detail="This submission has already been reviewed.")

    # Step 4: validate final_values against live fields.
    fields = _live_fields(form)
    try:
        validate_submission_values(payload.final_values, fields)
    except SubmissionValidationError as exc:
        raise HTTPException(status_code=422, detail=exc.reasons)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))

    # Step 5: branch on the form's target entity.
    descriptor = target_descriptor(form.target_entity)
    if descriptor is None:
        # Collect-only ("General") form: nothing to push — just mark approved.
        submission.status = "approved"
        submission.reviewed_by = user.id
        submission.reviewed_at = datetime.now(timezone.utc)
        record_audit(
            db,
            user=user,
            entity_type="form_submission",
            entity_id=submission.id,
            operation="transition",
            changes={"to": "approved"},
            project_id=submission.target_project_id,
        )
    else:
        # Target form: dispatch to the target's writer (Phase 20.1). Per-target
        # approval inputs travel in ctx; each writer owns its own validation
        # (e.g. the COR writer requires target_project_id + cor_number → 422).
        # Let 403 from assert_can_edit_project propagate. CORNumberConflict means
        # create_cor_record already rolled back; do NOT roll back a second time.
        from backend.app.services.project_create import ProjectNumberConflict

        ctx = {
            "target_project_id": payload.target_project_id,
            "cor_number": payload.cor_number,
            "cor_status": payload.cor_status,
            "assignee_user_id": payload.assignee_user_id,
            "milestone_direction": payload.milestone_direction,
            "milestone_date_model": payload.milestone_date_model,
            "project_number": payload.intake_project_number,
        }
        try:
            push_submission(
                db,
                user,
                submission,
                form,
                final_values=payload.final_values,
                ctx=ctx,
            )
        except CORNumberConflict:
            raise HTTPException(
                status_code=409,
                detail="A COR with that number already exists on this project.",
            )
        except ProjectNumberConflict:
            raise HTTPException(
                status_code=409,
                detail="A project with that number already exists.",
            )

    # Step 6: commit and return.
    db.commit()
    db.refresh(submission)
    return _submission_out(db, submission, [])


@router.post("/{form_id}/submissions/{sid}/reject", response_model=SubmissionOut)
def reject_submission(
    form_id: uuid.UUID,
    sid: uuid.UUID,
    payload: RejectRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SubmissionOut:
    """Reject a pending submission. No COR is created.

    Requires project_editor+ in the form's department.
    """
    # Step 1: fetch form — editor+ only.
    form = _fetch_form_for_edit(db, user, form_id)

    # Step 2: fetch the submission and verify it belongs to this form.
    submission = db.execute(
        select(FormSubmission).where(
            FormSubmission.id == sid,
            FormSubmission.form_id == form_id,
        )
    ).scalar_one_or_none()
    if submission is None:
        raise HTTPException(status_code=404, detail="Submission not found")

    # Step 3: reject if already reviewed.
    if submission.status != "pending":
        raise HTTPException(status_code=409, detail="This submission has already been reviewed.")

    # Step 4: mark rejected and record audit.
    submission.status = "rejected"
    submission.review_note = payload.review_note
    submission.reviewed_by = user.id
    submission.reviewed_at = datetime.now(timezone.utc)

    record_audit(
        db,
        user=user,
        entity_type="form_submission",
        entity_id=submission.id,
        operation="transition",
        changes={"to": "rejected"},
        project_id=submission.target_project_id,
    )

    # Step 5: commit and return.
    db.commit()
    db.refresh(submission)
    return _submission_out(db, submission, [])
