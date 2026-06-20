# backend/tests/test_event_calendar.py
from datetime import date, time
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from backend.app.services.event_calendar import (
    expand_one, validate_recurrence,
)


def _ev(**kw):
    base = dict(id="e1", department_id="d", title="T", description=None,
               all_day=True, start_time=None, end_time=None,
               start_date=date(2026, 7, 6), recurrence=None)  # 2026-07-06 is a Monday
    base.update(kw)
    return SimpleNamespace(**base)


def test_validate_rejects_bad_freq():
    with pytest.raises(HTTPException):
        validate_recurrence({"freq": "fortnightly", "interval": 1, "end": {"mode": "never"}})


def test_validate_weekly_ok():
    cfg = validate_recurrence({"freq": "weekly", "interval": 2, "byweekday": [0],
                               "end": {"mode": "never"}})
    assert cfg["interval"] == 2 and cfg["byweekday"] == [0]


def test_non_recurring_single_occurrence_in_range():
    occ = expand_one(_ev(), [], date(2026, 7, 1), date(2026, 7, 31))
    assert [o.date for o in occ] == [date(2026, 7, 6)]


def test_every_other_monday():
    ev = _ev(recurrence={"freq": "weekly", "interval": 2, "byweekday": [0],
                         "end": {"mode": "never"}})
    occ = expand_one(ev, [], date(2026, 7, 1), date(2026, 8, 5))
    assert [o.date for o in occ] == [date(2026, 7, 6), date(2026, 7, 20), date(2026, 8, 3)]


def test_first_monday_of_month():
    ev = _ev(recurrence={"freq": "monthly", "interval": 1, "monthly_mode": "nth_weekday",
                         "bysetpos": 1, "byweekday_nth": 0, "end": {"mode": "count", "count": 3}})
    occ = expand_one(ev, [], date(2026, 7, 1), date(2026, 12, 31))
    assert [o.date for o in occ] == [date(2026, 7, 6), date(2026, 8, 3), date(2026, 9, 7)]


def test_cancelled_override_drops_occurrence():
    ev = _ev(recurrence={"freq": "weekly", "interval": 1, "byweekday": [0], "end": {"mode": "never"}})
    ovr = [SimpleNamespace(original_date=date(2026, 7, 13), status="cancelled",
                           override_date=None, override_title=None, override_description=None,
                           override_all_day=None, override_start_time=None, override_end_time=None)]
    occ = expand_one(ev, ovr, date(2026, 7, 6), date(2026, 7, 20))
    assert [o.date for o in occ] == [date(2026, 7, 6), date(2026, 7, 20)]


def test_modified_override_moves_occurrence():
    ev = _ev(recurrence={"freq": "weekly", "interval": 1, "byweekday": [0], "end": {"mode": "never"}})
    ovr = [SimpleNamespace(original_date=date(2026, 7, 13), status="modified",
                           override_date=date(2026, 7, 15), override_title="Moved",
                           override_description=None, override_all_day=None,
                           override_start_time=None, override_end_time=None)]
    occ = expand_one(ev, ovr, date(2026, 7, 6), date(2026, 7, 20))
    dates = [o.date for o in occ]
    assert date(2026, 7, 13) not in dates and date(2026, 7, 15) in dates
    moved = next(o for o in occ if o.date == date(2026, 7, 15))
    assert moved.title == "Moved" and moved.is_override is True


def test_until_non_date_rejected():
    # integer until must yield 422, not 500
    with pytest.raises(HTTPException):
        validate_recurrence({"freq": "daily", "interval": 1, "end": {"mode": "until", "until": 42}})
    # valid ISO string must pass
    cfg = validate_recurrence({"freq": "daily", "interval": 1,
                               "end": {"mode": "until", "until": "2026-12-31"}})
    assert cfg["end"] == {"mode": "until", "until": "2026-12-31"}


def test_moved_in_occurrence_appears():
    # weekly-Monday event starting 2026-07-06
    ev = _ev(recurrence={"freq": "weekly", "interval": 1, "byweekday": [0],
                         "end": {"mode": "never"}})
    # original_date 2026-06-29 is a Monday BEFORE the query range; override_date 2026-07-08 is inside
    ovr = [SimpleNamespace(original_date=date(2026, 6, 29), status="modified",
                           override_date=date(2026, 7, 8), override_title=None,
                           override_description=None, override_all_day=None,
                           override_start_time=None, override_end_time=None)]
    occ = expand_one(ev, ovr, date(2026, 7, 6), date(2026, 7, 20))
    dates = [o.date for o in occ]
    assert dates.count(date(2026, 7, 8)) == 1
    assert date(2026, 6, 29) not in dates
