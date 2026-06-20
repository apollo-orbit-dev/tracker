# backend/tests/test_event_multiday.py
"""Tests for multi-day event span support (Phase 15.1).

Pure-function tests use SimpleNamespace ducks (no DB); route tests use
the standard client_as + db_session fixtures.
"""
from datetime import date, time
from types import SimpleNamespace

import pytest
from sqlalchemy.orm import Session

from backend.app.db.models import Department, User, UserRole
from backend.app.services.event_calendar import expand_one


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _ev(**kw):
    """Minimal event-like SimpleNamespace; mirrors test_event_calendar.py."""
    base = dict(
        id="e1", department_id="d", title="PTO", description=None,
        all_day=True, start_time=None, end_time=None,
        start_date=date(2026, 6, 10), recurrence=None,
        end_date=None,  # Phase 15.1: new field
    )
    base.update(kw)
    return SimpleNamespace(**base)


def _ovr(**kw):
    """Minimal override-like SimpleNamespace."""
    base = dict(
        original_date=None, status="modified",
        override_date=None, override_title=None, override_description=None,
        override_all_day=None, override_start_time=None, override_end_time=None,
    )
    base.update(kw)
    return SimpleNamespace(**base)


# ---------------------------------------------------------------------------
# Pure-function tests — expand_one / EventOccurrence.end_date
# ---------------------------------------------------------------------------

class TestSingleDayNullEndDate:
    """null end_date → end_date == date (backward compat)."""

    def test_non_recurring_end_date_equals_date(self):
        ev = _ev(start_date=date(2026, 7, 6), end_date=None)
        occ = expand_one(ev, [], date(2026, 7, 1), date(2026, 7, 31))
        assert len(occ) == 1
        o = occ[0]
        assert o.date == date(2026, 7, 6)
        assert o.end_date == date(2026, 7, 6)

    def test_recurring_null_end_date_each_occurrence_end_equals_date(self):
        ev = _ev(start_date=date(2026, 7, 6), end_date=None,
                 recurrence={"freq": "weekly", "interval": 1, "byweekday": [0],
                              "end": {"mode": "never"}})
        occ = expand_one(ev, [], date(2026, 7, 1), date(2026, 7, 20))
        assert len(occ) == 3  # Jul 6, 13, 20
        for o in occ:
            assert o.end_date == o.date


class TestSingleNonRecurringMultiDay:
    """Single event Jun 10–14 (5 days, D=4)."""

    def test_occurrence_has_correct_date_and_end_date(self):
        ev = _ev(start_date=date(2026, 6, 10), end_date=date(2026, 6, 14))
        occ = expand_one(ev, [], date(2026, 6, 1), date(2026, 6, 30))
        assert len(occ) == 1
        o = occ[0]
        assert o.date == date(2026, 6, 10)
        assert o.end_date == date(2026, 6, 14)

    def test_entirely_before_window_excluded(self):
        ev = _ev(start_date=date(2026, 6, 1), end_date=date(2026, 6, 5))
        occ = expand_one(ev, [], date(2026, 6, 10), date(2026, 6, 30))
        assert occ == []

    def test_entirely_after_window_excluded(self):
        ev = _ev(start_date=date(2026, 7, 1), end_date=date(2026, 7, 5))
        occ = expand_one(ev, [], date(2026, 6, 1), date(2026, 6, 30))
        assert occ == []


class TestSpanStartsBeforeWindowButOverlaps:
    """Occurrence starts before window but its span reaches into it — must be included."""

    def test_non_recurring_starts_before_window_overlaps_included(self):
        # Event Jun 28 – Jul 2. Window Jul 1–31. Span overlaps the window.
        ev = _ev(start_date=date(2026, 6, 28), end_date=date(2026, 7, 2))
        occ = expand_one(ev, [], date(2026, 7, 1), date(2026, 7, 31))
        assert len(occ) == 1
        o = occ[0]
        assert o.date == date(2026, 6, 28)
        assert o.end_date == date(2026, 7, 2)

    def test_occurrence_ends_exactly_on_window_start_included(self):
        # Span end == window start (inclusive boundary).
        ev = _ev(start_date=date(2026, 6, 25), end_date=date(2026, 7, 1))
        occ = expand_one(ev, [], date(2026, 7, 1), date(2026, 7, 31))
        assert len(occ) == 1

    def test_occurrence_ends_just_before_window_excluded(self):
        # Span end < window start → excluded.
        ev = _ev(start_date=date(2026, 6, 25), end_date=date(2026, 6, 30))
        occ = expand_one(ev, [], date(2026, 7, 1), date(2026, 7, 31))
        assert occ == []


