"""CRUD for project Assignments.

Nested under /api/projects/{pid}/assignments. Mirrors cors.py: read
gated by viewer+ in the project's dept (out-of-scope -> 404 on the
project lookup); writes gated by project_editor+.

The assignee of an assignment must be a user who can already view the
project (org admin / org viewer / a department role in the project's
dept / a direct project share). That set is exposed by the
eligible-users endpoint and enforced on create/patch — assignments
never widen a project's visibility.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import Select, select
from sqlalchemy.orm import Session, selectinload

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.scope import (
    _project_dept_id,
    assert_can_edit_project,
    assert_can_view_project,
)
from backend.app.db.models import (
    ASSIGNMENT_STATUSES,
    Assignment,
    Milestone,
    Project,
    ProjectRoleAssignment,
    User,
    UserRole,
)
from backend.app.db.session import get_db
from backend.app.services.audit import diff, record_audit
from backend.app.schemas.assignments import (
    AssignmentCreate,
    AssignmentListResponse,
    AssignmentOut,
    AssignmentUpdate,
    EligibleUser,
    EligibleUsersResponse,
)

router = APIRouter(prefix="/api/projects", tags=["assignments"])


def _fetch_project(db: Session, pid: uuid.UUID) -> Project:
    obj = db.execute(
        select(Project)
        .options(selectinload(Project.template))
        .where(Project.id == pid)
    ).scalar_one_or_none()
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    return obj


def _fetch_project_for_read(db: Session, user: User, pid: uuid.UUID) -> Project:
    obj = _fetch_project(db, pid)
    assert_can_view_project(user, obj)
    return obj


def _fetch_project_for_edit(db: Session, user: User, pid: uuid.UUID) -> Project:
    obj = _fetch_project(db, pid)
    assert_can_edit_project(user, obj)
    return obj


def _eligible_assignee_ids_select(project: Project) -> Select:
    """Select of User.id eligible to be assigned on `project`.

    Mirrors assert_can_view_project exactly:
      - org admins (admin, NULL dept)
      - org viewers (viewer, NULL dept) — can view any project
      - any department role in the project's department (all dept roles
        are >= viewer)
      - direct project shares (project_role_assignments)
    """
    dept_id = _project_dept_id(project)
    org_admins = select(UserRole.user_id).where(
        UserRole.role_id == "admin", UserRole.department_id.is_(None)
    )
    org_viewers = select(UserRole.user_id).where(
        UserRole.role_id == "viewer", UserRole.department_id.is_(None)
    )
    dept_members = select(UserRole.user_id).where(
        UserRole.department_id == dept_id
    )
    direct_shares = select(ProjectRoleAssignment.user_id).where(
        ProjectRoleAssignment.project_id == project.id
    )
    return org_admins.union(org_viewers, dept_members, direct_shares)


@router.get(
    "/{pid}/assignments/eligible-users",
    response_model=EligibleUsersResponse,
)
def list_eligible_users(
    pid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> EligibleUsersResponse:
    project = _fetch_project_for_edit(db, user, pid)
    ids = _eligible_assignee_ids_select(project)
    rows = (
        db.execute(
            select(User)
            .where(User.id.in_(ids), User.deleted_at.is_(None))
            .order_by(User.display_name.asc())
        )
        .scalars()
        .all()
    )
    return EligibleUsersResponse(
        items=[EligibleUser.model_validate(r) for r in rows],
        total=len(rows),
    )


# ---- Assignment CRUD -------------------------------------------------------

_AUDITED_FIELDS = (
    "milestone_id",
    "description",
    "assignee_user_id",
    "status",
    "due_date",
)


def _validate_status(value: str) -> None:
    if value not in ASSIGNMENT_STATUSES:
        raise HTTPException(status_code=422, detail=f"unknown status: {value}")


def _validate_milestone(
    db: Session, project: Project, milestone_id: uuid.UUID | None
) -> None:
    if milestone_id is None:
        return
    m = db.get(Milestone, milestone_id)
    if m is None or m.project_id != project.id or m.deleted_at is not None:
        raise HTTPException(
            status_code=422,
            detail="milestone does not belong to this project",
        )


def _assert_eligible_assignee(
    db: Session, project: Project, assignee_user_id: uuid.UUID
) -> None:
    ids = _eligible_assignee_ids_select(project)
    ok = db.execute(
        select(User.id).where(
            User.id == assignee_user_id,
            User.id.in_(ids),
            User.deleted_at.is_(None),
        )
    ).first()
    if ok is None:
        raise HTTPException(
            status_code=422,
            detail="assignee is not eligible (cannot view this project)",
        )


def _fetch_assignment(
    db: Session, project: Project, aid: uuid.UUID
) -> Assignment:
    obj = db.get(Assignment, aid)
    if obj is None or obj.project_id != project.id or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return obj


def _reload_assignment(db: Session, obj: Assignment) -> Assignment:
    """Re-select assignment with eager-loaded relations to avoid DetachedInstanceError."""
    return db.execute(
        select(Assignment)
        .options(
            selectinload(Assignment.assignee),
            selectinload(Assignment.milestone),
        )
        .where(Assignment.id == obj.id)
    ).scalar_one()


def _to_out(obj: Assignment) -> AssignmentOut:
    return AssignmentOut(
        id=obj.id,
        project_id=obj.project_id,
        milestone_id=obj.milestone_id,
        milestone_name=obj.milestone.name if obj.milestone is not None else None,
        assignee_user_id=obj.assignee_user_id,
        assignee_name=obj.assignee.display_name,
        assignee_email=obj.assignee.email,
        description=obj.description,
        status=obj.status,
        due_date=obj.due_date,
        created_at=obj.created_at,
        updated_at=obj.updated_at,
        deleted_at=obj.deleted_at,
    )


@router.get("/{pid}/assignments", response_model=AssignmentListResponse)
def list_assignments(
    pid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AssignmentListResponse:
    _fetch_project_for_read(db, user, pid)
    rows = (
        db.execute(
            select(Assignment)
            .options(
                selectinload(Assignment.assignee),
                selectinload(Assignment.milestone),
            )
            .where(Assignment.project_id == pid, Assignment.deleted_at.is_(None))
            .order_by(
                Assignment.due_date.asc().nullslast(),
                Assignment.created_at.asc(),
            )
        )
        .scalars()
        .all()
    )
    return AssignmentListResponse(
        items=[_to_out(r) for r in rows], total=len(rows)
    )


@router.post(
    "/{pid}/assignments",
    response_model=AssignmentOut,
    status_code=status.HTTP_201_CREATED,
)
def create_assignment(
    pid: uuid.UUID,
    payload: AssignmentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AssignmentOut:
    project = _fetch_project_for_edit(db, user, pid)
    _validate_status(payload.status)
    _validate_milestone(db, project, payload.milestone_id)
    _assert_eligible_assignee(db, project, payload.assignee_user_id)
    obj = Assignment(
        project_id=project.id,
        milestone_id=payload.milestone_id,
        assignee_user_id=payload.assignee_user_id,
        description=payload.description,
        due_date=payload.due_date,
        status=payload.status,
    )
    db.add(obj)
    db.flush()
    record_audit(
        db,
        user=user,
        entity_type="assignment",
        entity_id=obj.id,
        operation="create",
        changes={
            "initial": {
                "milestone_id": str(obj.milestone_id) if obj.milestone_id else None,
                "description": obj.description,
                "assignee_user_id": str(obj.assignee_user_id),
                "status": obj.status,
                "due_date": obj.due_date,
            }
        },
        project_id=project.id,
    )
    db.commit()
    obj = _reload_assignment(db, obj)
    return _to_out(obj)


@router.get("/{pid}/assignments/{aid}", response_model=AssignmentOut)
def get_assignment(
    pid: uuid.UUID,
    aid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AssignmentOut:
    project = _fetch_project_for_read(db, user, pid)
    obj = _fetch_assignment(db, project, aid)
    obj = _reload_assignment(db, obj)
    return _to_out(obj)


@router.patch("/{pid}/assignments/{aid}", response_model=AssignmentOut)
def update_assignment(
    pid: uuid.UUID,
    aid: uuid.UUID,
    payload: AssignmentUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AssignmentOut:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=422, detail="At least one field is required")
    project = _fetch_project_for_edit(db, user, pid)
    obj = _fetch_assignment(db, project, aid)
    if "status" in data:
        _validate_status(data["status"])
    if "milestone_id" in data:
        _validate_milestone(db, project, data["milestone_id"])
    if "assignee_user_id" in data:
        _assert_eligible_assignee(db, project, data["assignee_user_id"])
    before = {f: getattr(obj, f) for f in _AUDITED_FIELDS}
    for k, v in data.items():
        setattr(obj, k, v)
    db.flush()
    after = {f: getattr(obj, f) for f in _AUDITED_FIELDS}
    changes = diff(before, after, fields=_AUDITED_FIELDS)
    if changes:
        record_audit(
            db,
            user=user,
            entity_type="assignment",
            entity_id=obj.id,
            operation="update",
            changes=changes,
            project_id=project.id,
        )
    db.commit()
    obj = _reload_assignment(db, obj)
    return _to_out(obj)


@router.delete(
    "/{pid}/assignments/{aid}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_assignment(
    pid: uuid.UUID,
    aid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    project = _fetch_project_for_edit(db, user, pid)
    obj = _fetch_assignment(db, project, aid)
    obj.deleted_at = datetime.now(timezone.utc)
    obj.deleted_by = user.id
    record_audit(
        db,
        user=user,
        entity_type="assignment",
        entity_id=obj.id,
        operation="delete",
        changes={},
        project_id=project.id,
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
