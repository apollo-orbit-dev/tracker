"""Shared department-scoping for cross-project queries.

Extracted from dashboard.py (Phase 12) so the dashboard and the calendar
share one implementation. Dept-scope only — does NOT consult direct
project shares (mirrors the dashboard's long-standing behavior).
"""
import uuid

from sqlalchemy import Select, select
from sqlalchemy.orm import Session

from backend.app.auth.scope import accessible_department_ids
from backend.app.db.models import Project, Template, User


def scoped_project_ids(
    db: Session,
    user: User,
    base_project_filter=None,
    *,
    department_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    discipline_id: uuid.UUID | None = None,
) -> Select:
    """SELECT of project ids the caller can see (dept scope + optional DCD)."""
    allowed = accessible_department_ids(user)
    q = (
        select(Project.id)
        .join(Template, Project.template_id == Template.id)
        .where(Project.deleted_at.is_(None))
    )
    if base_project_filter is not None:
        q = q.where(base_project_filter)
    if allowed is not None:
        if not allowed:
            q = q.where(Project.id.is_(None))
        else:
            q = q.where(Template.department_id.in_(allowed))
    if department_id is not None:
        q = q.where(Template.department_id == department_id)
    if client_id is not None:
        q = q.where(Template.client_id == client_id)
    if discipline_id is not None:
        q = q.where(Template.discipline_id == discipline_id)
    return q
