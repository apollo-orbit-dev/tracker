# backend/app/services/event_calendar.py
"""Recurrence validation + occurrence expansion for custom events (Phase 14).

Pure functions: callers pass already-loaded Event + override objects. No DB
access here. Expansion uses dateutil.rrule and applies per-occurrence
overrides (cancel / modify / move).

Phase 15.1: EventOccurrence gains end_date; expand_one is span-aware.
"""
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta

from dateutil.rrule import DAILY, MONTHLY, WEEKLY, YEARLY, rrule
from fastapi import HTTPException

_FREQ = {"daily": DAILY, "weekly": WEEKLY, "monthly": MONTHLY, "yearly": YEARLY}
MAX_OCCURRENCES = 366


def _bad(detail: str):
    raise HTTPException(status_code=422, detail=detail)


def validate_recurrence(recurrence: dict | None) -> dict | None:
    if recurrence is None:
        return None
    if not isinstance(recurrence, dict):
        _bad("recurrence must be an object")
    freq = recurrence.get("freq")
    if freq not in _FREQ:
        _bad(f"invalid freq: {freq}")
    interval = recurrence.get("interval", 1)
    if not isinstance(interval, int) or interval < 1:
        _bad("interval must be an integer >= 1")
    out: dict = {"freq": freq, "interval": interval}
    if freq == "weekly":
        days = recurrence.get("byweekday", [])
        if not isinstance(days, list) or not all(isinstance(d, int) and 0 <= d <= 6 for d in days):
            _bad("byweekday must be a list of 0-6")
        out["byweekday"] = days
    if freq == "monthly":
        mode = recurrence.get("monthly_mode")
        if mode == "day_of_month":
            dom = recurrence.get("bymonthday")
            if not isinstance(dom, int) or not 1 <= dom <= 31:
                _bad("bymonthday must be 1-31")
            out["monthly_mode"] = mode
            out["bymonthday"] = dom
        elif mode == "nth_weekday":
            pos = recurrence.get("bysetpos")
            wd = recurrence.get("byweekday_nth")
            if pos not in (1, 2, 3, 4, 5, -1):
                _bad("bysetpos must be 1-5 or -1")
            if not isinstance(wd, int) or not 0 <= wd <= 6:
                _bad("byweekday_nth must be 0-6")
            out["monthly_mode"] = mode
            out["bysetpos"] = pos
            out["byweekday_nth"] = wd
        else:
            _bad("monthly_mode must be day_of_month or nth_weekday")
    end = recurrence.get("end", {"mode": "never"})
    if not isinstance(end, dict) or end.get("mode") not in ("never", "until", "count"):
        _bad("end.mode must be never/until/count")
    if end["mode"] == "count":
        c = end.get("count")
        if not isinstance(c, int) or c < 1:
            _bad("end.count must be an integer >= 1")
        out["end"] = {"mode": "count", "count": c}
    elif end["mode"] == "until":
        u = end.get("until")
        if isinstance(u, str):
            try:
                date.fromisoformat(u)
            except ValueError:
                _bad("end.until must be a date")
            until_iso = u
        elif isinstance(u, date):
            until_iso = u.isoformat()
        else:
            _bad("end.until must be a date")
        out["end"] = {"mode": "until", "until": until_iso}
    else:
        out["end"] = {"mode": "never"}
    return out


def build_rrule(start_date: date, recurrence: dict) -> rrule:
    kwargs: dict = {"freq": _FREQ[recurrence["freq"]],
                    "interval": recurrence.get("interval", 1),
                    "dtstart": datetime.combine(start_date, time())}
    if recurrence["freq"] == "weekly" and recurrence.get("byweekday"):
        kwargs["byweekday"] = recurrence["byweekday"]
    if recurrence["freq"] == "monthly":
        if recurrence.get("monthly_mode") == "day_of_month":
            kwargs["bymonthday"] = recurrence["bymonthday"]
        elif recurrence.get("monthly_mode") == "nth_weekday":
            kwargs["byweekday"] = recurrence["byweekday_nth"]
            kwargs["bysetpos"] = recurrence["bysetpos"]
    end = recurrence.get("end", {"mode": "never"})
    if end["mode"] == "count":
        kwargs["count"] = end["count"]
    elif end["mode"] == "until":
        u = end["until"]
        u = date.fromisoformat(u) if isinstance(u, str) else u
        kwargs["until"] = datetime.combine(u, time(23, 59, 59))
    return rrule(**kwargs)


