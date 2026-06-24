"""Per-user-per-template column prefs CRUD.

GET 404 when no row exists. PUT does upsert. DELETE returns 204.
All three require the caller's accessible_department_ids to include
template.department_id — out-of-scope callers get 404 (existence
hiding, matches existing patterns).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.scope import accessible_department_ids
from backend.app.db.models import (
    Template,
    TemplateFieldDef,
    TemplateMilestoneDef,
    User,
    UserProjectViewColumns,
)
from backend.app.db.session import get_db
from backend.app.schemas.view_columns import ViewColumnsRead, ViewColumnsWrite
from backend.app.services.view_columns import (
    ValidationError,
    strip_orphans,
    validate_columns,
    validate_sort,
)

router = APIRouter(prefix="/api/projects/view", tags=["projects-view"])


def _fetch_template_for_caller(
    db: Session, user: User, template_id: uuid.UUID
) -> Template:
    """Fetch a live template the caller can see. 404 if missing or
    out of dept scope (existence-hiding)."""
    t = db.get(Template, template_id)
    if t is None or t.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Template not found")
    allowed = accessible_department_ids(user)
    if allowed is not None and t.department_id not in allowed:
        raise HTTPException(status_code=404, detail="Template not found")
    return t


def _live_template_ids(
    db: Session, template_id: uuid.UUID
) -> tuple[set[uuid.UUID], set[uuid.UUID]]:
    """Return (live_field_def_ids, live_milestone_def_ids) for the
    template — used to validate / strip orphans from the columns list.
    """
    field_ids = set(
        db.execute(
            select(TemplateFieldDef.id).where(
                TemplateFieldDef.template_id == template_id,
                TemplateFieldDef.deleted_at.is_(None),
            )
        ).scalars()
    )
    milestone_ids = set(
        db.execute(
            select(TemplateMilestoneDef.id).where(
                TemplateMilestoneDef.template_id == template_id,
                TemplateMilestoneDef.deleted_at.is_(None),
            )
        ).scalars()
    )
    return field_ids, milestone_ids


def _fetch_row(
    db: Session, user: User, template_id: uuid.UUID
) -> UserProjectViewColumns | None:
    return db.execute(
        select(UserProjectViewColumns).where(
            UserProjectViewColumns.user_id == user.id,
            UserProjectViewColumns.template_id == template_id,
        )
    ).scalar_one_or_none()


@router.get("/{template_id}/columns", response_model=ViewColumnsRead)
def get_view_columns(
    template_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ViewColumnsRead:
    _fetch_template_for_caller(db, user, template_id)
    row = _fetch_row(db, user, template_id)
    if row is None:
        raise HTTPException(status_code=404, detail="No saved prefs")

    field_ids, milestone_ids = _live_template_ids(db, template_id)
    cleaned = strip_orphans(
        list(row.columns or []),
        live_custom_field_ids=field_ids,
        live_milestone_def_ids=milestone_ids,
    )
    # Persist the cleanup if anything changed — same one-shot pattern
    # used by update_project on custom_field_values.
    if cleaned != list(row.columns or []):
        row.columns = cleaned
        db.commit()
        db.refresh(row)

    return ViewColumnsRead.model_validate(row)


@router.put("/{template_id}/columns", response_model=ViewColumnsRead)
def put_view_columns(
    template_id: uuid.UUID,
    payload: ViewColumnsWrite,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ViewColumnsRead:
    _fetch_template_for_caller(db, user, template_id)
    field_ids, milestone_ids = _live_template_ids(db, template_id)
    try:
        validate_columns(
            payload.columns,
            live_custom_field_ids=field_ids,
            live_milestone_def_ids=milestone_ids,
        )
        validate_sort(
            payload.sort_key,
            payload.sort_direction,
            live_custom_field_ids=field_ids,
        )
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.reasons)

    row = _fetch_row(db, user, template_id)
    if row is None:
        row = UserProjectViewColumns(
            user_id=user.id,
            template_id=template_id,
            columns=payload.columns,
            sort_key=payload.sort_key,
            sort_direction=payload.sort_direction,
        )
        db.add(row)
    else:
        row.columns = payload.columns
        row.sort_key = payload.sort_key
        row.sort_direction = payload.sort_direction
    db.commit()
    db.refresh(row)
    return ViewColumnsRead.model_validate(row)


@router.delete(
    "/{template_id}/columns", status_code=status.HTTP_204_NO_CONTENT
)
def delete_view_columns(
    template_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    _fetch_template_for_caller(db, user, template_id)
    row = _fetch_row(db, user, template_id)
    if row is not None:
        db.delete(row)
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
