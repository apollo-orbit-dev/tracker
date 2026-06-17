"""Per-project direct read-grant management (Phase 3.0.3).

GET /api/projects/{pid}/access — read open to anyone who can view the
project. Lists users with explicit `project_role_assignments` rows on
this project (does NOT enumerate users with implicit dept-scope access —
that's a different mechanism, surfaced via /api/admin/users + roster).

POST /api/projects/{pid}/access — admin OR department_manager-of-this-
project's-dept. 409 if the user already has a direct grant on the
project. Allowing the grant on a user who already has dept-scope or org-
viewer access is intentional (the row remains a stable read-promise even
if the broader grants are later revoked).

DELETE /api/projects/{pid}/access/{uid} — same auth as POST. 404 if no
direct grant exists for that user/project pair.
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.roles import DEPARTMENT_MANAGER
from backend.app.auth.scope import (
    assert_can_view_project,
    has_role_in_dept,
    is_org_admin,
)
from backend.app.db.models import (
    Project,
    ProjectRoleAssignment,
    User,
)
from backend.app.db.session import get_db
from backend.app.services.audit import record_audit
from backend.app.schemas.project_access import (
    ProjectAccessGrantCreate,
    ProjectAccessGrantOut,
    ProjectAccessListResponse,
)

router = APIRouter(prefix="/api/projects", tags=["project-access"])


def _fetch_project_with_template(db: Session, pid: uuid.UUID) -> Project:
    obj = db.execute(
        select(Project)
        .options(selectinload(Project.template))
        .where(Project.id == pid)
    ).scalar_one_or_none()
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    return obj


def _assert_can_manage_access(user: User, project: Project) -> None:
    if is_org_admin(user):
        return
    if has_role_in_dept(
        user, project.template.department_id, DEPARTMENT_MANAGER
    ):
        return
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Not authorized to manage access on this project",
    )


def _grant_out(pra: ProjectRoleAssignment) -> ProjectAccessGrantOut:
    return ProjectAccessGrantOut(
        user_id=pra.user.id,
        email=pra.user.email,
        display_name=pra.user.display_name,
        granted_at=pra.granted_at,
        granted_by=pra.granted_by,
    )


@router.get(
    "/{pid}/access", response_model=ProjectAccessListResponse
)
def list_project_access(
    pid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectAccessListResponse:
    project = _fetch_project_with_template(db, pid)
    assert_can_view_project(user, project)
    rows = (
        db.execute(
            select(ProjectRoleAssignment)
            .options(selectinload(ProjectRoleAssignment.user))
            .where(ProjectRoleAssignment.project_id == project.id)
            .order_by(ProjectRoleAssignment.granted_at.asc())
        )
        .scalars()
        .all()
    )
    items = [_grant_out(r) for r in rows]
    return ProjectAccessListResponse(items=items, total=len(items))


@router.post(
    "/{pid}/access",
    response_model=ProjectAccessGrantOut,
    status_code=status.HTTP_201_CREATED,
)
def grant_project_access(
    pid: uuid.UUID,
    payload: ProjectAccessGrantCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectAccessGrantOut:
    project = _fetch_project_with_template(db, pid)
    # 404 first if the caller can't even see the project, so the project's
    # existence doesn't leak to cross-dept users via a 403.
    assert_can_view_project(user, project)
    _assert_can_manage_access(user, project)
    grantee = db.execute(
        select(User).where(
            User.id == payload.user_id, User.deleted_at.is_(None)
        )
    ).scalar_one_or_none()
    if grantee is None:
        raise HTTPException(status_code=404, detail="User not found")
    pra = ProjectRoleAssignment(
        user_id=grantee.id,
        project_id=project.id,
        granted_by=user.id,
    )
    db.add(pra)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="User already has direct access to this project",
        )
    record_audit(
        db,
        user=user,
        entity_type="project_role_assignment",
        entity_id=grantee.id,
        operation="grant",
        changes={"granted_user_id": str(grantee.id)},
        project_id=project.id,
    )
    db.commit()
    db.refresh(pra)
    # Eager-load .user for the response builder.
    pra = (
        db.execute(
            select(ProjectRoleAssignment)
            .options(selectinload(ProjectRoleAssignment.user))
            .where(
                ProjectRoleAssignment.user_id == grantee.id,
                ProjectRoleAssignment.project_id == project.id,
            )
        )
        .scalar_one()
    )
    return _grant_out(pra)


@router.delete(
    "/{pid}/access/{uid}", status_code=status.HTTP_204_NO_CONTENT
)
def revoke_project_access(
    pid: uuid.UUID,
    uid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    project = _fetch_project_with_template(db, pid)
    assert_can_view_project(user, project)
    _assert_can_manage_access(user, project)
    pra = db.execute(
        select(ProjectRoleAssignment).where(
            ProjectRoleAssignment.user_id == uid,
            ProjectRoleAssignment.project_id == project.id,
        )
    ).scalar_one_or_none()
    if pra is None:
        raise HTTPException(
            status_code=404, detail="No direct access grant for that user"
        )
    revoked_user_id = pra.user_id
    db.delete(pra)
    record_audit(
        db,
        user=user,
        entity_type="project_role_assignment",
        entity_id=revoked_user_id,
        operation="revoke",
        changes={"granted_user_id": str(revoked_user_id)},
        project_id=project.id,
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
