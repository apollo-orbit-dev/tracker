"""Unit tests for the create_cor_record service (Phase 17.13).

These tests call the service directly (bypassing HTTP) to verify:
- A successful call inserts a COR row and an audit row.
- A duplicate number on the same project raises CORNumberConflict, and
  the session remains usable after the rollback.

The conftest ``db_session`` fixture wraps every test in an outer
transaction that is rolled back at teardown, so nothing persists between
tests.
"""
from __future__ import annotations

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.models import (
    AuditLog,
    Client,
    COR,
    Department,
    Discipline,
    Project,
    Template,
    User,
)
from backend.app.services.cor_create import CORNumberConflict, create_cor_record


# ---------------------------------------------------------------------------
# Helpers / fixtures
# ---------------------------------------------------------------------------


def _make_project(db: Session, creator: User, number: str = "SVC-0001") -> Project:
    """Create the minimum taxonomy + template + project needed for COR tests.

    ``creator`` is used as ``created_by`` on the project row.
    """
    dept = Department(code=f"CS{number[-4:]}", name=f"COR Svc Dept {number}")
    db.add(dept)
    db.flush()

    cl = Client(code="CL1", name="Client One", department_id=dept.id)
    di = Discipline(code="DI1", name="Disc One", department_id=dept.id)
    db.add_all([cl, di])
    db.flush()

    t = Template(
        name="svc-tpl", department_id=dept.id, client_id=cl.id, discipline_id=di.id
    )
    db.add(t)
    db.flush()

    p = Project(
        project_number=number,
        title=f"Service Project {number}",
        template_id=t.id,
        created_by=creator.id,
    )
    db.add(p)
    db.flush()
    return p


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


def test_create_cor_record_inserts_cor_and_audit(
    db_session: Session, admin_user: User
):
    """Calling the service creates a COR row and an audit row."""
    project = _make_project(db_session, admin_user)

    cor = create_cor_record(
        db_session,
        admin_user,
        project,
        number="CO-001",
        description="Install thing",
        amount="1500.00",
        status="draft",
    )

    # Commit so the audit row is queryable in the same session.
    db_session.commit()

    # COR persisted
    fetched = db_session.get(COR, cor.id)
    assert fetched is not None
    assert fetched.number == "CO-001"
    assert fetched.description == "Install thing"
    assert fetched.status == "draft"
    assert fetched.project_id == project.id

    # Audit row created with the expected payload
    audit_rows = list(
        db_session.execute(
            select(AuditLog).where(
                AuditLog.entity_type == "cor",
                AuditLog.entity_id == cor.id,
                AuditLog.operation == "create",
            )
        ).scalars()
    )
    assert len(audit_rows) == 1
    row = audit_rows[0]
    assert row.project_id == project.id
    assert row.changes["initial"]["number"] == "CO-001"
    assert row.changes["initial"]["status"] == "draft"


def test_create_cor_record_duplicate_number_raises(
    db_session: Session, admin_user: User
):
    """Duplicate number on the same project raises CORNumberConflict."""
    project = _make_project(db_session, admin_user, "SVC-0002")

    # First insertion — succeeds
    create_cor_record(
        db_session,
        admin_user,
        project,
        number="CO-DUP",
        description="First",
        amount="100.00",
        status="draft",
    )
    db_session.commit()

    # Second insertion with same number — must raise
    with pytest.raises(CORNumberConflict):
        create_cor_record(
            db_session,
            admin_user,
            project,
            number="CO-DUP",
            description="Second",
            amount="200.00",
            status="draft",
        )

    # Session must be usable after rollback (service calls db.rollback())
    result = db_session.execute(
        select(COR).where(
            COR.project_id == project.id,
            COR.number == "CO-DUP",
            COR.deleted_at.is_(None),
        )
    ).scalars().all()
    assert len(result) == 1  # only the first one persisted


def test_create_cor_record_duplicate_cross_project_ok(
    db_session: Session, admin_user: User
):
    """Same number on a different project is allowed."""
    p1 = _make_project(db_session, admin_user, "SVC-0003")

    # Need a second project — reuse the same template
    p2 = Project(
        project_number="SVC-0004",
        title="Service Project 4",
        template_id=p1.template_id,
        created_by=admin_user.id,
    )
    db_session.add(p2)
    db_session.flush()

    create_cor_record(
        db_session,
        admin_user,
        p1,
        number="CO-CROSS",
        description="On project 1",
        amount="50.00",
        status="draft",
    )
    create_cor_record(
        db_session,
        admin_user,
        p2,
        number="CO-CROSS",
        description="On project 2",
        amount="50.00",
        status="draft",
    )
    db_session.commit()  # both must commit without error
