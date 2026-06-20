"""Custom event series CRUD (Phase 14). Department-scoped: viewer+ read,
project_editor+ write. Recurrence validated; mutations audited."""
import uuid
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import distinct, select
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.roles import VIEWER
from backend.app.auth.scope import assert_can_edit_dept, has_role_in_dept
from backend.app.db.models import Event, EventOccurrenceOverride, User, UserRole
from backend.app.db.session import get_db
from backend.app.schemas.events import EventCreate, EventOut, EventUpdate, OccurrenceModify
from backend.app.schemas.roster import UserPickerItem, UserPickerResponse
from backend.app.services.audit import diff, record_audit
from backend.app.services.event_calendar import build_rrule, validate_recurrence

router = APIRouter(prefix="/api/events", tags=["events"])


@router.get("/about-user-options", response_model=UserPickerResponse)
def about_user_options(
    department_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> UserPickerResponse:
    """Return users with any role in the given department (project_editor+ gate).

    Used to populate the 'About' user picker on the EventSheet. Scoped to the
    department so callers only see people relevant to that department's events.
    Soft-deleted users are excluded.
    """
    assert_can_edit_dept(user, department_id)
    rows = db.execute(
        select(User)
        .join(UserRole, UserRole.user_id == User.id)
        .where(
            UserRole.department_id == department_id,
            User.deleted_at.is_(None),
        )
        .distinct()
        .order_by(User.display_name.asc())
    ).scalars().all()
    items = [UserPickerItem.model_validate(u) for u in rows]
    return UserPickerResponse(items=items, total=len(items))


_AUDITED = ("title", "description", "about_user_id", "all_day", "start_time",
            "end_time", "start_date", "end_date", "recurrence")


def _fetch_event(db: Session, eid: uuid.UUID) -> Event:
    obj = db.get(Event, eid)
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Event not found")
    return obj


def _fetch_for_read(db: Session, user: User, eid: uuid.UUID) -> Event:
    obj = _fetch_event(db, eid)
    if not has_role_in_dept(user, obj.department_id, VIEWER):
        raise HTTPException(status_code=404, detail="Event not found")
    return obj


def _validate_about_user(db: Session, about_user_id: uuid.UUID | None) -> None:
    if about_user_id is None:
        return
    u = db.get(User, about_user_id)
    if u is None or u.deleted_at is not None:
        raise HTTPException(status_code=422, detail="about_user not found")


@router.post("", response_model=EventOut, status_code=status.HTTP_201_CREATED)
def create_event(payload: EventCreate, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)) -> EventOut:
    assert_can_edit_dept(user, payload.department_id)
    if payload.end_date is not None and payload.end_date < payload.start_date:
        raise HTTPException(status_code=422, detail="end_date must be >= start_date")
    rec = validate_recurrence(payload.recurrence)
    _validate_about_user(db, payload.about_user_id)
    obj = Event(
        department_id=payload.department_id, created_by=user.id,
        about_user_id=payload.about_user_id, title=payload.title,
        description=payload.description, all_day=payload.all_day,
        start_time=payload.start_time, end_time=payload.end_time,
        start_date=payload.start_date, end_date=payload.end_date, recurrence=rec)
    db.add(obj); db.flush()
    record_audit(db, user=user, entity_type="event", entity_id=obj.id,
                 operation="create", changes={"initial": {f: getattr(obj, f) for f in _AUDITED}})
    db.commit(); db.refresh(obj)
    return EventOut.model_validate(obj)


@router.get("/{eid}", response_model=EventOut)
def get_event(eid: uuid.UUID, db: Session = Depends(get_db),
              user: User = Depends(get_current_user)) -> EventOut:
    return EventOut.model_validate(_fetch_for_read(db, user, eid))


@router.patch("/{eid}", response_model=EventOut)
def update_event(eid: uuid.UUID, payload: EventUpdate, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)) -> EventOut:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=422, detail="At least one field is required")
    obj = _fetch_event(db, eid)
    assert_can_edit_dept(user, obj.department_id)
    if "recurrence" in data:
        data["recurrence"] = validate_recurrence(data["recurrence"])
    if "about_user_id" in data:
        _validate_about_user(db, data["about_user_id"])
    # Validate end_date >= effective start_date (new value if provided, else existing).
    effective_start = data.get("start_date", obj.start_date)
    effective_end = data.get("end_date", obj.end_date)
    if effective_end is not None and effective_end < effective_start:
        raise HTTPException(status_code=422, detail="end_date must be >= start_date")
    before = {f: getattr(obj, f) for f in _AUDITED}
    for k, v in data.items():
        setattr(obj, k, v)
    db.flush()
    changes = diff(before, {f: getattr(obj, f) for f in _AUDITED}, fields=_AUDITED)
    if changes:
        record_audit(db, user=user, entity_type="event", entity_id=obj.id,
                     operation="update", changes=changes)
    db.commit(); db.refresh(obj)
    return EventOut.model_validate(obj)


@router.delete("/{eid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(eid: uuid.UUID, db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)) -> Response:
    obj = _fetch_event(db, eid)
    assert_can_edit_dept(user, obj.department_id)
    obj.deleted_at = datetime.now(timezone.utc); obj.deleted_by = user.id
    record_audit(db, user=user, entity_type="event", entity_id=obj.id, operation="delete", changes={})
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _assert_is_occurrence(event: Event, d: date) -> None:
    if event.recurrence is None:
        if d != event.start_date:
            raise HTTPException(status_code=422, detail="not an occurrence of this event")
        return
    rule = build_rrule(event.start_date, event.recurrence)
    # an occurrence exists iff rrule yields exactly d on that day
    hit = rule.between(datetime.combine(d, datetime.min.time()),
                       datetime.combine(d, datetime.max.time()), inc=True)
    if not hit:
        raise HTTPException(status_code=422, detail="not an occurrence of this event")


def _upsert_override(db: Session, event: Event, d: date, status_val: str, mods: dict) -> EventOccurrenceOverride:
    row = db.execute(select(EventOccurrenceOverride).where(
        EventOccurrenceOverride.event_id == event.id,
        EventOccurrenceOverride.original_date == d)).scalar_one_or_none()
    if row is None:
        row = EventOccurrenceOverride(event_id=event.id, original_date=d, status=status_val, **mods)
        db.add(row)
    else:
        row.status = status_val
        for k, v in mods.items():
            setattr(row, k, v)
    db.flush()
    return row


@router.delete("/{eid}/occurrences/{original_date}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_occurrence(eid: uuid.UUID, original_date: date, db: Session = Depends(get_db),
                      user: User = Depends(get_current_user)) -> Response:
    obj = _fetch_event(db, eid)
    assert_can_edit_dept(user, obj.department_id)
    _assert_is_occurrence(obj, original_date)
    _upsert_override(db, obj, original_date, "cancelled", {})
    record_audit(db, user=user, entity_type="event", entity_id=obj.id, operation="update",
                 changes={"occurrence_cancelled": original_date.isoformat()})
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{eid}/occurrences/{original_date}", response_model=EventOut)
def modify_occurrence(eid: uuid.UUID, original_date: date, payload: OccurrenceModify,
                      db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> EventOut:
    obj = _fetch_event(db, eid)
    assert_can_edit_dept(user, obj.department_id)
    _assert_is_occurrence(obj, original_date)
    _upsert_override(db, obj, original_date, "modified", payload.model_dump(exclude_unset=True))
    record_audit(db, user=user, entity_type="event", entity_id=obj.id, operation="update",
                 changes={"occurrence_modified": original_date.isoformat()})
    db.commit(); db.refresh(obj)
    return EventOut.model_validate(obj)
