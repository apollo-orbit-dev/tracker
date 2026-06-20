import pytest
from sqlalchemy.orm import Session
from backend.app.db.models import Department, User, UserRole


@pytest.fixture
def env(db_session: Session):
    d = Department(code="ALPHA", name="Alpha"); db_session.add(d); db_session.flush()
    ed = User(email="ed@x.com", display_name="ed"); db_session.add(ed); db_session.flush()
    db_session.add(UserRole(user_id=ed.id, role_id="project_editor", department_id=d.id)); db_session.flush()
    return {"d": d, "ed": ed}


def _series(env, client_as):
    return client_as(env["ed"]).post("/api/events", json={
        "department_id": str(env["d"].id), "title": "Standup", "start_date": "2026-07-06",
        "recurrence": {"freq": "weekly", "interval": 1, "byweekday": [0], "end": {"mode": "never"}},
    }).json()


def test_cancel_occurrence(env, client_as):
    eid = _series(env, client_as)["id"]
    r = client_as(env["ed"]).delete(f"/api/events/{eid}/occurrences/2026-07-13")
    assert r.status_code == 204


def test_modify_occurrence_moves_it(env, client_as):
    eid = _series(env, client_as)["id"]
    r = client_as(env["ed"]).put(f"/api/events/{eid}/occurrences/2026-07-13",
                                 json={"override_date": "2026-07-15", "override_title": "Moved"})
    assert r.status_code == 200, r.text


def test_modify_non_occurrence_422(env, client_as):
    eid = _series(env, client_as)["id"]
    # 2026-07-14 is a Tuesday — not an occurrence of a Monday series
    r = client_as(env["ed"]).put(f"/api/events/{eid}/occurrences/2026-07-14", json={"override_title": "x"})
    assert r.status_code == 422
