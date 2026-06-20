import uuid

from sqlalchemy.orm import Session

from backend.app.db.models import (
    Client, Department, Discipline, Project, Template, User, UserRole,
)
from backend.app.services.project_scope import scoped_project_ids


def _seed(db: Session):
    d_in = Department(code="IN", name="In")
    d_out = Department(code="OUT", name="Out")
    db.add_all([d_in, d_out]); db.flush()
    cl = Client(code="C", name="C", department_id=d_in.id)
    di = Discipline(code="D", name="D", department_id=d_in.id)
    db.add_all([cl, di]); db.flush()
    t_in = Template(name="t", department_id=d_in.id, client_id=cl.id, discipline_id=di.id)
    cl2 = Client(code="C2", name="C2", department_id=d_out.id)
    di2 = Discipline(code="D2", name="D2", department_id=d_out.id)
    db.add_all([cl2, di2]); db.flush()
    t_out = Template(name="t2", department_id=d_out.id, client_id=cl2.id, discipline_id=di2.id)
    db.add_all([t_in, t_out]); db.flush()
    u = User(email="u@x.com", display_name="u"); db.add(u); db.flush()
    p_in = Project(project_number="PIN", title="x", template_id=t_in.id, created_by=u.id)
    p_out = Project(project_number="POUT", title="y", template_id=t_out.id, created_by=u.id)
    db.add_all([p_in, p_out]); db.flush()
    db.add(UserRole(user_id=u.id, role_id="viewer", department_id=d_in.id)); db.flush()
    return u, p_in, p_out


def test_scoped_project_ids_filters_to_accessible_dept(db_session: Session):
    u, p_in, p_out = _seed(db_session)
    ids = set(db_session.execute(scoped_project_ids(db_session, u)).scalars().all())
    assert p_in.id in ids
    assert p_out.id not in ids
