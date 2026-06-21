"""Service for creating a Project record + auto-spawned milestones (Phase 20.5).

Extracted from ``backend.app.routes.projects.create_project`` so the forms push
pipeline (the ``intake`` target writer) can create projects without going
through HTTP, sharing one validation + milestone-spawn + audit path with the
route.

The caller owns the transaction — this service does **not** commit. On a
duplicate project number it rolls back and raises ``ProjectNumberConflict``
(mirrors ``cor_create``); the caller maps that to HTTP 409.
"""
from __future__ import annotations

import uuid
from typing import Any

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.db.models import (
    Milestone,
    Project,
    Template,
    TemplateFieldDef,
    TemplateMilestoneDef,
    User,
)
from backend.app.services.audit import record_audit
from backend.app.services.custom_field_values import ValidationError, validate_values


class ProjectNumberConflict(Exception):
    """Raised when a live project with the same project_number already exists."""


def live_field_defs(db: Session, template_id: uuid.UUID) -> list[TemplateFieldDef]:
    return (
        db.execute(
            select(TemplateFieldDef)
            .where(
                TemplateFieldDef.template_id == template_id,
                TemplateFieldDef.deleted_at.is_(None),
            )
            .order_by(TemplateFieldDef.order_index.asc())
        )
        .scalars()
        .all()
    )


def live_milestone_defs(
    db: Session, template_id: uuid.UUID
) -> list[TemplateMilestoneDef]:
    return (
        db.execute(
            select(TemplateMilestoneDef)
            .where(
                TemplateMilestoneDef.template_id == template_id,
                TemplateMilestoneDef.deleted_at.is_(None),
            )
            .order_by(TemplateMilestoneDef.order_index.asc())
        )
        .scalars()
        .all()
    )


def create_project_record(
    db: Session,
    user: User,
    template: Template,
    *,
    project_number: str,
    title: str,
    custom_field_values: dict[str, Any] | None = None,
    client_project_number: str | None = None,
) -> Project:
    """Validate custom fields, insert the Project, auto-spawn milestones from the
    template's live milestone defs, record an audit entry, and return the Project.

    Does **not** commit. The caller must have already authorized the write
    (``assert_can_edit_dept`` on ``template.department_id``).

    Raises:
        HTTPException(422): custom field validation failed.
        ProjectNumberConflict: a live project with the same number exists.
    """
    values = custom_field_values or {}
    field_defs = live_field_defs(db, template.id)
    try:
        validate_values(values, field_defs)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=e.reasons)

    project = Project(
        project_number=project_number,
        client_project_number=client_project_number,
        title=title,
        template_id=template.id,
        custom_field_values=values,
        created_by=user.id,
    )
    db.add(project)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise ProjectNumberConflict()

    # Auto-create milestones from the template's live milestone defs.
    for md in live_milestone_defs(db, template.id):
        db.add(
            Milestone(
                project_id=project.id,
                template_milestone_def_id=md.id,
                name=md.name,
                direction=md.direction,
                date_model=md.date_model,
                order_index=md.order_index,
            )
        )
    record_audit(
        db,
        user=user,
        entity_type="project",
        entity_id=project.id,
        operation="create",
        changes={
            "initial": {
                "title": project.title,
                "project_number": project.project_number,
                "client_project_number": project.client_project_number,
                "template_id": str(project.template_id),
                "custom_field_values": project.custom_field_values or {},
            }
        },
        project_id=project.id,
    )
    return project
