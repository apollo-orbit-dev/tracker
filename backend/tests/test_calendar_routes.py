from datetime import date, datetime, timezone

import pytest
from sqlalchemy.orm import Session

from backend.app.db.models import (
    Assignment, Client, Department, Discipline, Milestone, Project,
    Template, User, UserRole,
)


@pytest.fixture
def env(db_session: Session):
    d = Department(code="ALPHA", name="Alpha")
    d2 = Department(code="BETA", name="Beta")
    db_session.add_all([d, d2]); db_session.flush()
    cl = Client(code="C", name="C", department_id=d.id)
    di = Discipline(code="D", name="D", department_id=d.id)
    db_session.add_all([cl, di]); db_session.flush()
    t = Template(name="t", department_id=d.id, client_id=cl.id, discipline_id=di.id)
    t2 = Template(name="t2", department_id=d2.id, client_id=cl.id, discipline_id=di.id)
    db_session.add_all([t, t2]); db_session.flush()
    editor = User(email="e@x.com", display_name="Editor"); db_session.add(editor); db_session.flush()
    db_session.add(UserRole(user_id=editor.id, role_id="project_editor", department_id=d.id))
    proj = Project(project_number="P", title="In Scope", template_id=t.id, created_by=editor.id)
    out = Project(project_number="PO", title="Out", template_id=t2.id, created_by=editor.id)
    db_session.add_all([proj, out]); db_session.flush()
    m = Milestone(project_id=proj.id, name="Submit", direction="outbound",
                  date_model="single", planned_date=date(2026, 7, 10))
    m_out = Milestone(project_id=out.id, name="Other", direction="outbound",
                      date_model="single", planned_date=date(2026, 7, 11))
    a = Assignment(project_id=proj.id, assignee_user_id=editor.id,
                   description="Wire panel", status="open", due_date=date(2026, 7, 12))
    a_nodue = Assignment(project_id=proj.id, assignee_user_id=editor.id,
                         description="No due", status="open", due_date=None)
    db_session.add_all([m, m_out, a, a_nodue]); db_session.flush()
    return locals()


def test_returns_milestones_and_assignments_in_range(env, client_as):
    c = client_as(env["editor"])
    r = c.get("/api/calendar/items?start=2026-07-01&end=2026-07-31")
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    kinds = {(i["type"], i["id"]) for i in items}
    assert ("milestone", str(env["m"].id)) in kinds
    assert ("assignment", str(env["a"].id)) in kinds
    # out-of-scope milestone excluded; no-due assignment excluded
    assert ("milestone", str(env["m_out"].id)) not in kinds
    assert all(not (i["type"] == "assignment" and i["id"] == str(env["a_nodue"].id)) for i in items)


def test_milestone_uses_planned_date_and_completed_flag(env, client_as, db_session):
    env["m"].actual_date = date(2026, 7, 9)
    db_session.flush()
    c = client_as(env["editor"])
    r = c.get("/api/calendar/items?start=2026-07-01&end=2026-07-31&types=milestone")
    m = next(i for i in r.json()["items"] if i["id"] == str(env["m"].id))
    assert m["date"] == "2026-07-10"  # planned_date anchor
    assert m["completed"] is True
    assert all(i["type"] == "milestone" for i in r.json()["items"])  # types filter


def test_range_out_of_window_excludes(env, client_as):
    c = client_as(env["editor"])
    r = c.get("/api/calendar/items?start=2026-08-01&end=2026-08-31")
    assert r.json()["items"] == []


def test_bad_range_422(env, client_as):
    c = client_as(env["editor"])
    assert c.get("/api/calendar/items?start=2026-07-10&end=2026-07-01").status_code == 422
    assert c.get("/api/calendar/items?start=2026-01-01&end=2026-12-31").status_code == 422  # >92d


def test_types_assignment_excludes_milestones(env, client_as):
    c = client_as(env["editor"])
    r = c.get("/api/calendar/items?start=2026-07-01&end=2026-07-31&types=assignment")
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert all(i["type"] == "assignment" for i in items)
    assert any(i["id"] == str(env["a"].id) for i in items)


def test_soft_deleted_milestone_excluded(env, client_as, db_session):
    env["m"].deleted_at = datetime.now(timezone.utc)
    db_session.flush()
    c = client_as(env["editor"])
    r = c.get("/api/calendar/items?start=2026-07-01&end=2026-07-31")
    assert r.status_code == 200, r.text
    kinds = {(i["type"], i["id"]) for i in r.json()["items"]}
    assert ("milestone", str(env["m"].id)) not in kinds


def test_soft_deleted_assignment_excluded(env, client_as, db_session):
    env["a"].deleted_at = datetime.now(timezone.utc)
    db_session.flush()
    c = client_as(env["editor"])
    r = c.get("/api/calendar/items?start=2026-07-01&end=2026-07-31")
    assert r.status_code == 200, r.text
    kinds = {(i["type"], i["id"]) for i in r.json()["items"]}
    assert ("assignment", str(env["a"].id)) not in kinds
