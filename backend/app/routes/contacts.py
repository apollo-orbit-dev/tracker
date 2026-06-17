"""Reusable contacts directory — department-scoped (Phase 1.9.2).

Visibility:
- Org admins see everything.
- Other users see only contacts in departments where they have viewer+.

Mutations:
- Org admins can mutate anywhere.
- Otherwise the caller must hold `department_manager` (or `admin`) in the
  contact's department. Project_editor and viewer get 403 on mutations.

The URL prefix stays at /api/admin/contacts for backwards-compat with the
frontend; "admin" in the path no longer literally means org-admin-only.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.scope import accessible_department_ids, assert_can_manage_dept
from backend.app.db.models import Contact, Department, User
from backend.app.db.session import get_db
from backend.app.schemas.contacts import (
    ContactCreate,
    ContactListResponse,
    ContactOut,
    ContactUpdate,
)

router = APIRouter(prefix="/api/admin/contacts", tags=["contacts"])


def _fetch_in_scope(
    db: Session, cid: uuid.UUID, allowed: set[uuid.UUID] | None
) -> Contact:
    obj = db.get(Contact, cid)
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Contact not found")
    if allowed is not None and obj.department_id not in allowed:
        # Out-of-scope contacts are indistinguishable from missing — same 404.
        raise HTTPException(status_code=404, detail="Contact not found")
    return obj


def _assert_dept_live(db: Session, dept_id: uuid.UUID) -> None:
    dept = db.get(Department, dept_id)
    if dept is None or dept.deleted_at is not None:
        raise HTTPException(
            status_code=422, detail="Department not found or deleted"
        )


@router.get("", response_model=ContactListResponse)
def list_contacts(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    include_deleted: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ContactListResponse:
    allowed = accessible_department_ids(user)
    base = select(Contact)
    if allowed is not None:
        if not allowed:
            return ContactListResponse(items=[], total=0, limit=limit, offset=offset)
        base = base.where(Contact.department_id.in_(allowed))
    if not include_deleted:
        base = base.where(Contact.deleted_at.is_(None))
    base = base.order_by(Contact.name.asc())
    total = db.execute(
        select(func.count()).select_from(base.subquery())
    ).scalar_one()
    rows = db.execute(base.limit(limit).offset(offset)).scalars().all()
    return ContactListResponse(
        items=[ContactOut.model_validate(r) for r in rows],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("", response_model=ContactOut, status_code=status.HTTP_201_CREATED)
def create_contact(
    payload: ContactCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ContactOut:
    _assert_dept_live(db, payload.department_id)
    assert_can_manage_dept(user, payload.department_id)
    obj = Contact(
        department_id=payload.department_id,
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        organization=payload.organization,
    )
    db.add(obj)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A contact with that email already exists in this department.",
        )
    db.commit()
    db.refresh(obj)
    return ContactOut.model_validate(obj)


@router.get("/{cid}", response_model=ContactOut)
def get_contact(
    cid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ContactOut:
    allowed = accessible_department_ids(user)
    return ContactOut.model_validate(_fetch_in_scope(db, cid, allowed))


@router.patch("/{cid}", response_model=ContactOut)
def update_contact(
    cid: uuid.UUID,
    payload: ContactUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ContactOut:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=422, detail="At least one field is required")
    # PATCH visibility is gated by management rights, not by viewer scope:
    # if you can manage the dept, you can see/edit it.
    obj = db.get(Contact, cid)
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Contact not found")
    assert_can_manage_dept(user, obj.department_id)
    for k, v in data.items():
        setattr(obj, k, v)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A contact with that email already exists in this department.",
        )
    db.commit()
    db.refresh(obj)
    return ContactOut.model_validate(obj)


@router.delete("/{cid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_contact(
    cid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    obj = db.get(Contact, cid)
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Contact not found")
    assert_can_manage_dept(user, obj.department_id)
    obj.deleted_at = datetime.now(timezone.utc)
    obj.deleted_by = user.id
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
