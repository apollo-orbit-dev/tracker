"""Audit log capture helpers (Phase 3.1).

The route handler is responsible for:
- snapshotting `before` state (a dict of the affected fields) prior to
  any mutation,
- applying the mutation,
- calling `record_audit(...)` with the operation-specific `changes`
  payload (typically built via `diff()` for the standard PATCH path),
- the existing `db.commit()` — `record_audit` does NOT commit, so the
  audit row publishes in the same transaction as the user's change.

This keeps the audit row + the user mutation atomic: either both land
or both roll back. The contract is "if you see the change in the DB,
you'll see the audit row." A buggy audit call therefore breaks user
writes — the JSON-serializability check in `record_audit` is the early
warning for that.
"""
import json
import uuid
from collections.abc import Iterable
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from backend.app.db.models import AuditLog, User


def _json_default(value: Any) -> Any:
    """Coerce known-sensible-but-not-JSON-native types to strings.

    Accepts `date`, `datetime`, and `Decimal` — the types that legitimately
    appear in audited fields (milestone dates, COR amounts, etc.). Anything
    else raises TypeError so we catch genuine schema mistakes early
    rather than silently writing garbage.
    """
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    raise TypeError(f"unsupported audit-payload type: {type(value).__name__}")


def record_audit(
    db: Session,
    *,
    user: User,
    entity_type: str,
    entity_id: uuid.UUID,
    operation: str,
    changes: dict[str, Any],
    project_id: uuid.UUID | None = None,
) -> None:
    """Insert an `audit_log` row in the current transaction.

    Does not commit — relies on the caller's existing `db.commit()` to
    publish the row alongside the mutation that produced it.

    Fails fast (TypeError / ValueError from `json.dumps`) on a payload
    that won't serialize. This is intentional: integration tests catch
    shape mismatches before merge rather than at flush time.
    """
    # Stringify date/datetime/Decimal at the boundary so the JSONB column
    # receives a strictly-JSON dict. Raises TypeError on any other
    # non-JSON-native value — that's the fail-fast guard for schema bugs.
    serializable = json.loads(json.dumps(changes, default=_json_default))
    db.add(
        AuditLog(
            entity_type=entity_type,
            entity_id=entity_id,
            project_id=project_id,
            operation=operation,
            changes=serializable,
            changed_by=user.id,
        )
    )


def diff(
    before: dict[str, Any],
    after: dict[str, Any],
    *,
    fields: Iterable[str],
) -> dict[str, list]:
    """Compare two dicts on the named fields; return `{field: [old, new]}`
    only for keys whose values differ.

    Fields not in `fields` are ignored entirely. Keys missing from one
    side are treated as `None` on that side. Equal values (including
    None == None) are omitted from the result.

    Used by the standard PATCH audit path — handlers build a `before`
    snapshot of the patched fields, mutate, then call this helper to
    produce the `changes` payload.
    """
    out: dict[str, list] = {}
    for f in fields:
        b = before.get(f)
        a = after.get(f)
        if b != a:
            out[f] = [b, a]
    return out
