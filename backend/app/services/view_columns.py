"""Column-key validation + orphan-stripping for the viewing list.

The registry of valid column keys depends on a live template (custom
fields and milestones can be soft-deleted), so DB-level enforcement
isn't practical. This module owns the regex + validation + cleanup.
"""
import re
import uuid

BUILTIN_COLUMN_KEYS: frozenset[str] = frozenset(
    {
        "builtin:project_number",
        "builtin:client_number",
        "builtin:title",
        "builtin:lifecycle",
        "builtin:created_at",
        "builtin:updated_at",
    }
)

# All built-ins are sortable in this phase.
SORTABLE_BUILTIN_KEYS: frozenset[str] = BUILTIN_COLUMN_KEYS

_UUID_RE = (
    r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
)
_COLUMN_KEY_RE = re.compile(
    rf"^(?:"
    rf"builtin:(?P<builtin>[a-z_]+)"
    rf"|custom_field:(?P<custom_field>{_UUID_RE})"
    rf"|milestone:(?P<milestone>{_UUID_RE}):(?P<mode>date|planned|actual)"
    rf")$"
)

MAX_COLUMNS = 60


class ValidationError(Exception):
    """Raised when column-key validation fails. `reasons` is a list of
    strings for the API to surface verbatim in the 422 body."""

    def __init__(self, reasons: list[str]) -> None:
        self.reasons = reasons
        super().__init__("; ".join(reasons))


def parse_column_key(key: str) -> tuple[str, str, str | None] | None:
    """Parse a column key into (category, id_or_name, sub_mode).

    - "builtin:title" -> ("builtin", "title", None) iff in BUILTIN_COLUMN_KEYS
    - "custom_field:<uuid>" -> ("custom_field", "<uuid>", None)
    - "milestone:<uuid>:date|planned|actual" -> ("milestone", "<uuid>", mode)

    Returns None if the key is malformed or refers to an unknown built-in.
    """
    m = _COLUMN_KEY_RE.match(key)
    if m is None:
        return None
    if m.group("builtin") is not None:
        if key not in BUILTIN_COLUMN_KEYS:
            return None
        return ("builtin", m.group("builtin"), None)
    if m.group("custom_field") is not None:
        return ("custom_field", m.group("custom_field"), None)
    return ("milestone", m.group("milestone"), m.group("mode"))


def validate_columns(
    columns: list[str],
    *,
    live_custom_field_ids: set[uuid.UUID],
    live_milestone_def_ids: set[uuid.UUID],
) -> None:
    """Raise ValidationError if any column key is malformed, duplicate,
    or refers to an entity not present in this template.
    """
    reasons: list[str] = []
    if len(columns) > MAX_COLUMNS:
        reasons.append(f"too many columns (max {MAX_COLUMNS})")
    seen: set[str] = set()
    for key in columns:
        if key in seen:
            reasons.append(f"duplicate column key: {key}")
            continue
        seen.add(key)
        parsed = parse_column_key(key)
        if parsed is None:
            reasons.append(f"invalid column key: {key}")
            continue
        category, ident, _mode = parsed
        if category == "custom_field":
            if uuid.UUID(ident) not in live_custom_field_ids:
                reasons.append(f"custom field not in this template: {key}")
        elif category == "milestone":
            if uuid.UUID(ident) not in live_milestone_def_ids:
                reasons.append(f"milestone not in this template: {key}")
    if reasons:
        raise ValidationError(reasons)


def validate_sort(
    sort_key: str | None,
    sort_direction: str | None,
    *,
    live_custom_field_ids: set[uuid.UUID] = frozenset(),
) -> None:
    """Raise ValidationError if the sort selection is malformed.

    sort_key may be a built-in column, a `custom_field:<uuid>` key for a
    live custom field of the template (Phase 23.4), or null. sort_direction
    must be 'asc' or 'desc' iff sort_key is set, and null iff it's null.
    """
    paired = (sort_key is None) == (sort_direction is None)
    if not paired:
        raise ValidationError(
            ["sort_key and sort_direction must be paired (both or neither)"]
        )
    if sort_key is None:
        return
    if sort_key not in SORTABLE_BUILTIN_KEYS:
        parsed = parse_column_key(sort_key)
        if parsed is None or parsed[0] != "custom_field":
            raise ValidationError(
                [f"sort_key must be a built-in or custom_field column: {sort_key}"]
            )
        if uuid.UUID(parsed[1]) not in live_custom_field_ids:
            raise ValidationError(
                [f"sort_key custom field not in this template: {sort_key}"]
            )
    if sort_direction not in ("asc", "desc"):
        raise ValidationError(
            [f"sort_direction must be 'asc' or 'desc', got: {sort_direction}"]
        )


def strip_orphans(
    columns: list[str],
    *,
    live_custom_field_ids: set[uuid.UUID],
    live_milestone_def_ids: set[uuid.UUID],
) -> list[str]:
    """Return a copy of `columns` with orphaned keys silently dropped.

    A key is orphaned if (a) it's malformed, or (b) it refers to a
    custom field / milestone def that's no longer live in the template.
    Built-in keys are never orphans (the built-in registry is constant).
    Preserves the original order of the surviving keys.
    """
    out: list[str] = []
    for key in columns:
        parsed = parse_column_key(key)
        if parsed is None:
            continue
        category, ident, _mode = parsed
        if category == "custom_field":
            if uuid.UUID(ident) not in live_custom_field_ids:
                continue
        elif category == "milestone":
            if uuid.UUID(ident) not in live_milestone_def_ids:
                continue
        out.append(key)
    return out
