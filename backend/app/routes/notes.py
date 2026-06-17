"""Per-project notes.

Phase 1.9.3 dept-scope: read/write requires viewer+ in the project's
dept (out-of-scope projects → 404). Within that, edit is author-only;
delete is author OR org admin.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, selectinload

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.roles import effective_roles
from backend.app.auth.scope import assert_can_view_project
from backend.app.db.models import Note, Project, User
from backend.app.db.session import get_db
from backend.app.services.audit import record_audit
from backend.app.schemas.notes import (
    NoteCreate,
    NoteListResponse,
    NoteOut,
    NoteUpdate,
)

router = APIRouter(prefix="/api/projects", tags=["notes"])


def _fetch_project_for_view(
    db: Session, user: User, pid: uuid.UUID
) -> Project:
    obj = db.execute(
        select(Project)
        .options(selectinload(Project.template))
        .where(Project.id == pid)
    ).scalar_one_or_none()
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    assert_can_view_project(user, obj)
    return obj


def _fetch_note(
    db: Session, user: User, pid: uuid.UUID, nid: uuid.UUID
) -> Note:
    project = _fetch_project_for_view(db, user, pid)
    obj = db.get(Note, nid)
    if (
        obj is None
        or obj.project_id != project.id
        or obj.deleted_at is not None
    ):
        raise HTTPException(status_code=404, detail="Note not found")
    return obj


def _can_modify(user: User, note: Note) -> bool:
    if note.created_by == user.id:
        return True
    return "admin" in effective_roles(user)


@router.get("/{pid}/notes", response_model=NoteListResponse)
def list_notes(
    pid: uuid.UUID,
    limit: int = Query(default=5, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NoteListResponse:
    _fetch_project_for_view(db, user, pid)
    base = select(Note).where(
        Note.project_id == pid, Note.deleted_at.is_(None)
    )
    total = db.execute(
        select(func.count()).select_from(base.subquery())
    ).scalar_one()
    rows = (
        db.execute(
            base.options(selectinload(Note.author))
            # id tiebreaker keeps the order stable when two notes share
            # the same created_at (common when posted in one transaction).
            .order_by(Note.created_at.desc(), Note.id.desc())
            .limit(limit)
            .offset(offset)
        )
        .scalars()
        .all()
    )
    return NoteListResponse(
        items=[NoteOut.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/{pid}/notes",
    response_model=NoteOut,
    status_code=status.HTTP_201_CREATED,
)
def create_note(
    pid: uuid.UUID,
    payload: NoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NoteOut:
    _fetch_project_for_view(db, user, pid)
    obj = Note(project_id=pid, body=payload.body, created_by=user.id)
    db.add(obj)
    db.flush()
    record_audit(
        db,
        user=user,
        entity_type="note",
        entity_id=obj.id,
        operation="create",
        changes={"initial": {"body": obj.body}},
        project_id=pid,
    )
    db.commit()
    db.refresh(obj)
    db.refresh(obj, attribute_names=["author"])
    return NoteOut.model_validate(obj)


@router.patch("/{pid}/notes/{nid}", response_model=NoteOut)
def update_note(
    pid: uuid.UUID,
    nid: uuid.UUID,
    payload: NoteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> NoteOut:
    obj = _fetch_note(db, user, pid, nid)
    if obj.created_by != user.id:
        raise HTTPException(
            status_code=403, detail="Only the author can edit this note"
        )
    old_body = obj.body
    obj.body = payload.body
    if old_body != obj.body:
        record_audit(
            db,
            user=user,
            entity_type="note",
            entity_id=obj.id,
            operation="update",
            changes={"body": [old_body, obj.body]},
            project_id=obj.project_id,
        )
    db.commit()
    db.refresh(obj)
    db.refresh(obj, attribute_names=["author"])
    return NoteOut.model_validate(obj)


@router.delete("/{pid}/notes/{nid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_note(
    pid: uuid.UUID,
    nid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    obj = _fetch_note(db, user, pid, nid)
    if not _can_modify(user, obj):
        raise HTTPException(
            status_code=403,
            detail="Only the author or an admin can delete this note",
        )
    obj.deleted_at = datetime.now(timezone.utc)
    obj.deleted_by = user.id
    record_audit(
        db,
        user=user,
        entity_type="note",
        entity_id=obj.id,
        operation="delete",
        changes={},
        project_id=obj.project_id,
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
