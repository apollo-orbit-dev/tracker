"""CRUD for project Change Order Requests (CORs).

Nested under /api/projects/{pid}/cors. Phase 1.9.3: read gated by
viewer+ in the project's dept (out-of-scope → 404 on the project
lookup); writes gated by project_editor+ in the project's dept.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.scope import (
    assert_can_edit_project,
    assert_can_view_project,
)
from backend.app.db.models import COR, COR_STATUSES, Project, User
from backend.app.db.session import get_db
from backend.app.services.audit import diff, record_audit
from backend.app.services.cor_create import CORNumberConflict, create_cor_record
from backend.app.schemas.cors import (
    CORCreate,
    CORListResponse,
    COROut,
    CORUpdate,
)

router = APIRouter(prefix="/api/projects", tags=["cors"])


def _fetch_project(db: Session, pid: uuid.UUID) -> Project:
    obj = db.execute(
        select(Project)
        .options(selectinload(Project.template))
        .where(Project.id == pid)
    ).scalar_one_or_none()
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    return obj


def _fetch_project_for_read(
    db: Session, user: User, pid: uuid.UUID
) -> Project:
    obj = _fetch_project(db, pid)
    assert_can_view_project(user, obj)
    return obj


def _fetch_project_for_edit(
    db: Session, user: User, pid: uuid.UUID
) -> Project:
    obj = _fetch_project(db, pid)
    assert_can_edit_project(user, obj)
    return obj


def _fetch_project_cor(
    db: Session, project: Project, cid: uuid.UUID
) -> COR:
    obj = db.get(COR, cid)
    if (
        obj is None
        or obj.project_id != project.id
        or obj.deleted_at is not None
    ):
        raise HTTPException(status_code=404, detail="COR not found")
    return obj


def _validate_status(value: str) -> None:
    if value not in COR_STATUSES:
        raise HTTPException(
            status_code=422, detail=f"unknown status: {value}"
        )


@router.get("/{pid}/cors", response_model=CORListResponse)
def list_cors(
    pid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CORListResponse:
    _fetch_project_for_read(db, user, pid)
    rows = (
        db.execute(
            select(COR)
            .where(COR.project_id == pid, COR.deleted_at.is_(None))
            .order_by(COR.number.asc(), COR.created_at.asc())
        )
        .scalars()
        .all()
    )
    return CORListResponse(
        items=[COROut.model_validate(r) for r in rows], total=len(rows)
    )


@router.post(
    "/{pid}/cors",
    response_model=COROut,
    status_code=status.HTTP_201_CREATED,
)
def create_cor(
    pid: uuid.UUID,
    payload: CORCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> COROut:
    project = _fetch_project_for_edit(db, user, pid)
    _validate_status(payload.status)
    try:
        obj = create_cor_record(
            db,
            user,
            project,
            number=payload.number,
            description=payload.description,
            amount=payload.amount,
            status=payload.status,
            submitted_date=payload.submitted_date,
            approved_date=payload.approved_date,
        )
    except CORNumberConflict:
        raise HTTPException(
            status_code=409,
            detail="A COR with that number already exists on this project.",
        )
    db.commit()
    db.refresh(obj)
    return COROut.model_validate(obj)


@router.get("/{pid}/cors/{cid}", response_model=COROut)
def get_cor(
    pid: uuid.UUID,
    cid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> COROut:
    project = _fetch_project_for_read(db, user, pid)
    return COROut.model_validate(_fetch_project_cor(db, project, cid))


@router.patch("/{pid}/cors/{cid}", response_model=COROut)
def update_cor(
    pid: uuid.UUID,
    cid: uuid.UUID,
    payload: CORUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> COROut:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(
            status_code=422, detail="At least one field is required"
        )
    if "status" in data:
        _validate_status(data["status"])
    project = _fetch_project_for_edit(db, user, pid)
    obj = _fetch_project_cor(db, project, cid)
    _AUDITED_COR_FIELDS = (
        "number",
        "description",
        "amount",
        "status",
        "submitted_date",
        "approved_date",
    )
    before = {f: getattr(obj, f) for f in _AUDITED_COR_FIELDS}
    for k, v in data.items():
        setattr(obj, k, v)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A COR with that number already exists on this project.",
        )
    after = {f: getattr(obj, f) for f in _AUDITED_COR_FIELDS}
    changes = diff(before, after, fields=_AUDITED_COR_FIELDS)
    if changes:
        record_audit(
            db,
            user=user,
            entity_type="cor",
            entity_id=obj.id,
            operation="update",
            changes=changes,
            project_id=project.id,
        )
    db.commit()
    db.refresh(obj)
    return COROut.model_validate(obj)


@router.delete("/{pid}/cors/{cid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cor(
    pid: uuid.UUID,
    cid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    project = _fetch_project_for_edit(db, user, pid)
    obj = _fetch_project_cor(db, project, cid)
    obj.deleted_at = datetime.now(timezone.utc)
    obj.deleted_by = user.id
    record_audit(
        db,
        user=user,
        entity_type="cor",
        entity_id=obj.id,
        operation="delete",
        changes={},
        project_id=project.id,
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
