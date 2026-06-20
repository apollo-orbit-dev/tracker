from datetime import date

from backend.app.services.holiday_calendar import holiday_items


def test_disabled_returns_empty():
    assert holiday_items(date(2026, 1, 1), date(2026, 12, 31), {"enabled": False, "countries": ["US"]}) == []


def test_us_independence_day_in_range():
    items = holiday_items(date(2026, 7, 1), date(2026, 7, 31), {"enabled": True, "countries": ["US"]})
    names = {i.name for i in items}
    dates = {i.date for i in items}
    assert any("Independence Day" in n for n in names)
    assert date(2026, 7, 4) in dates
    assert all(i.type == "holiday" and i.country == "US" for i in items)


def test_out_of_range_excluded():
    items = holiday_items(date(2026, 8, 1), date(2026, 8, 15), {"enabled": True, "countries": ["US"]})
    assert date(2026, 7, 4) not in {i.date for i in items}