class TestRecurringMultiDay:
    """Recurring event, each occurrence carries the right date/end_date."""

    def test_weekly_3day_span_each_occurrence(self):
        # Every Monday, 3-day span (D=2: Mon–Wed). Window covers 3 weeks.
        ev = _ev(start_date=date(2026, 7, 6), end_date=date(2026, 7, 8),
                 recurrence={"freq": "weekly", "interval": 1, "byweekday": [0],
                              "end": {"mode": "never"}})
        occ = expand_one(ev, [], date(2026, 7, 1), date(2026, 7, 31))
        dates = [(o.date, o.end_date) for o in occ]
        assert (date(2026, 7, 6), date(2026, 7, 8)) in dates
        assert (date(2026, 7, 13), date(2026, 7, 15)) in dates
        assert (date(2026, 7, 20), date(2026, 7, 22)) in dates
        assert (date(2026, 7, 27), date(2026, 7, 29)) in dates

    def test_recurring_span_starts_before_window_included(self):
        # Weekly Monday, D=5. Jun 29 occurrence spans Jun 29 – Jul 3.
        # Window Jul 1–31 → Jun 29 occurrence overlaps → included.
        ev = _ev(start_date=date(2026, 6, 29), end_date=date(2026, 7, 3),
                 recurrence={"freq": "weekly", "interval": 1, "byweekday": [0],
                              "end": {"mode": "never"}})
        occ = expand_one(ev, [], date(2026, 7, 1), date(2026, 7, 31))
        # The Jun 29 occurrence should be present
        assert date(2026, 6, 29) in [o.date for o in occ]
        first = next(o for o in occ if o.date == date(2026, 6, 29))
        assert first.end_date == date(2026, 7, 3)

    def test_no_double_count_recurring_multiday(self):
        # Same weekly event; occurrences must not appear twice.
        ev = _ev(start_date=date(2026, 7, 6), end_date=date(2026, 7, 8),
                 recurrence={"freq": "weekly", "interval": 1, "byweekday": [0],
                              "end": {"mode": "never"}})
        occ = expand_one(ev, [], date(2026, 7, 1), date(2026, 7, 31))
        dates = [o.date for o in occ]
        assert len(dates) == len(set(dates))


