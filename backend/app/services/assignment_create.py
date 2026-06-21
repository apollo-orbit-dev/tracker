"""Service for creating an Assignment record (Phase 20.2).

Extracted from ``backend.app.routes.assignments`` so the forms push pipeline
(the ``assignment`` target writer) can create assignments without going through
HTTP, sharing one validation + audit path with the route.

The caller owns the transaction — this service does **not** commit.
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from backend.app.auth.scope import _project_dept_id
from backend.app.db.models import (
    ASSIGNMENT_STATUSES,
    Assignment,
    Milestone,
    Project,
    ProjectRoleAssignment,
    User,
    UserRole,
)
from backend.app.services.audit import record_audit


def eligible_assignee_ids_select(project: Project) -> Select:
    """Select of User.id eligible to be assigned on ``project``.

    Mirrors ``assert_can_view_project`` exactly:
      - org admins (admin, NULL dept)
      - org viewers (viewer, NULL dept) — can view any project
      - any department role in the project's department (all dept roles >= viewer)
      - direct project shares (project_role_assignments)
    """
    dept_id = _project_dept_id(project)
    org_admins = select(UserRole.user_id).where(
        UserRole.role_id == "admin", UserRole.department_id.is_(None)
    )
    org_viewers = select(UserRole.user_id).where(
        UserRole.role_id == "viewer", UserRole.department_id.is_(None)
    )
    dept_members = select(UserRole.user_id).where(UserRole.department_id == dept_id)
    direct_shares = select(ProjectRoleAssignment.user_id).where(
        ProjectRoleAssignment.project_id == project.id
    )
    return org_admins.union(org_viewers, dept_members, direct_shares)


def validate_status(value: str) -> None:
    if value not in ASSIGNMENT_STATUSES:
        raise HTTPException(status_code=422, detail=f"unknown status: {value}")


def validate_milestone_belongs(
    db: Session, project: Project, milestone_id: uuid.UUID | None
) -> None:
    if milestone_id is None:
        return
    m = db.get(Milestone, milestone_id)
    if m is None or m.project_id != project.id or m.deleted_at is not None:
        raise HTTPException(
            status_code=422, detail="milestone does not belong to this project"
        )


def assert_eligible_assignee(
    db: Session, project: Project, assignee_user_id: uuid.UUID
) -> None:
    ids = eligible_assignee_ids_select(project)
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


def create_assignment_record(
    db: Session,
    user: User,
    project: Project,
    *,
    assignee_user_id: uuid.UUID,
    description: str,
    due_date=None,
    status: str = "open",
    milestone_id: uuid.UUID | None = None,
) -> Assignment:
    """Validate, insert an Assignment row, record an audit entry, return it.

    Does **not** call ``db.commit()`` — the caller owns the transaction.

    Raises:
        HTTPException(422): unknown status, milestone not on the project, or an
            ineligible assignee (cannot view the project).
    """
    validate_status(status)
    validate_milestone_belongs(db, project, milestone_id)
    assert_eligible_assignee(db, project, assignee_user_id)

    obj = Assignment(
        project_id=project.id,
        milestone_id=milestone_id,
        assignee_user_id=assignee_user_id,
        description=description,
        due_date=due_date,
        status=status,
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
    return obj
