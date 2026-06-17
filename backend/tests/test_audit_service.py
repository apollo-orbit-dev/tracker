"""Phase 3.1 — unit tests for `backend.app.services.audit`.

Covers:
- `record_audit` writes a row visible inside the current transaction
  but does NOT commit; the caller's existing commit publishes the row.
- `record_audit` fails fast (not at flush time) on a non-JSON-
  serializable `changes` payload.
- `diff(before, after, fields=...)` emits only changed keys; ignores
  fields not in the allowlist; handles None and missing-key cases.
"""
import uuid
from datetime import datetime, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.db.models import AuditLog, User
from backend.app.services.audit import diff, record_audit


def _make_user(db: Session, email: str) -> User:
    u = User(email=email, display_name=email.split("@")[0])
    db.add(u)
    db.flush()
    return u


# ---- record_audit -------------------------------------------------------


def test_record_audit_writes_row_in_current_transaction(
    db_session: Session,
):
    actor = _make_user(db_session, "rwa@example.com")
    entity_id = uuid.uuid4()
    record_audit(
        db_session,
        user=actor,
        entity_type="project",
        entity_id=entity_id,
        operation="create",
        changes={"initial": {"title": "Demo"}},
    )
    # No commit — but the row should be visible via the transaction's flush.
    db_session.flush()
    row = db_session.execute(
        select(AuditLog).where(AuditLog.entity_id == entity_id)
    ).scalar_one()
    assert row.entity_type == "project"
    assert row.operation == "create"
    assert row.changes == {"initial": {"title": "Demo"}}
    assert row.changed_by == actor.id
    assert row.project_id is None


def test_record_audit_does_not_commit(db_session: Session):
    """The helper queues the row but doesn't commit; until a flush
    happens explicitly, the row is only in the session's `new` set."""
    actor = _make_user(db_session, "ndc@example.com")
    entity_id = uuid.uuid4()
    record_audit(
        db_session,
        user=actor,
        entity_type="project",
        entity_id=entity_id,
        operation="delete",
        changes={},
    )
    pending = [
        obj for obj in db_session.new if isinstance(obj, AuditLog)
    ]
    assert any(obj.entity_id == entity_id for obj in pending)


def test_record_audit_with_project_id(db_session: Session):
    actor = _make_user(db_session, "rpid@example.com")
    entity_id = uuid.uuid4()
    project_id = uuid.uuid4()
    record_audit(
        db_session,
        user=actor,
        entity_type="milestone",
        entity_id=entity_id,
        operation="update",
        changes={"planned_date": [None, "2026-09-01"]},
        project_id=project_id,
    )
    db_session.flush()
    row = db_session.execute(
        select(AuditLog).where(AuditLog.entity_id == entity_id)
    ).scalar_one()
    assert row.project_id == project_id


def test_record_audit_accepts_date_and_datetime(db_session: Session):
    """`date` and `datetime` are accepted and stringified to ISO format."""
    actor = _make_user(db_session, "dts@example.com")
    entity_id = uuid.uuid4()
    record_audit(
        db_session,
        user=actor,
        entity_type="milestone",
        entity_id=entity_id,
        operation="update",
        changes={
            "planned_date": [None, "2026-09-01"],
            "started_at": [None, datetime(2026, 6, 8, 12, tzinfo=timezone.utc)],
        },
    )
    db_session.flush()
    row = db_session.execute(
        select(AuditLog).where(AuditLog.entity_id == entity_id)
    ).scalar_one()
    assert row.changes["started_at"][1].startswith("2026-06-08T12:00")


def test_record_audit_rejects_unknown_python_type(
    db_session: Session,
):
    """A genuinely non-JSON-native value (e.g., a `set` or a custom object)
    must raise from `record_audit` rather than silently writing garbage."""
    actor = _make_user(db_session, "ns@example.com")
    with pytest.raises((TypeError, ValueError)):
        record_audit(
            db_session,
            user=actor,
            entity_type="project",
            entity_id=uuid.uuid4(),
            operation="update",
            changes={"tags": [{"a", "b"}, {"c"}]},
        )


# ---- diff --------------------------------------------------------------


def test_diff_emits_only_changed_keys():
    out = diff(
        {"a": 1, "b": 2, "c": 3},
        {"a": 1, "b": 20, "c": 3},
        fields=["a", "b", "c"],
    )
    assert out == {"b": [2, 20]}


def test_diff_ignores_fields_not_in_allowlist():
    out = diff(
        {"a": 1, "b": 2},
        {"a": 999, "b": 999},
        fields=["a"],
    )
    assert out == {"a": [1, 999]}


def test_diff_handles_missing_keys_as_none():
    out = diff(
        {"a": 1},
        {"a": 1, "b": 2},
        fields=["a", "b"],
    )
    assert out == {"b": [None, 2]}


def test_diff_equal_none_values_omitted():
    out = diff(
        {"a": None, "b": "x"},
        {"a": None, "b": "x"},
        fields=["a", "b"],
    )
    assert out == {}


def test_diff_none_to_value_emitted():
    out = diff({"a": None}, {"a": "x"}, fields=["a"])
    assert out == {"a": [None, "x"]}


def test_diff_value_to_none_emitted():
    out = diff({"a": "x"}, {"a": None}, fields=["a"])
    assert out == {"a": ["x", None]}


def test_diff_empty_fields_yields_empty():
    out = diff({"a": 1}, {"a": 2}, fields=[])
    assert out == {}
