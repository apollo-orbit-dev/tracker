import uuid
from datetime import date

from sqlalchemy.orm import Session

from backend.app.db.models import (
    ASSIGNMENT_STATUSES,
    Assignment,
    Client,
    Department,
    Discipline,
    Project,
    Template,
    User,
)


def _seed_project(db: Session) -> tuple[Project, User]:
    d = Department(code="ASGN", name="Assignments Dept")
    db.add(d)
    db.flush()
    cl = Client(code="C1", name="Client One", department_id=d.id)
    di = Discipline(code="D1", name="Disc One", department_id=d.id)
    db.add_all([cl, di])
    db.flush()
    t = Template(name="t", department_id=d.id, client_id=cl.id, discipline_id=di.id)
    db.add(t)
    db.flush()
    u = User(email="a@example.com", display_name="Assignee A")
    db.add(u)
    db.flush()
    p = Project(project_number="P-1", title="x", template_id=t.id, created_by=u.id)
    db.add(p)
    db.flush()
    return p, u


def test_assignment_round_trips(db_session: Session) -> None:
    assert ASSIGNMENT_STATUSES == frozenset(
        {"open", "in_progress", "done", "cancelled"}
    )
    p, u = _seed_project(db_session)
    a = Assignment(
        project_id=p.id,
        assignee_user_id=u.id,
        description="Wire the relay panel",
        status="open",
        due_date=date(2026, 7, 1),
    )
    db_session.add(a)
    db_session.flush()
    fetched = db_session.get(Assignment, a.id)
    assert fetched is not None
    assert fetched.milestone_id is None
    assert fetched.status == "open"
    assert fetched.assignee.display_name == "Assignee A"
