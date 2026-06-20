"""Compute holidays for a date range from the `holidays` library (Phase 13).

Gated by the `holidays` app-setting (enabled + whitelisted countries).
Read-only, global (not department-scoped).
"""
from datetime import date

import holidays as holidays_lib

from backend.app.schemas.calendar import CalendarHolidayItem


def holiday_items(start: date, end: date, setting: dict) -> list[CalendarHolidayItem]:
    if not setting.get("enabled"):
        return []
    out: list[CalendarHolidayItem] = []
    years = range(start.year, end.year + 1)
    for code in setting.get("countries", []):
        cal = holidays_lib.country_holidays(code, years=years)
        for d, name in cal.items():
            if start <= d <= end:
                out.append(CalendarHolidayItem(date=d, name=name, country=code))
    out.sort(key=lambda i: (i.date, i.country))
    return out