class TestOverridesWithMultiDay:
    """Overrides on multi-day events keep the span duration."""

    def test_cancelled_override_drops_span(self):
        ev = _ev(start_date=date(2026, 7, 6), end_date=date(2026, 7, 8),
                 recurrence={"freq": "weekly", "interval": 1, "byweekday": [0],
                              "end": {"mode": "never"}})
        ovr = [_ovr(original_date=date(2026, 7, 13), status="cancelled")]
        occ = expand_one(ev, ovr, date(2026, 7, 1), date(2026, 7, 20))
        assert date(2026, 7, 13) not in [o.date for o in occ]

    def test_modified_override_moves_span(self):
        ev = _ev(start_date=date(2026, 7, 6), end_date=date(2026, 7, 8),
                 recurrence={"freq": "weekly", "interval": 1, "byweekday": [0],
                              "end": {"mode": "never"}})
        ovr = [_ovr(original_date=date(2026, 7, 13), status="modified",
                    override_date=date(2026, 7, 16))]
        occ = expand_one(ev, ovr, date(2026, 7, 1), date(2026, 7, 25))
        moved = next(o for o in occ if o.date == date(2026, 7, 16))
        # D=2, so eff_end = Jul 16 + 2 = Jul 18
        assert moved.end_date == date(2026, 7, 18)
        assert moved.is_override is True

    def test_moved_in_override_outside_window_but_span_overlaps(self):
        """Original outside window, override_date outside window, but span
        of the moved occurrence touches the window → included."""
        ev = _ev(start_date=date(2026, 7, 6), end_date=date(2026, 7, 10),
                 recurrence={"freq": "weekly", "interval": 1, "byweekday": [0],
                              "end": {"mode": "never"}})
        # original Jun 29 → override_date Jun 28. Span Jun 28–Jul 2. Window Jul 1–31.
        ovr = [_ovr(original_date=date(2026, 6, 29), status="modified",
                    override_date=date(2026, 6, 28))]
        occ = expand_one(ev, ovr, date(2026, 7, 1), date(2026, 7, 31))
        assert date(2026, 6, 28) in [o.date for o in occ]

    def test_moved_in_override_no_double_count(self):
        """original_date inside window + override moves it outside → not doubled."""
        ev = _ev(start_date=date(2026, 7, 6), end_date=date(2026, 7, 8),
                 recurrence={"freq": "weekly", "interval": 1, "byweekday": [0],
                              "end": {"mode": "never"}})
        # original Jul 6 is in range; override moves it to Aug 1 (outside Jul window).
        ovr = [_ovr(original_date=date(2026, 7, 6), status="modified",
                    override_date=date(2026, 8, 1))]
        occ = expand_one(ev, ovr, date(2026, 7, 1), date(2026, 7, 31))
        # Jul 6 should not appear (moved away)
        assert date(2026, 7, 6) not in [o.date for o in occ]
        # Aug 1 outside window should not appear (Aug 1–3 is outside Jul window)
        assert date(2026, 8, 1) not in [o.date for o in occ]


class TestNonRecurringMovedInOverride:
    """Non-recurring event: override moves it into the query window via the moved-in path."""

    def test_non_recurring_moved_in_override_overlaps(self):
        """Non-recurring event whose original_date is OUTSIDE the window but a
        modified override moves it to a date whose span overlaps the window.

        The original (Jun 1–3) is well before the Jul window, so _natural_starts
        returns []. The moved-in loop in expand_one must catch the override and
        produce one occurrence at Jul 7–9 (D=2 preserved).
        """
        ev = _ev(start_date=date(2026, 6, 1), end_date=date(2026, 6, 3), recurrence=None)
        # D = (Jun 3 - Jun 1).days = 2
        ovr = SimpleNamespace(
            original_date=date(2026, 6, 1),
            status="modified",
            override_date=date(2026, 7, 7),
            override_title=None,
            override_description=None,
            override_all_day=None,
            override_start_time=None,
            override_end_time=None,
        )
        occ = expand_one(ev, [ovr], date(2026, 7, 1), date(2026, 7, 31))
        assert len(occ) == 1, f"Expected exactly 1 occurrence, got {len(occ)}"
        o = occ[0]
        assert o.date == date(2026, 7, 7)
        assert o.end_date == date(2026, 7, 9)   # Jul 7 + 2 days
        assert date(2026, 6, 1) not in [x.date for x in occ]


# ---------------------------------------------------------------------------
# Route tests
# ---------------------------------------------------------------------------

@pytest.fixture
def env(db_session: Session):
    alpha = Department(code="ALPHA", name="Alpha")
    db_session.add(alpha)
    db_session.flush()
    editor = User(email="ed@x.com", display_name="editor")
    db_session.add(editor)
    db_session.flush()
    db_session.add(UserRole(user_id=editor.id, role_id="project_editor", department_id=alpha.id))
    db_session.flush()
    return {"alpha": alpha, "editor": editor}


def _body(env, **over):
    b = {"department_id": str(env["alpha"].id), "title": "PTO",
         "start_date": "2026-06-10", "all_day": True}
    b.update(over)
    return b


