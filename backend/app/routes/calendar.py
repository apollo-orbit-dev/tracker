"""Calendar items endpoint (Phase 12).

Dept-scoped milestones (on planned_date) + assignments (on due_date)
within a date range, for the /calendar page. Read-only; scoping mirrors
the dashboard via scoped_project_ids.
"""
import uuid
from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session, aliased, selectinload

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.scope import accessible_department_ids
from backend.app.db.models import Assignment, Event, Milestone, Project, User
from backend.app.db.session import get_db
from backend.app.routes.admin_settings import HOLIDAYS_DEFAULT, HOLIDAYS_SETTING_KEY
from backend.app.schemas.calendar import (
    CalendarAssignmentItem,
    CalendarEventItem,
    CalendarEventsResponse,
    CalendarHolidaysResponse,
    CalendarItemsResponse,
    CalendarMilestoneItem,
)
from backend.app.services.app_settings import get_setting
from backend.app.services.event_calendar import expand_one
from backend.app.services.holiday_calendar import holiday_items
from backend.app.services.project_scope import scoped_project_ids

router = APIRouter(prefix="/api/calendar", tags=["calendar"])

MAX_SPAN_DAYS = 92
_VALID_TYPES = {"milestone", "assignment"}


def _parse_types(types: str | None) -> set[str]:
    if not types:
        return set(_VALID_TYPES)
    requested = {t.strip() for t in types.split(",") if t.strip()}
    if not requested or not requested <= _VALID_TYPES:
        raise HTTPException(status_code=422, detail="invalid types")
    return requested


@router.get("/items", response_model=CalendarItemsResponse)
def list_calendar_items(
    start: date,
    end: date,
    department_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    discipline_id: uuid.UUID | None = None,
    types: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CalendarItemsResponse:
    if end < start:
        raise HTTPException(status_code=422, detail="end must be >= start")
    if (end - start) > timedelta(days=MAX_SPAN_DAYS):
        raise HTTPException(status_code=422, detail=f"range exceeds {MAX_SPAN_DAYS} days")
    wanted = _parse_types(types)

    pid_sq = scoped_project_ids(
        db, user, department_id=department_id, client_id=client_id, discipline_id=discipline_id
    ).subquery()
    scoped = select(pid_sq.c.id)

    items: list = []

    if "milestone" in wanted:
        rows = db.execute(
            select(
                Milestone.id, Milestone.name, Milestone.direction,
                Milestone.planned_date, Milestone.actual_date,
                Project.id, Project.title,
            )
            .join(Project, Milestone.project_id == Project.id)
            .where(
                Project.id.in_(scoped),
                Milestone.deleted_at.is_(None),
                Milestone.planned_date.isnot(None),
                Milestone.planned_date >= start,
                Milestone.planned_date <= end,
            )
        ).all()
        for (m_id, m_name, m_dir, m_planned, m_actual, p_id, p_title) in rows:
            items.append(CalendarMilestoneItem(
                id=m_id, date=m_planned, name=m_name, direction=m_dir,
                completed=m_actual is not None, actual_date=m_actual,
                project_id=p_id, project_title=p_title,
            ))

    if "assignment" in wanted:
        assignee = aliased(User)
        ms = aliased(Milestone)
        rows = db.execute(
            select(
                Assignment.id, Assignment.description, Assignment.status,
                Assignment.due_date, assignee.display_name,
                Assignment.milestone_id, ms.name,
                Project.id, Project.title,
            )
            .join(Project, Assignment.project_id == Project.id)
            .join(assignee, Assignment.assignee_user_id == assignee.id)
            .outerjoin(ms, Assignment.milestone_id == ms.id)
            .where(
                Project.id.in_(scoped),
                Assignment.deleted_at.is_(None),
                Assignment.due_date.isnot(None),
                Assignment.due_date >= start,
                Assignment.due_date <= end,
            )
        ).all()
        for (a_id, a_desc, a_status, a_due, a_assignee, m_id, m_name, p_id, p_title) in rows:
            items.append(CalendarAssignmentItem(
                id=a_id, date=a_due, description=a_desc, status=a_status,
                assignee_name=a_assignee, milestone_id=m_id, milestone_name=m_name,
                project_id=p_id, project_title=p_title,
            ))

    return CalendarItemsResponse(items=items)


@router.get("/holidays", response_model=CalendarHolidaysResponse)
def list_calendar_holidays(
    start: date,
    end: date,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CalendarHolidaysResponse:
    if end < start:
        raise HTTPException(status_code=422, detail="end must be >= start")
    if (end - start) > timedelta(days=MAX_SPAN_DAYS):
        raise HTTPException(status_code=422, detail=f"range exceeds {MAX_SPAN_DAYS} days")
    setting = get_setting(db, HOLIDAYS_SETTING_KEY, HOLIDAYS_DEFAULT)
    return CalendarHolidaysResponse(items=holiday_items(start, end, setting))


@router.get("/events", response_model=CalendarEventsResponse)
def list_calendar_events(start: date, end: date, department_id: uuid.UUID | None = None,
                         db: Session = Depends(get_db), user: User = Depends(get_current_user)
                         ) -> CalendarEventsResponse:
    if end < start:
        raise HTTPException(status_code=422, detail="end must be >= start")
    if (end - start) > timedelta(days=MAX_SPAN_DAYS):
        raise HTTPException(status_code=422, detail=f"range exceeds {MAX_SPAN_DAYS} days")

    allowed = accessible_department_ids(user)  # None = org-scope (all)
    q = (select(Event).options(selectinload(Event.overrides), selectinload(Event.about_user))
         .where(Event.deleted_at.is_(None)))
    if allowed is not None:
        if not allowed:
            return CalendarEventsResponse(items=[])
        q = q.where(Event.department_id.in_(allowed))
    if department_id is not None:
        q = q.where(Event.department_id == department_id)
    events = db.execute(q).scalars().all()

    items: list[CalendarEventItem] = []
    for ev in events:
        for occ in expand_one(ev, list(ev.overrides), start, end):
            items.append(CalendarEventItem(
                event_id=ev.id, original_date=occ.original_date, date=occ.date,
                end_date=occ.end_date, title=occ.title,
                description=occ.description, all_day=occ.all_day, start_time=occ.start_time,
                end_time=occ.end_time, about_user_name=(ev.about_user.display_name if ev.about_user else None),
                is_recurring=occ.is_recurring, is_override=occ.is_override))
    items.sort(key=lambda i: i.date)
    return CalendarEventsResponse(items=items)
