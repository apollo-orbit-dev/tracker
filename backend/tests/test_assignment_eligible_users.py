import uuid

import pytest
from sqlalchemy.orm import Session

from backend.app.db.models import (
    Client,
    Department,
    Discipline,
    Project,
    ProjectRoleAssignment,
    Template,
    User,
    UserRole,
)


def _user(db: Session, email: str) -> User:
    u = User(email=email, display_name=email.split("@")[0])
    db.add(u)
    db.flush()
    return u


@pytest.fixture
def scenario(db_session: Session):
    """A project in dept ALPHA, plus users in/around it."""
    alpha = Department(code="ALPHA", name="Alpha")
    beta = Department(code="BETA", name="Beta")
    db_session.add_all([alpha, beta])
    db_session.flush()
    cl = Client(code="C", name="C", department_id=alpha.id)
    di = Discipline(code="D", name="D", department_id=alpha.id)
    db_session.add_all([cl, di])
    db_session.flush()
    t = Template(name="t", department_id=alpha.id, client_id=cl.id, discipline_id=di.id)
    db_session.add(t)
    db_session.flush()

    # Need a creator user before the project (created_by is NOT NULL)
    in_dept = _user(db_session, "indept@x.com")
    db_session.add(UserRole(user_id=in_dept.id, role_id="project_editor", department_id=alpha.id))
    db_session.flush()

    proj = Project(project_number="P", title="x", template_id=t.id, created_by=in_dept.id)
    db_session.add(proj)
    db_session.flush()
    out_dept = _user(db_session, "outdept@x.com")
    db_session.add(UserRole(user_id=out_dept.id, role_id="project_editor", department_id=beta.id))
    shared = _user(db_session, "shared@x.com")
    db_session.add(UserRole(user_id=shared.id, role_id="project_editor", department_id=beta.id))
    db_session.add(ProjectRoleAssignment(user_id=shared.id, project_id=proj.id))
    org_admin = _user(db_session, "orgadmin@x.com")
    db_session.add(UserRole(user_id=org_admin.id, role_id="admin", department_id=None))
    org_viewer = _user(db_session, "orgviewer@x.com")
    db_session.add(UserRole(user_id=org_viewer.id, role_id="viewer", department_id=None))
    db_session.flush()
    return {
        "project": proj,
        "in_dept": in_dept,
        "out_dept": out_dept,
        "shared": shared,
        "org_admin": org_admin,
        "org_viewer": org_viewer,
    }


def test_eligible_users_set(scenario, client_as):
    proj = scenario["project"]
    c = client_as(scenario["in_dept"])
    r = c.get(f"/api/projects/{proj.id}/assignments/eligible-users")
    assert r.status_code == 200
    emails = {item["email"] for item in r.json()["items"]}
    assert "indept@x.com" in emails       # dept role in project's dept
    assert "shared@x.com" in emails       # direct project share
    assert "orgadmin@x.com" in emails     # org admin
    assert "orgviewer@x.com" in emails    # org viewer (no dept) can view every project
    assert "outdept@x.com" not in emails  # other dept, no share -> excluded