class TestEventRouteEndDate:
    """Route-level tests for end_date create/update validation and echo."""

    def test_create_with_valid_end_date_201(self, env, client_as):
        r = client_as(env["editor"]).post(
            "/api/events", json=_body(env, end_date="2026-06-14"))
        assert r.status_code == 201, r.text
        assert r.json()["end_date"] == "2026-06-14"

    def test_create_end_date_before_start_422(self, env, client_as):
        r = client_as(env["editor"]).post(
            "/api/events", json=_body(env, end_date="2026-06-09"))
        assert r.status_code == 422, r.text

    def test_create_end_date_equals_start_ok(self, env, client_as):
        """end_date == start_date is technically valid (zero duration)."""
        r = client_as(env["editor"]).post(
            "/api/events", json=_body(env, end_date="2026-06-10"))
        assert r.status_code == 201, r.text

    def test_create_no_end_date_null(self, env, client_as):
        r = client_as(env["editor"]).post("/api/events", json=_body(env))
        assert r.status_code == 201, r.text
        assert r.json()["end_date"] is None

    def test_update_end_date_valid(self, env, client_as):
        created = client_as(env["editor"]).post("/api/events", json=_body(env)).json()
        eid = created["id"]
        r = client_as(env["editor"]).patch(
            f"/api/events/{eid}", json={"end_date": "2026-06-14"})
        assert r.status_code == 200, r.text
        assert r.json()["end_date"] == "2026-06-14"

    def test_update_end_date_before_existing_start_422(self, env, client_as):
        created = client_as(env["editor"]).post("/api/events", json=_body(env)).json()
        eid = created["id"]
        r = client_as(env["editor"]).patch(
            f"/api/events/{eid}", json={"end_date": "2026-06-09"})
        assert r.status_code == 422, r.text

    def test_update_start_and_end_date_end_before_new_start_422(self, env, client_as):
        """PATCH sends both start_date and end_date; end before new start → 422."""
        created = client_as(env["editor"]).post("/api/events", json=_body(env)).json()
        eid = created["id"]
        r = client_as(env["editor"]).patch(
            f"/api/events/{eid}",
            json={"start_date": "2026-07-01", "end_date": "2026-06-30"})
        assert r.status_code == 422, r.text


    def test_update_clear_end_date_to_null(self, env, client_as):
        """Create a multi-day event then make it single-day by clearing end_date."""
        r = client_as(env["editor"]).post(
            "/api/events", json=_body(env, start_date="2026-06-10", end_date="2026-06-14"))
        assert r.status_code == 201, r.text
        assert r.json()["end_date"] == "2026-06-14"
        eid = r.json()["id"]

        r2 = client_as(env["editor"]).patch(f"/api/events/{eid}", json={"end_date": None})
        assert r2.status_code == 200, r2.text
        assert r2.json()["end_date"] is None


class TestCalendarEventsRouteEndDate:
    """Calendar /events route emits end_date on each occurrence."""

    def test_multiday_event_end_date_in_calendar_response(self, env, client_as):
        client_as(env["editor"]).post(
            "/api/events", json=_body(env, end_date="2026-06-14"))
        r = client_as(env["editor"]).get(
            "/api/calendar/events?start=2026-06-01&end=2026-06-30")
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["date"] == "2026-06-10"
        assert items[0]["end_date"] == "2026-06-14"

    def test_single_day_event_end_date_equals_date(self, env, client_as):
        client_as(env["editor"]).post("/api/events", json=_body(env))
        r = client_as(env["editor"]).get(
            "/api/calendar/events?start=2026-06-01&end=2026-06-30")
        assert r.status_code == 200
        items = r.json()["items"]
        assert len(items) == 1
        assert items[0]["end_date"] == items[0]["date"]

    def test_span_starts_before_window_included_in_calendar(self, env, client_as):
        """Event starts Jun 28, ends Jul 2. Window Jul 1–31 → must appear."""
        env2 = env.copy()
        body = {"department_id": str(env["alpha"].id), "title": "OverlapPTO",
                "start_date": "2026-06-28", "end_date": "2026-07-02", "all_day": True}
        client_as(env["editor"]).post("/api/events", json=body)
        r = client_as(env["editor"]).get(
            "/api/calendar/events?start=2026-07-01&end=2026-07-31")
        assert r.status_code == 200
        items = r.json()["items"]
        assert any(i["date"] == "2026-06-28" and i["end_date"] == "2026-07-02"
                   for i in items)
