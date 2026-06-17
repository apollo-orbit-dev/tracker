"""Admin-only user management.

Surfaces the per-user grant matrix and lets org admins create, edit,
soft-delete, password-reset, and grant/revoke org-admin on users.

Dept-bound role grants (department_manager / project_editor / viewer)
live in `backend/app/routes/roster.py`. This module deliberately does
NOT touch those — it only handles user identity + the org-admin grant.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.app.auth.passwords import hash_password
from backend.app.auth.permissions import require_role
from backend.app.db.models import AuthProvider, Department, User, UserRole
from backend.app.db.session import get_db
from backend.app.services.audit import record_audit
from backend.app.schemas.admin import (
    PasswordResetRequest,
    UserCreate,
    UserGrant,
    UserListItem,
    UserListResponse,
    UserUpdate,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


def _list_item(user: User, dept_code_by_id: dict[uuid.UUID, str]) -> UserListItem:
    grants = [
        UserGrant(
            role_id=ur.role_id,
            department_id=ur.department_id,
            department_code=(
                dept_code_by_id.get(ur.department_id)
                if ur.department_id is not None
                else None
            ),
        )
        for ur in user.user_roles
    ]
    return UserListItem(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        lifecycle_state=user.lifecycle_state,
        roles=sorted({ur.role_id for ur in user.user_roles}),
        grants=grants,
        created_at=user.created_at,
        updated_at=user.updated_at,
        deleted_at=user.deleted_at,
    )


def _fetch_alive(db: Session, user_id: uuid.UUID) -> User:
    obj = db.get(User, user_id)
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="User not found")
    return obj


def _dept_code_map(db: Session) -> dict[uuid.UUID, str]:
    """One-shot lookup of dept_id → code for embedding in list response."""
    rows = db.execute(select(Department.id, Department.code)).all()
    return {dept_id: code for dept_id, code in rows}


@router.get("/users", response_model=UserListResponse)
def list_users(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
) -> UserListResponse:
    base = (
        select(User)
        .where(User.deleted_at.is_(None))
        .order_by(User.email.asc())
        .options(selectinload(User.user_roles))
    )
    total = db.execute(
        select(func.count()).select_from(base.subquery())
    ).scalar_one()
    users = (
        db.execute(base.limit(limit).offset(offset)).scalars().unique().all()
    )
    dept_codes = _dept_code_map(db)
    return UserListResponse(
        users=[_list_item(u, dept_codes) for u in users],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/users", response_model=UserListItem, status_code=status.HTTP_201_CREATED
)
def create_user(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
) -> UserListItem:
    user = User(
        email=payload.email.lower().strip(),
        display_name=payload.display_name.strip(),
    )
    db.add(user)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="A user with that email already exists."
        )
    db.add(
        AuthProvider(
            user_id=user.id,
            provider="local",
            password_hash=hash_password(payload.password),
        )
    )
    db.commit()
    db.refresh(user)
    return _list_item(user, _dept_code_map(db))


@router.patch("/users/{user_id}", response_model=UserListItem)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("admin")),
) -> UserListItem:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(
            status_code=422, detail="At least one field is required"
        )
    user = _fetch_alive(db, user_id)
    # Self-lockout guard: an admin can't flip themselves to non-active.
    if (
        user.id == admin.id
        and "lifecycle_state" in data
        and data["lifecycle_state"] != "active"
    ):
        raise HTTPException(
            status_code=422,
            detail="You cannot change your own lifecycle state to non-active",
        )
    for k, v in data.items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)
    return _list_item(user, _dept_code_map(db))


@router.delete(
    "/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("admin")),
) -> Response:
    user = _fetch_alive(db, user_id)
    if user.id == admin.id:
        raise HTTPException(
            status_code=422, detail="You cannot delete your own account"
        )
    user.deleted_at = datetime.now(timezone.utc)
    user.deleted_by = admin.id
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/users/{user_id}/reset-password",
    status_code=status.HTTP_204_NO_CONTENT,
)
def reset_user_password(
    user_id: uuid.UUID,
    payload: PasswordResetRequest,
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
) -> Response:
    user = _fetch_alive(db, user_id)
    provider = db.execute(
        select(AuthProvider).where(
            AuthProvider.user_id == user.id, AuthProvider.provider == "local"
        )
    ).scalar_one_or_none()
    if provider is None:
        raise HTTPException(
            status_code=422,
            detail="User has no local auth provider to reset",
        )
    provider.password_hash = hash_password(payload.password)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/users/{user_id}/admin",
    response_model=UserListItem,
    status_code=status.HTTP_201_CREATED,
)
def grant_org_admin(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("admin")),
) -> UserListItem:
    user = _fetch_alive(db, user_id)
    new_ur = UserRole(
        user_id=user.id, role_id="admin", department_id=None
    )
    db.add(new_ur)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="User is already an org admin"
        )
    record_audit(
        db,
        user=admin,
        entity_type="user_role",
        entity_id=new_ur.id,
        operation="grant",
        changes={
            "user_id": str(user.id),
            "role_id": "admin",
            "department_id": None,
        },
    )
    db.commit()
    db.refresh(user)
    return _list_item(user, _dept_code_map(db))


@router.delete(
    "/users/{user_id}/admin", status_code=status.HTTP_204_NO_CONTENT
)
def revoke_org_admin(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("admin")),
) -> Response:
    if user_id == admin.id:
        raise HTTPException(
            status_code=422, detail="You cannot revoke your own admin role"
        )
    user = _fetch_alive(db, user_id)
    ur = db.execute(
        select(UserRole).where(
            UserRole.user_id == user.id,
            UserRole.role_id == "admin",
            UserRole.department_id.is_(None),
        )
    ).scalar_one_or_none()
    if ur is None:
        raise HTTPException(status_code=404, detail="User is not an org admin")
    ur_id = ur.id
    db.delete(ur)
    record_audit(
        db,
        user=admin,
        entity_type="user_role",
        entity_id=ur_id,
        operation="revoke",
        changes={
            "user_id": str(user.id),
            "role_id": "admin",
            "department_id": None,
        },
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# Org viewer: NULL-dept viewer grant. Read-only across every department.
# No self-revoke guard because revoking org viewer cannot lock anyone out.


@router.post(
    "/users/{user_id}/org-viewer",
    response_model=UserListItem,
    status_code=status.HTTP_201_CREATED,
)
def grant_org_viewer(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("admin")),
) -> UserListItem:
    user = _fetch_alive(db, user_id)
    new_ur = UserRole(
        user_id=user.id, role_id="viewer", department_id=None
    )
    db.add(new_ur)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="User is already an org viewer"
        )
    record_audit(
        db,
        user=admin,
        entity_type="user_role",
        entity_id=new_ur.id,
        operation="grant",
        changes={
            "user_id": str(user.id),
            "role_id": "viewer",
            "department_id": None,
        },
    )
    db.commit()
    db.refresh(user)
    return _list_item(user, _dept_code_map(db))


@router.delete(
    "/users/{user_id}/org-viewer", status_code=status.HTTP_204_NO_CONTENT
)
def revoke_org_viewer(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    admin: User = Depends(require_role("admin")),
) -> Response:
    user = _fetch_alive(db, user_id)
    ur = db.execute(
        select(UserRole).where(
            UserRole.user_id == user.id,
            UserRole.role_id == "viewer",
            UserRole.department_id.is_(None),
        )
    ).scalar_one_or_none()
    if ur is None:
        raise HTTPException(status_code=404, detail="User is not an org viewer")
    ur_id = ur.id
    db.delete(ur)
    record_audit(
        db,
        user=admin,
        entity_type="user_role",
        entity_id=ur_id,
        operation="revoke",
        changes={
            "user_id": str(user.id),
            "role_id": "viewer",
            "department_id": None,
        },
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
