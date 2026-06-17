"""Phase 3.1 — constraint and FK behavior tests for `audit_log`.

Invariants:
- `entity_type` CHECK rejects unknown values.
- `operation` CHECK rejects unknown values.
- `changed_by` FK with `ON DELETE SET NULL`: deleting the user nulls the
  column rather than cascading the audit row.
- `changes` JSONB round-trips a representative payload (string, number,
  null, nested dict, list of pairs).
"""
import uuid

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.db.models import AuditLog, User


def _make_user(db: Session, email: str) -> User:
    u = User(email=email, display_name=email.split("@")[0])
    db.add(u)
    db.flush()
    return u


def test_entity_type_check_rejects_unknown(db_session: Session):
    actor = _make_user(db_session, "etcheck@example.com")
    db_session.add(
        AuditLog(
            entity_type="bogus",
            entity_id=uuid.uuid4(),
            operation="create",
            changes={},
            changed_by=actor.id,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_operation_check_rejects_unknown(db_session: Session):
    actor = _make_user(db_session, "opcheck@example.com")
    db_session.add(
        AuditLog(
            entity_type="project",
            entity_id=uuid.uuid4(),
            operation="bogus",
            changes={},
            changed_by=actor.id,
        )
    )
    with pytest.raises(IntegrityError):
        db_session.flush()


def test_each_valid_entity_type_accepted(db_session: Session):
    actor = _make_user(db_session, "etok@example.com")
    for entity_type in (
        "project",
        "milestone",
        "cor",
        "note",
        "user_role",
        "project_role_assignment",
    ):
        db_session.add(
            AuditLog(
                entity_type=entity_type,
                entity_id=uuid.uuid4(),
                operation="create",
                changes={},
                changed_by=actor.id,
            )
        )
        db_session.flush()


def test_each_valid_operation_accepted(db_session: Session):
    actor = _make_user(db_session, "opok@example.com")
    for op_name in ("create", "update", "delete", "transition", "grant", "revoke"):
        db_session.add(
            AuditLog(
                entity_type="project",
                entity_id=uuid.uuid4(),
                operation=op_name,
                changes={},
                changed_by=actor.id,
            )
        )
        db_session.flush()


def test_changed_by_set_null_on_user_delete(db_session: Session):
    """Deleting the actor preserves the audit row but nulls the FK."""
    actor = _make_user(db_session, "deluser@example.com")
    entity_id = uuid.uuid4()
    db_session.add(
        AuditLog(
            entity_type="project",
            entity_id=entity_id,
            operation="create",
            changes={"initial": {"title": "X"}},
            changed_by=actor.id,
        )
    )
    db_session.flush()
    db_session.delete(actor)
    db_session.flush()
    row = db_session.execute(
        select(AuditLog).where(AuditLog.entity_id == entity_id)
    ).scalar_one()
    assert row.changed_by is None


def test_changes_jsonb_roundtrip(db_session: Session):
    """Sanity check that a representative JSONB shape survives."""
    actor = _make_user(db_session, "jsonb@example.com")
    entity_id = uuid.uuid4()
    payload = {
        "title": ["Old", "New"],
        "lifecycle_state": ["draft", "active"],
        "custom_field_values": {
            "11111111-1111-1111-1111-111111111111": [None, "2026-09-01"],
            "22222222-2222-2222-2222-222222222222": ["500000", "650000"],
        },
        "note": None,
        "tags": ["a", "b"],
    }
    db_session.add(
        AuditLog(
            entity_type="project",
            entity_id=entity_id,
            operation="update",
            changes=payload,
            changed_by=actor.id,
        )
    )
    db_session.flush()
    row = db_session.execute(
        select(AuditLog).where(AuditLog.entity_id == entity_id)
    ).scalar_one()
    assert row.changes == payload


def test_project_id_nullable(db_session: Session):
    actor = _make_user(db_session, "pidnull@example.com")
    db_session.add(
        AuditLog(
            entity_type="user_role",
            entity_id=uuid.uuid4(),
            operation="grant",
            changes={"role_id": "admin", "department_id": None},
            changed_by=actor.id,
            project_id=None,
        )
    )
    db_session.flush()