@dataclass
class EventOccurrence:
    event_id: str
    original_date: date
    date: date
    end_date: date  # Phase 15.1: occurrence span end (== date for single-day)
    title: str
    description: str | None
    all_day: bool
    start_time: time | None
    end_time: time | None
    is_recurring: bool
    is_override: bool


def _duration(event) -> int:
    """Span duration in days. 0 for single-day events."""
    if getattr(event, "end_date", None) is not None and event.end_date is not None:
        return (event.end_date - event.start_date).days
    return 0


def _natural_starts(event, start: date, end: date, D: int) -> list[date]:
    """Candidate occurrence START dates that could overlap [start, end].

    For non-recurring: the single start_date (included only if it can overlap).
    For recurring: query rrule starting D days before the window (so spans
    starting before the window but reaching into it are caught), capped at
    MAX_OCCURRENCES.
    """
    if not event.recurrence:
        # Non-recurring: include if span [start_date, start_date+D] overlaps [start, end].
        sd = event.start_date
        if sd <= end and sd + timedelta(days=D) >= start:
            return [sd]
        return []
    # Recurring: extend the search window leftward by D days to catch overlapping spans.
    search_start = start - timedelta(days=D)
    rule = build_rrule(event.start_date, event.recurrence)
    occ = rule.between(
        datetime.combine(search_start, time()),
        datetime.combine(end, time(23, 59, 59)),
        inc=True,
    )
    return [d.date() for d in occ[:MAX_OCCURRENCES]]


def expand_one(event, overrides: list, start: date, end: date) -> list[EventOccurrence]:
    by_orig = {o.original_date: o for o in overrides}
    is_recurring = bool(event.recurrence)
    D = _duration(event)
    out: list[EventOccurrence] = []
    handled_originals: set[date] = set()

    for os in _natural_starts(event, start, end, D):
        ovr = by_orig.get(os)
        if ovr is None:
            eff_start = os
            eff_end = os + timedelta(days=D)
            # Only include if span overlaps the window.
            if eff_start <= end and eff_end >= start:
                out.append(EventOccurrence(
                    event_id=str(event.id), original_date=os, date=eff_start,
                    end_date=eff_end, title=event.title,
                    description=event.description, all_day=event.all_day,
                    start_time=event.start_time, end_time=event.end_time,
                    is_recurring=is_recurring, is_override=False))
            handled_originals.add(os)
        elif ovr.status == "cancelled":
            handled_originals.add(os)
            continue
        else:  # modified
            eff_start = ovr.override_date if ovr.override_date is not None else os
            eff_end = eff_start + timedelta(days=D)
            # Include if span overlaps the window.
            if eff_start <= end and eff_end >= start:
                out.append(_modified_occurrence(event, ovr, os, eff_start, eff_end, is_recurring))
            handled_originals.add(os)

    # moved-in occurrences: modified overrides whose original_date is OUTSIDE the
    # natural-starts range but whose override span overlaps the window.
    for ovr in overrides:
        if ovr.status != "modified" or ovr.override_date is None:
            continue
        if ovr.original_date in handled_originals:
            continue  # already handled in the main loop
        # Span of the moved occurrence:
        eff_start = ovr.override_date
        eff_end = eff_start + timedelta(days=D)
        if eff_start <= end and eff_end >= start:
            out.append(_modified_occurrence(event, ovr, ovr.original_date, eff_start, eff_end, is_recurring))

    out.sort(key=lambda o: o.date)
    return out


def _modified_occurrence(event, ovr, original: date, eff_start: date, eff_end: date,
                          is_recurring: bool) -> EventOccurrence:
    return EventOccurrence(
        event_id=str(event.id), original_date=original, date=eff_start,
        end_date=eff_end,
        title=ovr.override_title if ovr.override_title is not None else event.title,
        description=ovr.override_description if ovr.override_description is not None else event.description,
        all_day=ovr.override_all_day if ovr.override_all_day is not None else event.all_day,
        start_time=ovr.override_start_time if ovr.override_start_time is not None else event.start_time,
        end_time=ovr.override_end_time if ovr.override_end_time is not None else event.end_time,
        is_recurring=is_recurring, is_override=True)
