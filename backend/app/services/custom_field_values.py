"""Validate `custom_field_values` for a project against the field defs
on its template.

Per-type validators check value shape. Reference types
(user_picker_*, contact_picker, project_reference, client_reference)
accept UUID-shaped strings without enforcing existence — tighten in later
phases when those entities are stable.

Public entry point: `validate_values(values, field_defs)` raises
`ValidationError` with a list of per-key reasons on bad input.
"""
import re
import uuid
from datetime import date, datetime
from typing import Any

UUID_PATTERN = re.compile(
    r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
    re.IGNORECASE,
)
EMAIL_PATTERN = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
URL_PATTERN = re.compile(r"^https?://\S+$")


class ValidationError(ValueError):
    def __init__(self, reasons: list[str]):
        super().__init__("; ".join(reasons))
        self.reasons = reasons


def _is_str(v: Any) -> bool:
    return isinstance(v, str)


def _is_iso_date(v: Any) -> bool:
    if not isinstance(v, str):
        return False
    try:
        date.fromisoformat(v)
        return True
    except ValueError:
        return False


def _is_uuid_str(v: Any) -> bool:
    return isinstance(v, str) and bool(UUID_PATTERN.match(v))


def _validate_one(field_type: str, options: dict | None, value: Any) -> str | None:
    """Returns an error message, or None when the value is valid."""
    if value is None:
        return None  # null = no value; only required-field check rejects None

    if field_type in {"short_text", "long_text"}:
        if not _is_str(value):
            return "expected string"
        if field_type == "short_text" and len(value) > 200:
            return "max 200 characters"
        if field_type == "long_text" and len(value) > 10_000:
            return "max 10000 characters"
        return None
    if field_type == "url":
        if not _is_str(value):
            return "expected string"
        if not URL_PATTERN.match(value):
            return "must be an http(s) URL"
        return None
    if field_type == "email":
        if not _is_str(value):
            return "expected string"
        if not EMAIL_PATTERN.match(value):
            return "invalid email format"
        return None
    if field_type == "phone":
        if not _is_str(value):
            return "expected string"
        return None
    if field_type == "integer":
        if isinstance(value, bool) or not isinstance(value, int):
            return "expected integer"
        return None
    if field_type in {"decimal", "currency"}:
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return "expected number"
        return None
    if field_type == "percent":
        if isinstance(value, bool) or not isinstance(value, (int, float)):
            return "expected number"
        if value < 0 or value > 100:
            return "must be between 0 and 100"
        return None
    if field_type == "auto_number":
        # System-managed in a later phase; for now accept any int.
        if isinstance(value, bool) or not isinstance(value, int):
            return "expected integer"
        return None
    if field_type == "date":
        if not _is_iso_date(value):
            return "expected ISO date string"
        return None
    if field_type == "date_planned_actual":
        if not isinstance(value, dict):
            return "expected object {planned, actual?}"
        planned = value.get("planned")
        actual = value.get("actual")
        if planned is not None and not _is_iso_date(planned):
            return "planned must be ISO date or null"
        if actual is not None and not _is_iso_date(actual):
            return "actual must be ISO date or null"
        return None
    if field_type == "date_range":
        if not isinstance(value, dict):
            return "expected object {start, end}"
        start = value.get("start")
        end = value.get("end")
        if start is not None and not _is_iso_date(start):
            return "start must be ISO date or null"
        if end is not None and not _is_iso_date(end):
            return "end must be ISO date or null"
        return None
    if field_type == "duration":
        if isinstance(value, bool) or not isinstance(value, int):
            return "expected integer (days)"
        if value < 0:
            return "must be non-negative"
        return None
    if field_type == "single_select":
        choices = (options or {}).get("choices") or []
        if not _is_str(value):
            return "expected string"
        if value not in choices:
            return f"value must be one of {choices}"
        return None
    if field_type == "multi_select":
        choices = (options or {}).get("choices") or []
        if not isinstance(value, list):
            return "expected list of strings"
        if not all(_is_str(v) for v in value):
            return "all elements must be strings"
        bad = [v for v in value if v not in choices]
        if bad:
            return f"unknown choices: {bad}"
        return None
    if field_type == "boolean":
        if not isinstance(value, bool):
            return "expected boolean"
        return None
    if field_type == "boolean_conditional_date":
        if not isinstance(value, dict):
            return "expected object {value, date?}"
        v = value.get("value")
        if not isinstance(v, bool):
            return "value must be boolean"
        d = value.get("date")
        if v and d is None:
            return "date required when value is true"
        if d is not None and not _is_iso_date(d):
            return "date must be ISO date or null"
        return None
    if field_type == "boolean_conditional_text":
        if not isinstance(value, dict):
            return "expected object {value, text?}"
        v = value.get("value")
        if not isinstance(v, bool):
            return "value must be boolean"
        t = value.get("text")
        if v and (t is None or t == ""):
            return "text required when value is true"
        if t is not None and not _is_str(t):
            return "text must be string or null"
        return None
    if field_type in {"user_picker_single", "contact_picker", "project_reference", "client_reference"}:
        if not _is_uuid_str(value):
            return "expected UUID string"
        return None
    if field_type == "user_picker_multi":
        if not isinstance(value, list):
            return "expected list of UUID strings"
        if not all(_is_uuid_str(v) for v in value):
            return "all elements must be UUID strings"
        return None
    return f"unknown field type: {field_type}"


def validate_values(values: dict, field_defs: list) -> None:
    """Validate the dict against the supplied list of TemplateFieldDef rows.

    Raises ValidationError with a list of reasons on any failure.
    """
    if not isinstance(values, dict):
        raise ValidationError(["custom_field_values must be an object"])

    by_id = {str(fd.id): fd for fd in field_defs if fd.deleted_at is None}
    reasons: list[str] = []

    for key, value in values.items():
        fd = by_id.get(key)
        if fd is None:
            reasons.append(f"unknown field {key}")
            continue
        err = _validate_one(fd.field_type, fd.options, value)
        if err is not None:
            reasons.append(f"{fd.name} ({key}): {err}")

    if reasons:
        raise ValidationError(reasons)


def merge_values(stored: dict, incoming: dict) -> dict:
    """PATCH semantics: overlay `incoming` onto `stored` key-by-key.
    Sending `None` for a key removes that key from the result.
    """
    out = dict(stored)
    for k, v in incoming.items():
        if v is None:
            out.pop(k, None)
        else:
            out[k] = v
    return out
