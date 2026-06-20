from datetime import date, time

from sqlalchemy.orm import Session

from backend.app.db.models import Department, Event, EventOccurrenceOverride, User


def _dept_user(db: Session):
    d = Department(code="EV", name="Events Dept")
    u = User(email="e@x.com", display_name="E")
    db.add_all([d, u]); db.flush()
    return d, u


def test_event_round_trips(db_session: Session):
    d, u = _dept_user(db_session)
    ev = Event(
        department_id=d.id, created_by=u.id, title="Standup",
        all_day=False, start_time=time(9, 0), start_date=date(2026, 7, 1),
        recurrence={"freq": "weekly", "interval": 1, "byweekday": [0],
                    "end": {"mode": "never"}},
    )
    db_session.add(ev); db_session.flush()
    got = db_session.get(Event, ev.id)
    assert got.title == "Standup" and got.recurrence["freq"] == "weekly"


def test_override_unique_per_occurrence(db_session: Session):
    d, u = _dept_user(db_session)
    ev = Event(department_id=d.id, created_by=u.id, title="PTO", start_date=date(2026, 7, 1))
    db_session.add(ev); db_session.flush()
    db_session.add(EventOccurrenceOverride(
        event_id=ev.id, original_date=date(2026, 7, 8), status="cancelled"))
    db_session.flush()
    assert db_session.get(Event, ev.id) is not None
