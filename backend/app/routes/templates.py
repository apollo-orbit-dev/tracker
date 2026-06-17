"""CRUD for templates and their nested field/milestone defs.

Phase 1.9.3 made templates department-scoped:
- READ endpoints (list, get, list fields/milestones, get field/milestone)
  require viewer+ in the template's dept. Out-of-scope reads return 404.
- WRITE endpoints (create/patch/delete on templates and their nested
  defs, reorder) require department_manager+ in the template's dept.
- Org admins bypass both checks.

Endpoints:
  /api/admin/templates                          — list / create
  /api/admin/templates/{tid}                    — get / patch / soft-delete
  /api/admin/templates/{tid}/fields             — list / create
  /api/admin/templates/{tid}/fields/{fid}       — get / patch / soft-delete
  /api/admin/templates/{tid}/milestones         — list / create
  /api/admin/templates/{tid}/milestones/{mid}   — get / patch / soft-delete
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.roles import VIEWER
from backend.app.auth.scope import (
    accessible_department_ids,
    assert_can_manage_dept,
    has_role_in_dept,
)
from backend.app.db.models import (
    SELECT_FIELD_TYPES,
    Template,
    TemplateFieldDef,
    TemplateMilestoneDef,
    User,
)
from backend.app.db.session import get_db
from backend.app.schemas.templates import (
    FieldDefCreate,
    FieldDefListResponse,
    FieldDefOut,
    FieldDefUpdate,
    MilestoneDefCreate,
    MilestoneDefListResponse,
    MilestoneDefOut,
    MilestoneDefUpdate,
    ReorderRequest,
    TemplateCreate,
    TemplateListResponse,
    TemplateOut,
    TemplateUpdate,
)

router = APIRouter(prefix="/api/admin/templates", tags=["templates"])


def _fetch_template_for_read(
    db: Session, user: User, tid: uuid.UUID
) -> Template:
    """Fetch a live template, 404-ing on missing OR out-of-scope."""
    obj = db.get(Template, tid)
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Template not found")
    if not has_role_in_dept(user, obj.department_id, VIEWER):
        raise HTTPException(status_code=404, detail="Template not found")
    return obj


def _fetch_template_for_write(
    db: Session, user: User, tid: uuid.UUID
) -> Template:
    """Fetch a live template and assert DM+ in its dept (admin bypasses)."""
    obj = db.get(Template, tid)
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Template not found")
    assert_can_manage_dept(user, obj.department_id)
    return obj


def _fetch_field(
    db: Session, tid: uuid.UUID, fid: uuid.UUID
) -> TemplateFieldDef:
    obj = db.get(TemplateFieldDef, fid)
    if (
        obj is None
        or obj.template_id != tid
        or obj.deleted_at is not None
    ):
        raise HTTPException(status_code=404, detail="Field not found")
    return obj


def _fetch_milestone(
    db: Session, tid: uuid.UUID, mid: uuid.UUID
) -> TemplateMilestoneDef:
    obj = db.get(TemplateMilestoneDef, mid)
    if (
        obj is None
        or obj.template_id != tid
        or obj.deleted_at is not None
    ):
        raise HTTPException(status_code=404, detail="Milestone not found")
    return obj


# ---- templates -----------------------------------------------------------


@router.get("", response_model=TemplateListResponse)
def list_templates(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    include_deleted: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TemplateListResponse:
    allowed = accessible_department_ids(user)
    base = select(Template)
    if allowed is not None:
        if not allowed:
            return TemplateListResponse(items=[], total=0, limit=limit, offset=offset)
        base = base.where(Template.department_id.in_(allowed))
    if not include_deleted:
        base = base.where(Template.deleted_at.is_(None))
    base = base.order_by(Template.name.asc())
    total = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()
    rows = db.execute(base.limit(limit).offset(offset)).scalars().all()
    return TemplateListResponse(
        items=[TemplateOut.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(
    payload: TemplateCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TemplateOut:
    assert_can_manage_dept(user, payload.department_id)
    obj = Template(
        name=payload.name,
        department_id=payload.department_id,
        client_id=payload.client_id,
        discipline_id=payload.discipline_id,
    )
    db.add(obj)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A template already exists for this department/client/discipline.",
        )
    db.commit()
    db.refresh(obj)
    return TemplateOut.model_validate(obj)


@router.get("/{tid}", response_model=TemplateOut)
def get_template(
    tid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TemplateOut:
    return TemplateOut.model_validate(_fetch_template_for_read(db, user, tid))


@router.patch("/{tid}", response_model=TemplateOut)
def update_template(
    tid: uuid.UUID,
    payload: TemplateUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TemplateOut:
    if payload.name is None:
        raise HTTPException(status_code=422, detail="At least one field is required")
    obj = _fetch_template_for_write(db, user, tid)
    obj.name = payload.name
    db.commit()
    db.refresh(obj)
    return TemplateOut.model_validate(obj)


@router.delete("/{tid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    tid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    obj = _fetch_template_for_write(db, user, tid)
    obj.deleted_at = datetime.now(timezone.utc)
    obj.deleted_by = user.id
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---- field defs ----------------------------------------------------------


@router.get("/{tid}/fields", response_model=FieldDefListResponse)
def list_fields(
    tid: uuid.UUID,
    include_deleted: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FieldDefListResponse:
    _fetch_template_for_read(db, user, tid)
    base = select(TemplateFieldDef).where(TemplateFieldDef.template_id == tid)
    if not include_deleted:
        base = base.where(TemplateFieldDef.deleted_at.is_(None))
    base = base.order_by(
        TemplateFieldDef.order_index.asc(), TemplateFieldDef.created_at.asc()
    )
    total = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()
    rows = db.execute(base).scalars().all()
    return FieldDefListResponse(
        items=[FieldDefOut.model_validate(r) for r in rows],
        total=total,
    )


def _next_order_index(db: Session, model: type, template_id: uuid.UUID) -> int:
    """Return max(order_index) + 1 across the template's live rows, or 0
    if there are none. Server-side authoritative — payload's order_index
    is ignored on create so new rows always go to the end."""
    current_max = db.execute(
        select(func.max(model.order_index)).where(
            model.template_id == template_id,
            model.deleted_at.is_(None),
        )
    ).scalar()
    return 0 if current_max is None else current_max + 1


@router.post(
    "/{tid}/fields", response_model=FieldDefOut, status_code=status.HTTP_201_CREATED
)
def create_field(
    tid: uuid.UUID,
    payload: FieldDefCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FieldDefOut:
    _fetch_template_for_write(db, user, tid)
    obj = TemplateFieldDef(
        template_id=tid,
        name=payload.name,
        field_type=payload.field_type,
        required=payload.required,
        is_project_metric=payload.is_project_metric,
        order_index=_next_order_index(db, TemplateFieldDef, tid),
        options=payload.options,
    )
    db.add(obj)
    db.flush()
    db.commit()
    db.refresh(obj)
    return FieldDefOut.model_validate(obj)


@router.get("/{tid}/fields/{fid}", response_model=FieldDefOut)
def get_field(
    tid: uuid.UUID,
    fid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FieldDefOut:
    _fetch_template_for_read(db, user, tid)
    return FieldDefOut.model_validate(_fetch_field(db, tid, fid))


@router.patch("/{tid}/fields/{fid}", response_model=FieldDefOut)
def update_field(
    tid: uuid.UUID,
    fid: uuid.UUID,
    payload: FieldDefUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FieldDefOut:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=422, detail="At least one field is required")
    _fetch_template_for_write(db, user, tid)
    obj = _fetch_field(db, tid, fid)

    new_type = data.get("field_type", obj.field_type)
    new_options = data.get("options", obj.options) if "options" in data else obj.options
    is_select = new_type in SELECT_FIELD_TYPES
    if is_select and new_options is None:
        raise HTTPException(
            status_code=422, detail=f"{new_type} requires options"
        )
    if not is_select and new_options is not None:
        raise HTTPException(
            status_code=422, detail=f"{new_type} must not have options"
        )

    for k, v in data.items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return FieldDefOut.model_validate(obj)


@router.delete(
    "/{tid}/fields/{fid}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_field(
    tid: uuid.UUID,
    fid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    _fetch_template_for_write(db, user, tid)
    obj = _fetch_field(db, tid, fid)
    obj.deleted_at = datetime.now(timezone.utc)
    obj.deleted_by = user.id
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---- milestone defs ------------------------------------------------------


@router.get("/{tid}/milestones", response_model=MilestoneDefListResponse)
def list_milestones(
    tid: uuid.UUID,
    include_deleted: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MilestoneDefListResponse:
    _fetch_template_for_read(db, user, tid)
    base = select(TemplateMilestoneDef).where(
        TemplateMilestoneDef.template_id == tid
    )
    if not include_deleted:
        base = base.where(TemplateMilestoneDef.deleted_at.is_(None))
    base = base.order_by(
        TemplateMilestoneDef.order_index.asc(),
        TemplateMilestoneDef.created_at.asc(),
    )
    total = db.execute(
        select(func.count()).select_from(base.subquery())
    ).scalar_one()
    rows = db.execute(base).scalars().all()
    return MilestoneDefListResponse(
        items=[MilestoneDefOut.model_validate(r) for r in rows],
        total=total,
    )


@router.post(
    "/{tid}/milestones",
    response_model=MilestoneDefOut,
    status_code=status.HTTP_201_CREATED,
)
def create_milestone(
    tid: uuid.UUID,
    payload: MilestoneDefCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MilestoneDefOut:
    _fetch_template_for_write(db, user, tid)
    obj = TemplateMilestoneDef(
        template_id=tid,
        name=payload.name,
        direction=payload.direction,
        date_model=payload.date_model,
        order_index=_next_order_index(db, TemplateMilestoneDef, tid),
    )
    db.add(obj)
    db.flush()
    db.commit()
    db.refresh(obj)
    return MilestoneDefOut.model_validate(obj)


@router.get("/{tid}/milestones/{mid}", response_model=MilestoneDefOut)
def get_milestone(
    tid: uuid.UUID,
    mid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MilestoneDefOut:
    _fetch_template_for_read(db, user, tid)
    return MilestoneDefOut.model_validate(_fetch_milestone(db, tid, mid))


@router.patch("/{tid}/milestones/{mid}", response_model=MilestoneDefOut)
def update_milestone(
    tid: uuid.UUID,
    mid: uuid.UUID,
    payload: MilestoneDefUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MilestoneDefOut:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=422, detail="At least one field is required")
    from backend.app.db.models import (
        MILESTONE_DATE_MODELS,
        MILESTONE_DIRECTIONS,
    )

    if "direction" in data and data["direction"] not in MILESTONE_DIRECTIONS:
        raise HTTPException(
            status_code=422, detail=f"unknown direction: {data['direction']}"
        )
    if "date_model" in data and data["date_model"] not in MILESTONE_DATE_MODELS:
        raise HTTPException(
            status_code=422, detail=f"unknown date_model: {data['date_model']}"
        )
    _fetch_template_for_write(db, user, tid)
    obj = _fetch_milestone(db, tid, mid)
    for k, v in data.items():
        setattr(obj, k, v)
    db.commit()
    db.refresh(obj)
    return MilestoneDefOut.model_validate(obj)


@router.delete(
    "/{tid}/milestones/{mid}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_milestone(
    tid: uuid.UUID,
    mid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    _fetch_template_for_write(db, user, tid)
    obj = _fetch_milestone(db, tid, mid)
    obj.deleted_at = datetime.now(timezone.utc)
    obj.deleted_by = user.id
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---- bulk reorder --------------------------------------------------------


def _reorder(
    db: Session,
    *,
    template_id: uuid.UUID,
    model: type,
    ordered_ids: list[uuid.UUID],
) -> None:
    """Atomically assign each row's order_index to its position in `ordered_ids`.

    Validates that `ordered_ids` is exactly the set of live row ids for the
    template — no missing, no extra, no duplicates.
    """
    if len(set(ordered_ids)) != len(ordered_ids):
        raise HTTPException(
            status_code=422, detail="ordered_ids contains duplicates"
        )

    live_rows = (
        db.execute(
            select(model).where(
                model.template_id == template_id,
                model.deleted_at.is_(None),
            )
        )
        .scalars()
        .all()
    )
    live_by_id = {row.id: row for row in live_rows}
    incoming_set = set(ordered_ids)
    live_set = set(live_by_id.keys())

    missing = live_set - incoming_set
    extra = incoming_set - live_set
    if missing or extra:
        reasons: list[str] = []
        for mid in missing:
            reasons.append(f"missing id: {mid}")
        for eid in extra:
            reasons.append(f"not in template: {eid}")
        raise HTTPException(status_code=422, detail=reasons)

    for position, item_id in enumerate(ordered_ids):
        live_by_id[item_id].order_index = position
    db.commit()


@router.post(
    "/{tid}/fields/reorder", status_code=status.HTTP_204_NO_CONTENT
)
def reorder_fields(
    tid: uuid.UUID,
    payload: ReorderRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    _fetch_template_for_write(db, user, tid)
    _reorder(
        db,
        template_id=tid,
        model=TemplateFieldDef,
        ordered_ids=payload.ordered_ids,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{tid}/milestones/reorder", status_code=status.HTTP_204_NO_CONTENT
)
def reorder_milestones(
    tid: uuid.UUID,
    payload: ReorderRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    _fetch_template_for_write(db, user, tid)
    _reorder(
        db,
        template_id=tid,
        model=TemplateMilestoneDef,
        ordered_ids=payload.ordered_ids,
    )
    return Response(status_code=status.HTTP_204_NO_CONTENT)
