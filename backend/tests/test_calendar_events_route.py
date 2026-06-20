import pytest
from sqlalchemy.orm import Session
from backend.app.db.models import Department, User, UserRole


@pytest.fixture
def env(db_session: Session):
    a = Department(code="A", name="A"); b = Department(code="B", name="B")
    db_session.add_all([a, b]); db_session.flush()
    ed = User(email="ed@x.com", display_name="ed"); vw = User(email="vw@x.com", display_name="vw")
    db_session.add_all([ed, vw]); db_session.flush()
    db_session.add_all([UserRole(user_id=ed.id, role_id="project_editor", department_id=a.id),
                        UserRole(user_id=vw.id, role_id="viewer", department_id=b.id)])
    db_session.flush()
    return {"a": a, "b": b, "ed": ed, "vw": vw}


def _series(env, client_as):
    return client_as(env["ed"]).post("/api/events", json={
        "department_id": str(env["a"].id), "title": "Standup", "start_date": "2026-07-06",
        "recurrence": {"freq": "weekly", "interval": 1, "byweekday": [0], "end": {"mode": "never"}},
    }).json()


def test_returns_expanded_occurrences(env, client_as):
    _series(env, client_as)
    r = client_as(env["ed"]).get("/api/calendar/events?start=2026-07-01&end=2026-07-31")
    assert r.status_code == 200
    dates = sorted(i["date"] for i in r.json()["items"])
    assert "2026-07-06" in dates and "2026-07-13" in dates and all(i["type"] == "event" for i in r.json()["items"])


def test_other_dept_excluded(env, client_as):
    _series(env, client_as)  # dept A
    r = client_as(env["vw"]).get("/api/calendar/events?start=2026-07-01&end=2026-07-31")  # viewer in B
    assert r.json()["items"] == []


def test_bad_range_422(env, client_as):
    c = client_as(env["ed"])
    assert c.get("/api/calendar/events?start=2026-07-10&end=2026-07-01").status_code == 422
    assert c.get("/api/calendar/events?start=2026-01-01&end=2026-12-31").status_code == 422
