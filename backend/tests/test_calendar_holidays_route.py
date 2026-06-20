from sqlalchemy.orm import Session

from backend.app.services.app_settings import set_setting


def test_holidays_endpoint_disabled_by_default(client_as, viewer_user):
    c = client_as(viewer_user)
    r = c.get("/api/calendar/holidays?start=2026-07-01&end=2026-07-31")
    assert r.status_code == 200
    assert r.json()["items"] == []


def test_holidays_endpoint_returns_when_enabled(client_as, admin_user, db_session: Session):
    set_setting(db_session, "holidays", {"enabled": True, "countries": ["US"]}, admin_user)
    db_session.commit()
    c = client_as(admin_user)
    r = c.get("/api/calendar/holidays?start=2026-07-01&end=2026-07-31")
    assert r.status_code == 200
    assert any(i["date"] == "2026-07-04" for i in r.json()["items"])


def test_holidays_endpoint_not_dept_scoped(client_as, viewer_user, db_session: Session, admin_user):
    # A plain viewer with no project access still sees holidays once enabled.
    set_setting(db_session, "holidays", {"enabled": True, "countries": ["US"]}, admin_user)
    db_session.commit()
    r = client_as(viewer_user).get("/api/calendar/holidays?start=2026-07-01&end=2026-07-31")
    assert any(i["date"] == "2026-07-04" for i in r.json()["items"])


def test_holidays_endpoint_bad_range_422(client_as, viewer_user):
    c = client_as(viewer_user)
    assert c.get("/api/calendar/holidays?start=2026-07-10&end=2026-07-01").status_code == 422
    assert c.get("/api/calendar/holidays?start=2026-01-01&end=2026-12-31").status_code == 422
