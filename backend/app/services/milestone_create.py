"""Service for creating an ad-hoc Milestone record (Phase 20.3).

Extracted from ``backend.app.routes.projects.create_milestone`` so the forms
push pipeline (the ``milestone`` target writer) can create milestones without
going through HTTP, sharing one validation + audit path with the route.

Ad-hoc milestones have ``template_milestone_def_id = NULL`` (they are not tied
to a template's milestone-def catalog). The caller owns the transaction.
"""
from __future__ import annotations

import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.db.models import (
    MILESTONE_DATE_MODELS,
    MILESTONE_DIRECTIONS,
    Milestone,
    Project,
    User,
)
from backend.app.services.audit import record_audit


def validate_milestone_enums(direction: str, date_model: str) -> None:
    if direction not in MILESTONE_DIRECTIONS:
        raise HTTPException(status_code=422, detail=f"unknown direction: {direction}")
    if date_model not in MILESTONE_DATE_MODELS:
        raise HTTPException(status_code=422, detail=f"unknown date_model: {date_model}")


def next_milestone_order(db: Session, project_id: uuid.UUID) -> int:
    current_max = db.execute(
        select(func.max(Milestone.order_index)).where(
            Milestone.project_id == project_id,
            Milestone.deleted_at.is_(None),
        )
    ).scalar()
    return 0 if current_max is None else current_max + 1


def create_milestone_record(
    db: Session,
    user: User,
    project: Project,
    *,
    name: str,
    direction: str,
    date_model: str,
    planned_date=None,
) -> Milestone:
    """Validate, insert an ad-hoc Milestone row, audit, and return it.

    Does **not** commit. ``planned_date`` is optional (the HTTP create route
    leaves it unset; the forms writer may supply it).

    Raises HTTPException(422) for an unknown direction or date_model.
    """
    validate_milestone_enums(direction, date_model)
    obj = Milestone(
        project_id=project.id,
        template_milestone_def_id=None,  # ad-hoc
        name=name,
        direction=direction,
        date_model=date_model,
        planned_date=planned_date,
        order_index=next_milestone_order(db, project.id),
    )
    db.add(obj)
    db.flush()
    record_audit(
        db,
        user=user,
        entity_type="milestone",
        entity_id=obj.id,
        operation="create",
        changes={
            "initial": {
                "name": obj.name,
                "direction": obj.direction,
                "date_model": obj.date_model,
                "planned_date": obj.planned_date,
            }
        },
        project_id=project.id,
    )
    return obj
