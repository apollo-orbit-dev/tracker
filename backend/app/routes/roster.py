"""Department roster: who has what role in this department.

Endpoints:
  GET    /api/departments/{dept_id}/roster      — admin OR DM+ in dept
  POST   /api/departments/{dept_id}/roster      — admin OR DM in dept (grant)
  DELETE /api/departments/{dept_id}/roster/{ur_id} — admin OR DM in dept

  GET    /api/users/picker                       — admin OR DM in any dept
                                                    (lightweight list for the
                                                    grant Sheet's user select)

`admin` is never grantable through this surface — the role enum on the
grant payload restricts to department_manager / project_editor / viewer.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.roles import DEPARTMENT_MANAGER
from backend.app.auth.scope import (
    accessible_department_ids,
    assert_can_manage_dept,
    has_role_in_dept,
    is_org_admin,
)
from backend.app.db.models import Department, User, UserRole
from backend.app.db.session import get_db
from backend.app.services.audit import record_audit
from backend.app.schemas.roster import (
    GrantCreate,
    GrantUpdate,
    RosterEntry,
    RosterListResponse,
    UserPickerItem,
    UserPickerResponse,
)

router = APIRouter(tags=["roster"])


def _fetch_dept_live(db: Session, dept_id: uuid.UUID) -> Department:
    dept = db.get(Department, dept_id)
    if dept is None or dept.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Department not found")
    return dept


def _assert_can_view_dept_roster(user: User, dept_id: uuid.UUID) -> None:
    """Roster READ: org admin OR DM+ in the dept."""
    if not has_role_in_dept(user, dept_id, DEPARTMENT_MANAGER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to view this department's roster",
        )


@router.get(
    "/api/departments/{dept_id}/roster", response_model=RosterListResponse
)
def list_roster(
    dept_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RosterListResponse:
    _fetch_dept_live(db, dept_id)
    _assert_can_view_dept_roster(user, dept_id)
    rows = (
        db.execute(
            select(UserRole, User)
            .join(User, UserRole.user_id == User.id)
            .where(
                UserRole.department_id == dept_id, User.deleted_at.is_(None)
            )
            .order_by(User.display_name.asc(), UserRole.role_id.asc())
        )
        .all()
    )
    items = [
        RosterEntry(
            user_role_id=ur.id,
            user_id=u.id,
            email=u.email,
            display_name=u.display_name,
            role_id=ur.role_id,
            created_at=ur.granted_at,
        )
        for ur, u in rows
    ]
    return RosterListResponse(items=items, total=len(items))


@router.post(
    "/api/departments/{dept_id}/roster",
    response_model=RosterEntry,
    status_code=status.HTTP_201_CREATED,
)
def grant_role(
    dept_id: uuid.UUID,
    payload: GrantCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RosterEntry:
    _fetch_dept_live(db, dept_id)
    assert_can_manage_dept(user, dept_id)

    target = db.get(User, payload.user_id)
    if target is None or target.deleted_at is not None:
        raise HTTPException(
            status_code=422, detail="User not found or soft-deleted"
        )

    ur = UserRole(
        user_id=target.id,
        role_id=payload.role_id,
        department_id=dept_id,
    )
    db.add(ur)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="That user already holds this role in this department.",
        )
    record_audit(
        db,
        user=user,
        entity_type="user_role",
        entity_id=ur.id,
        operation="grant",
        changes={
            "user_id": str(target.id),
            "role_id": payload.role_id,
            "department_id": str(dept_id),
        },
    )
    db.commit()
    db.refresh(ur)

    return RosterEntry(
        user_role_id=ur.id,
        user_id=target.id,
        email=target.email,
        display_name=target.display_name,
        role_id=ur.role_id,
        created_at=ur.granted_at,
    )


@router.patch(
    "/api/departments/{dept_id}/roster/{user_role_id}",
    response_model=RosterEntry,
)
def update_role(
    dept_id: uuid.UUID,
    user_role_id: uuid.UUID,
    payload: GrantUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RosterEntry:
    _fetch_dept_live(db, dept_id)
    assert_can_manage_dept(user, dept_id)

    ur = db.get(UserRole, user_role_id)
    if ur is None or ur.department_id != dept_id:
        raise HTTPException(status_code=404, detail="Grant not found")

    if ur.role_id == payload.role_id:
        # No-op, but return the row so the client gets fresh data.
        target = db.get(User, ur.user_id)
        return RosterEntry(
            user_role_id=ur.id,
            user_id=ur.user_id,
            email=target.email,
            display_name=target.display_name,
            role_id=ur.role_id,
            created_at=ur.granted_at,
        )

    prev_role_id = ur.role_id
    ur.role_id = payload.role_id
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="That user already holds the target role in this department.",
        )
    record_audit(
        db,
        user=user,
        entity_type="user_role",
        entity_id=ur.id,
        operation="update",
        changes={"role_id": [prev_role_id, payload.role_id]},
    )
    db.commit()
    db.refresh(ur)

    target = db.get(User, ur.user_id)
    return RosterEntry(
        user_role_id=ur.id,
        user_id=ur.user_id,
        email=target.email,
        display_name=target.display_name,
        role_id=ur.role_id,
        created_at=ur.granted_at,
    )


@router.delete(
    "/api/departments/{dept_id}/roster/{user_role_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def revoke_role(
    dept_id: uuid.UUID,
    user_role_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    _fetch_dept_live(db, dept_id)
    assert_can_manage_dept(user, dept_id)

    ur = db.get(UserRole, user_role_id)
    if ur is None or ur.department_id != dept_id:
        # 404 covers both: not exist + exists but in a different dept.
        # We've already established the caller can manage this dept, so
        # hiding existence of grants in *other* depts is correct.
        raise HTTPException(status_code=404, detail="Grant not found")

    ur_role_id = ur.role_id
    ur_user_id = ur.user_id
    ur_id = ur.id
    db.delete(ur)
    record_audit(
        db,
        user=user,
        entity_type="user_role",
        entity_id=ur_id,
        operation="revoke",
        changes={
            "user_id": str(ur_user_id),
            "role_id": ur_role_id,
            "department_id": str(dept_id),
        },
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/api/users/picker", response_model=UserPickerResponse)
def list_users_picker(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserPickerResponse:
    """Lightweight list of live users for the roster grant Sheet.

    Reachable by org admin OR any user who is `department_manager+` in
    at least one department — those are exactly the users who have a
    UI surface that needs a user picker.
    """
    if not is_org_admin(user):
        manage_set = accessible_department_ids(user, minimum_role=DEPARTMENT_MANAGER)
        if manage_set is None or not manage_set:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden"
            )

    base = (
        select(User)
        .where(User.deleted_at.is_(None))
        .order_by(User.display_name.asc())
    )
    total = db.execute(select(func.count()).select_from(base.subquery())).scalar_one()
    rows = db.execute(base.limit(500)).scalars().all()
    return UserPickerResponse(
        items=[UserPickerItem.model_validate(r) for r in rows],
        total=total,
    )
