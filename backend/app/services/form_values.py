"""Validate a form submission's values against the form's live FormField rows,
and compute the "proposed changes" preview for bound (target_key) fields.

Design decisions:
- Unknown keys (not matching any live field) are REJECTED (strict mode).
  Rationale: silently ignoring phantom keys can mask client bugs and data loss.
- Deleted fields (deleted_at is not None) are treated as non-existent; any key
  referencing them is also rejected as unknown.
- For integer fields, the value may be an int literal OR a string that parses
  cleanly as an integer (no decimal point). Booleans are never accepted as
  integers (bool is a subtype of int in Python — explicitly excluded).
- For decimal/currency fields, the value may be a numeric literal OR a string
  that Decimal() can parse. Booleans excluded.
- Empty string for a required field counts as "missing" (same as omitted).
- None (null) for an optional field is accepted (means "no value").
- None (null) for a required field raises.
- short_text max 200 chars; long_text max 10 000 chars.
"""

from __future__ import annotations

from datetime import date as _date
from decimal import Decimal, InvalidOperation
from typing import Any

from backend.app.services.form_targets import target_descriptor, target_field

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _is_iso_date(v: Any) -> bool:
    if not isinstance(v, str):
        return False
    try:
        _date.fromisoformat(v)
        return True
    except ValueError:
        return False


def _is_empty(v: Any) -> bool:
    """True when a value should be treated as "not provided"."""
    return v is None or v == ""


def _validate_one(field_type: str, options: dict | None, value: Any) -> str | None:
    """Return an error message string, or None when the value is valid.

    value=None is accepted here for optional-field callers; the required check
    happens before this function is called.
    """
    if value is None:
        return None  # optional null — caller guards required

    if field_type == "short_text":
        if not isinstance(value, str):
            return "expected string"
        if len(value) > 200:
            return "max 200 characters"
        return None

    if field_type == "long_text":
        if not isinstance(value, str):
            return "expected string"
        if len(value) > 10_000:
            return "max 10000 characters"
        return None

    if field_type == "integer":
        # Accept int literal (not bool) or a string parseable as whole integer.
        if isinstance(value, bool):
            return "expected integer, not boolean"
        if isinstance(value, int):
            return None
        if isinstance(value, str):
            try:
                int(value)  # raises if decimal point, letters, etc.
                # Reject float strings like "3.14"
                if "." in value:
                    return "expected integer (no decimal point)"
                return None
            except ValueError:
                return "expected integer"
        return "expected integer"

    if field_type in {"decimal", "currency"}:
        if isinstance(value, bool):
            return "not a numeric value"
        if isinstance(value, (int, float)):
            return None
        if isinstance(value, str):
            try:
                Decimal(value)
                return None
            except InvalidOperation:
                return "not a numeric value"
        return "not a numeric value"

    if field_type == "date":
        if not _is_iso_date(value):
            return "expected ISO date string (YYYY-MM-DD)"
        return None

    if field_type == "single_select":
        choices = (options or {}).get("choices") or []
        if not isinstance(value, str):
            return "expected string"
        if value not in choices:
            return f"value must be one of {choices}"
        return None

    if field_type == "boolean":
        if not isinstance(value, bool):
            return "expected boolean (true/false)"
        return None

    return f"unknown field type: {field_type}"


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------


class SubmissionValidationError(ValueError):
    """Raised when one or more fields fail validation.

    ``reasons`` is a list of human-readable per-field messages.
    """

    def __init__(self, reasons: list[str]) -> None:
        super().__init__("; ".join(reasons))
        self.reasons = reasons


def validate_submission_values(values: dict, fields: list) -> None:
    """Validate *values* against *fields* (list of live FormField rows).

    Raises :class:`SubmissionValidationError` (a subclass of ValueError) with
    a list of per-field reasons on any failure.

    Rules:
    - Keys that don't correspond to a live (non-deleted) field → rejected.
    - Required fields missing from *values* or present but empty → rejected.
    - Each present, non-None value is checked against the field's type rules.
    """
    if not isinstance(values, dict):
        raise SubmissionValidationError(["values must be an object"])

    # Build index of live fields only (deleted fields are excluded).
    by_id: dict[str, Any] = {
        str(f.id): f for f in fields if f.deleted_at is None
    }

    reasons: list[str] = []

    # --- Check for unknown keys ---
    for key in values:
        if key not in by_id:
            reasons.append(f"unknown field key: {key}")

    # --- Check required + per-type validation ---
    for field_id_str, field in by_id.items():
        raw = values.get(field_id_str)
        is_missing = field_id_str not in values or _is_empty(raw)

        if field.required and is_missing:
            reasons.append(f"{field.label!r} is required")
            continue

        if not is_missing:
            err = _validate_one(field.field_type, field.options, raw)
            if err is not None:
                reasons.append(f"{field.label!r} ({field_id_str}): {err}")

    if reasons:
        raise SubmissionValidationError(reasons)


def _format_value(field_type: str, value: Any) -> str:
    """Format a submission value as a human-readable display string."""
    if field_type in {"currency", "decimal"}:
        try:
            d = Decimal(str(value))
            if field_type == "currency":
                return f"${d:,.2f}"
            return str(d)
        except InvalidOperation:
            return str(value)
    return str(value)


def compute_proposed_changes(form: Any, fields: list, values: dict) -> list[dict]:
    """Build the "proposed changes" preview for a submission.

    For each live field that has a ``target_key`` set, look up the target field
    descriptor from the form_targets registry, format the submitted value, and
    return a list of dicts shaped like::

        {
            "group":    "Change order",   # target entity label
            "target":   "Amount",         # target field label from registry
            "value":    "$500.00",        # formatted display value
            "field_id": "<uuid-str>",     # the FormField id
        }

    Empty/None values and fields without a target_key are skipped.
    """
    if not form.target_entity:
        return []

    descriptor = target_descriptor(form.target_entity)
    if descriptor is None:
        return []

    group_label: str = descriptor["label"]
    live_fields = [f for f in fields if f.deleted_at is None]

    result: list[dict] = []
    for field in live_fields:
        if not field.target_key:
            continue
        raw = values.get(str(field.id))
        if _is_empty(raw):
            continue
        tf = target_field(form.target_entity, field.target_key)
        if tf is None:
            continue
        result.append(
            {
                "group": group_label,
                "target": tf["label"],
                "value": _format_value(field.field_type, raw),
                "field_id": str(field.id),
            }
        )

    return result
