from datetime import date

import pytest
from sqlalchemy.orm import Session

from backend.app.db.models import Department, User, UserRole


@pytest.fixture
def env(db_session: Session):
    alpha = Department(code="ALPHA", name="Alpha"); beta = Department(code="BETA", name="Beta")
    db_session.add_all([alpha, beta]); db_session.flush()
    def mk(email, role, dept):
        u = User(email=email, display_name=email.split("@")[0]); db_session.add(u); db_session.flush()
        if role: db_session.add(UserRole(user_id=u.id, role_id=role, department_id=dept))
        return u
    editor = mk("ed@x.com", "project_editor", alpha.id)
    viewer = mk("vw@x.com", "viewer", alpha.id)
    outsider = mk("out@x.com", "project_editor", beta.id)
    db_session.flush()
    return locals()


def _body(env, **over):
    b = {"department_id": str(env["alpha"].id), "title": "PTO", "start_date": "2026-07-06",
         "all_day": True}
    b.update(over); return b


def test_editor_creates_event(env, client_as):
    c = client_as(env["editor"])
    r = c.post("/api/events", json=_body(env, recurrence={"freq": "weekly", "interval": 2,
               "byweekday": [0], "end": {"mode": "never"}}))
    assert r.status_code == 201, r.text
    assert r.json()["recurrence"]["interval"] == 2


def test_viewer_cannot_create(env, client_as):
    assert client_as(env["viewer"]).post("/api/events", json=_body(env)).status_code == 403


def test_outsider_cannot_create_in_alpha(env, client_as):
    assert client_as(env["outsider"]).post("/api/events", json=_body(env)).status_code == 403


def test_bad_recurrence_422(env, client_as):
    r = client_as(env["editor"]).post("/api/events", json=_body(env,
        recurrence={"freq": "weekly", "interval": 0, "end": {"mode": "never"}}))
    assert r.status_code == 422


def test_viewer_can_read_patch_delete_gated(env, client_as):
    created = client_as(env["editor"]).post("/api/events", json=_body(env)).json()
    eid = created["id"]
    assert client_as(env["viewer"]).get(f"/api/events/{eid}").status_code == 200
    assert client_as(env["viewer"]).patch(f"/api/events/{eid}", json={"title": "x"}).status_code == 403
    assert client_as(env["editor"]).patch(f"/api/events/{eid}", json={"title": "x"}).status_code == 200
    assert client_as(env["editor"]).delete(f"/api/events/{eid}").status_code == 204
    assert client_as(env["viewer"]).get(f"/api/events/{eid}").status_code == 404


def test_outsider_cannot_read(env, client_as):
    created = client_as(env["editor"]).post("/api/events", json=_body(env)).json()
    assert client_as(env["outsider"]).get(f"/api/events/{created['id']}").status_code == 404


def test_outsider_cannot_delete(env, client_as):
    created = client_as(env["editor"]).post("/api/events", json=_body(env)).json()
    eid = created["id"]
    assert client_as(env["outsider"]).delete(f"/api/events/{eid}").status_code in (403, 404)


def test_create_event_with_about_user_audits_uuid(env, client_as):
    """Regression: about_user_id (a UUID) must serialize in the audit payload.

    Previously POST 500'd with 'unsupported audit-payload type: UUID' because
    the about-user FK was audited raw. Per-task tests never set about_user_id.
    """
    c = client_as(env["editor"])
    r = c.post("/api/events", json=_body(env, about_user_id=str(env["editor"].id)))
    assert r.status_code == 201, r.text
    assert r.json()["about_user_id"] == str(env["editor"].id)


def test_create_timed_event_audits_time(env, client_as):
    """Regression: start_time/end_time (datetime.time) must serialize in audit.

    A non-all-day event 500'd with 'unsupported audit-payload type: time'.
    """
    c = client_as(env["editor"])
    r = c.post("/api/events", json=_body(
        env, all_day=False, start_time="09:00:00", end_time="10:00:00"))
    assert r.status_code == 201, r.text
    assert r.json()["start_time"] == "09:00:00"
