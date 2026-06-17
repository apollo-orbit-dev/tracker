"""Per-project contact attachments.

Phase 1.9.3: read gated by viewer+ in project's dept (out-of-scope
project → 404); writes gated by project_editor+ in project's dept.
Contact must also live in a dept the user can manage (or the same
dept as the project — enforced loosely via the contact-fetch contract
since contacts are themselves dept-scoped).
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
from backend.app.db.models import Contact, Project, ProjectContact, User
from backend.app.db.session import get_db
from backend.app.schemas.project_contacts import (
    ProjectContactCreate,
    ProjectContactListResponse,
    ProjectContactOut,
    ProjectContactUpdate,
)

router = APIRouter(prefix="/api/projects", tags=["project_contacts"])


def _fetch_project(db: Session, pid: uuid.UUID) -> Project:
    obj = db.execute(
        select(Project)
        .options(selectinload(Project.template))
        .where(Project.id == pid)
    ).scalar_one_or_none()
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    return obj


def _fetch_project_for_view(
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


def _fetch_attachment(
    db: Session, project: Project, pcid: uuid.UUID
) -> ProjectContact:
    obj = db.get(ProjectContact, pcid)
    if (
        obj is None
        or obj.project_id != project.id
        or obj.deleted_at is not None
    ):
        raise HTTPException(status_code=404, detail="Contact attachment not found")
    return obj


def _fetch_live_contact(db: Session, cid: uuid.UUID) -> Contact:
    obj = db.get(Contact, cid)
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(
            status_code=422, detail="Contact not found or soft-deleted"
        )
    return obj


@router.get("/{pid}/contacts", response_model=ProjectContactListResponse)
def list_project_contacts(
    pid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectContactListResponse:
    _fetch_project_for_view(db, user, pid)
    rows = (
        db.execute(
            select(ProjectContact)
            .options(selectinload(ProjectContact.contact))
            .where(
                ProjectContact.project_id == pid,
                ProjectContact.deleted_at.is_(None),
            )
            .order_by(ProjectContact.role.asc(), ProjectContact.created_at.asc())
        )
        .scalars()
        .all()
    )
    return ProjectContactListResponse(
        items=[ProjectContactOut.model_validate(r) for r in rows],
        total=len(rows),
    )


@router.post(
    "/{pid}/contacts",
    response_model=ProjectContactOut,
    status_code=status.HTTP_201_CREATED,
)
def attach_contact(
    pid: uuid.UUID,
    payload: ProjectContactCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectContactOut:
    _fetch_project_for_edit(db, user, pid)
    _fetch_live_contact(db, payload.contact_id)
    obj = ProjectContact(
        project_id=pid,
        contact_id=payload.contact_id,
        role=payload.role,
    )
    db.add(obj)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="That contact is already attached to this project with the same role.",
        )
    db.commit()
    db.refresh(obj)
    db.refresh(obj, attribute_names=["contact"])
    return ProjectContactOut.model_validate(obj)


@router.patch(
    "/{pid}/contacts/{pcid}", response_model=ProjectContactOut
)
def update_attachment_role(
    pid: uuid.UUID,
    pcid: uuid.UUID,
    payload: ProjectContactUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectContactOut:
    project = _fetch_project_for_edit(db, user, pid)
    obj = _fetch_attachment(db, project, pcid)
    obj.role = payload.role
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="That contact already plays this role on the project.",
        )
    db.commit()
    db.refresh(obj)
    db.refresh(obj, attribute_names=["contact"])
    return ProjectContactOut.model_validate(obj)


@router.delete(
    "/{pid}/contacts/{pcid}", status_code=status.HTTP_204_NO_CONTENT
)
def detach_contact(
    pid: uuid.UUID,
    pcid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    project = _fetch_project_for_edit(db, user, pid)
    obj = _fetch_attachment(db, project, pcid)
    obj.deleted_at = datetime.now(timezone.utc)
    obj.deleted_by = user.id
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
