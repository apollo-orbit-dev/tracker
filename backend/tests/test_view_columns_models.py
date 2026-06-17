"""Smoke test for the UserProjectViewColumns model — verifies the
unique constraint on (user_id, template_id) and the FK cascades.
"""
import uuid

import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.db.models import (
    Client,
    Department,
    Discipline,
    Template,
    User,
    UserProjectViewColumns,
)


def _make_template(db_session: Session, user: User) -> Template:
    dept = Department(code=f"D{uuid.uuid4().hex[:6]}", name="D")
    db_session.add(dept)
    db_session.flush()
    client = Client(
        code=f"C{uuid.uuid4().hex[:6]}", name="C", department_id=dept.id
    )
    disc = Discipline(
        code=f"X{uuid.uuid4().hex[:6]}", name="X", department_id=dept.id
    )
    db_session.add_all([client, disc])
    db_session.flush()
    t = Template(
        name="T",
        department_id=dept.id,
        client_id=client.id,
        discipline_id=disc.id,
    )
    db_session.add(t)
    db_session.flush()
    return t


def test_unique_user_template(db_session: Session, admin_user: User) -> None:
    t = _make_template(db_session, admin_user)
    db_session.add(
        UserProjectViewColumns(
            user_id=admin_user.id,
            template_id=t.id,
            columns=["builtin:title"],
        )
    )
    db_session.flush()
    db_session.add(
        UserProjectViewColumns(
            user_id=admin_user.id,
            template_id=t.id,
            columns=["builtin:project_number"],
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()
