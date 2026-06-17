"""Constraint + cascade tests for the Phase 3.0.3
`project_role_assignments` table.

Invariants:
- Composite PK `(user_id, project_id)` rejects duplicate grants.
- `ON DELETE CASCADE` on `user_id` and `project_id` so deleting either
  side transparently cleans up grant rows.
- `granted_by` may be NULL (covers seed paths and post-hoc admin grants).
"""
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.db.models import (
    Client,
    Department,
    Discipline,
    Project,
    ProjectRoleAssignment,
    Template,
    User,
)


def _make_user(db_session: Session, email: str) -> User:
    user = User(email=email, display_name="t")
    db_session.add(user)
    db_session.flush()
    return user


def _make_project(db_session: Session, code: str) -> Project:
    dept = Department(code=code, name=f"Dept {code}")
    cl = Client(code=f"CL_{code}", name="cl", department_id=None)
    db_session.add_all([dept])
    db_session.flush()
    cl.department_id = dept.id
    di = Discipline(code=f"DI_{code}", name="di", department_id=dept.id)
    db_session.add_all([cl, di])
    db_session.flush()
    t = Template(
        name=f"t-{code}",
        department_id=dept.id,
        client_id=cl.id,
        discipline_id=di.id,
    )
    db_session.add(t)
    db_session.flush()
    creator = _make_user(db_session, f"creator-{code}@example.com")
    p = Project(
        project_number=f"PRA-{code}",
        title=f"proj {code}",
        template_id=t.id,
        created_by=creator.id,
    )
    db_session.add(p)
    db_session.flush()
    return p


# ---- composite PK -------------------------------------------------------


def test_unique_user_project_pair_rejected(db_session: Session):
    user = _make_user(db_session, "dup@pra.test")
    proj = _make_project(db_session, "PRADUP")
    db_session.add(
        ProjectRoleAssignment(user_id=user.id, project_id=proj.id)
    )
    db_session.flush()
    db_session.add(
        ProjectRoleAssignment(user_id=user.id, project_id=proj.id)
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_same_user_two_projects_ok(db_session: Session):
    user = _make_user(db_session, "multi@pra.test")
    proj_a = _make_project(db_session, "PRAA")
    proj_b = _make_project(db_session, "PRAB")
    db_session.add(
        ProjectRoleAssignment(user_id=user.id, project_id=proj_a.id)
    )
    db_session.add(
        ProjectRoleAssignment(user_id=user.id, project_id=proj_b.id)
    )
    db_session.flush()


def test_same_project_two_users_ok(db_session: Session):
    user_a = _make_user(db_session, "ua@pra.test")
    user_b = _make_user(db_session, "ub@pra.test")
    proj = _make_project(db_session, "PRA2U")
    db_session.add(
        ProjectRoleAssignment(user_id=user_a.id, project_id=proj.id)
    )
    db_session.add(
        ProjectRoleAssignment(user_id=user_b.id, project_id=proj.id)
    )
    db_session.flush()


# ---- granted_by ---------------------------------------------------------


def test_granted_by_nullable_ok(db_session: Session):
    user = _make_user(db_session, "nullgrant@pra.test")
    proj = _make_project(db_session, "PRAN")
    db_session.add(
        ProjectRoleAssignment(
            user_id=user.id, project_id=proj.id, granted_by=None
        )
    )
    db_session.flush()


def test_granted_by_set_to_known_user(db_session: Session):
    user = _make_user(db_session, "g@pra.test")
    grantor = _make_user(db_session, "gor@pra.test")
    proj = _make_project(db_session, "PRAG")
    db_session.add(
        ProjectRoleAssignment(
            user_id=user.id, project_id=proj.id, granted_by=grantor.id
        )
    )
    db_session.flush()


# ---- cascade ------------------------------------------------------------


def test_delete_user_cascades_assignments(db_session: Session):
    user = _make_user(db_session, "delu@pra.test")
    proj = _make_project(db_session, "PRADU")
    db_session.add(
        ProjectRoleAssignment(user_id=user.id, project_id=proj.id)
    )
    db_session.flush()
    db_session.delete(user)
    db_session.flush()
    remaining = db_session.execute(
        select(ProjectRoleAssignment).where(
            ProjectRoleAssignment.project_id == proj.id
        )
    ).scalars().all()
    assert remaining == []


def test_delete_project_cascades_assignments(db_session: Session):
    user = _make_user(db_session, "delp@pra.test")
    proj = _make_project(db_session, "PRADP")
    db_session.add(
        ProjectRoleAssignment(user_id=user.id, project_id=proj.id)
    )
    db_session.flush()
    db_session.delete(proj)
    db_session.flush()
    remaining = db_session.execute(
        select(ProjectRoleAssignment).where(
            ProjectRoleAssignment.user_id == user.id
        )
    ).scalars().all()
    assert remaining == []


def test_unknown_project_fk_rejected(db_session: Session):
    user = _make_user(db_session, "fkp@pra.test")
    db_session.add(
        ProjectRoleAssignment(user_id=user.id, project_id=uuid.uuid4())
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_unknown_user_fk_rejected(db_session: Session):
    proj = _make_project(db_session, "PRAFKU")
    db_session.add(
        ProjectRoleAssignment(user_id=uuid.uuid4(), project_id=proj.id)
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
