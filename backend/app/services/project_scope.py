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


def _norm(
    single: uuid.UUID | None,
    many: list[uuid.UUID] | None,
) -> list[uuid.UUID] | None:
    """Collapse a singular id + an optional list into one list-or-None.
    A non-empty list wins; otherwise fall back to the single id; else None."""
    if many:
        return list(many)
    if single is not None:
        return [single]
    return None


def scoped_project_ids(
    db: Session,
    user: User,
    base_project_filter=None,
    *,
    department_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    discipline_id: uuid.UUID | None = None,
    department_ids: list[uuid.UUID] | None = None,
    client_ids: list[uuid.UUID] | None = None,
    discipline_ids: list[uuid.UUID] | None = None,
) -> Select:
    """SELECT of project ids the caller can see (dept scope + optional DCD).

    Each DCD axis accepts either a single id (dashboard) or a list of ids
    (calendar multi-select); a list filters with IN. The filter only ever
    *narrows* within the caller's accessible departments — an id outside
    ``allowed`` simply matches nothing, so it can't widen visibility.
    """
    allowed = accessible_department_ids(user)
    depts = _norm(department_id, department_ids)
    clients = _norm(client_id, client_ids)
    disciplines = _norm(discipline_id, discipline_ids)
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
    if depts is not None:
        q = q.where(Template.department_id.in_(depts))
    if clients is not None:
        q = q.where(Template.client_id.in_(clients))
    if disciplines is not None:
        q = q.where(Template.discipline_id.in_(disciplines))
    return q
