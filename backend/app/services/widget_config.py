"""Per-widget config validation (Phase 2.2 + 2.5).

Each widget type has its own schema for what `config` may contain. This
module is the single point of validation; routes call `validate_config`
on every add / patch and surface failures as 422.

Phase 2.5 extends the four 2.0 widgets (lifecycle, milestone_lookahead,
cor_summary, recent_activity) with an optional `{department_id?,
client_id?, discipline_id?}` filter so a user can scope a widget to a
slice of their accessible data.

Unknown widget types raise — that's a programmer error, not user input.
"""
import uuid

from sqlalchemy.orm import Session

from backend.app.auth.scope import accessible_department_ids
from backend.app.db.models import (
    NUMERIC_FIELD_TYPES,
    Client,
    Department,
    Discipline,
    Template,
    TemplateFieldDef,
    User,
)


# Widget types whose config is the optional dept/client/discipline filter.
DCD_FILTER_WIDGET_TYPES: frozenset[str] = frozenset(
    {"lifecycle", "milestone_lookahead", "cor_summary", "recent_activity"}
)


class ConfigError(ValueError):
    """Raised by validators when the config payload is invalid for the
    widget type. The route catches and re-raises as HTTPException(422)."""

    def __init__(self, reasons: list[str]) -> None:
        self.reasons = reasons
        super().__init__("; ".join(reasons))


def _require_uuid(payload: dict, key: str, reasons: list[str]) -> uuid.UUID | None:
    raw = payload.get(key)
    if raw is None:
        reasons.append(f"{key} is required")
        return None
    try:
        return uuid.UUID(str(raw))
    except (ValueError, TypeError):
        reasons.append(f"{key} must be a UUID")
        return None


def _optional_uuid(
    payload: dict, key: str, reasons: list[str]
) -> uuid.UUID | None:
    """Return parsed UUID, or None if not provided. Records a reason
    if the key is present but malformed."""
    raw = payload.get(key)
    if raw is None:
        return None
    try:
        return uuid.UUID(str(raw))
    except (ValueError, TypeError):
        reasons.append(f"{key} must be a UUID")
        return None


def _validate_field_aggregate(db: Session, payload: dict) -> None:
    reasons: list[str] = []
    template_id = _require_uuid(payload, "template_id", reasons)
    primary_field_id = _require_uuid(payload, "primary_field_id", reasons)
    secondary_field_id = _optional_uuid(payload, "secondary_field_id", reasons)
    if reasons:
        raise ConfigError(reasons)

    template = db.get(Template, template_id)
    if template is None or template.deleted_at is not None:
        raise ConfigError(["template not found or deleted"])

    def _check_field(field_id: uuid.UUID, label: str) -> None:
        fd = db.get(TemplateFieldDef, field_id)
        if fd is None or fd.deleted_at is not None:
            reasons.append(f"{label} not found or deleted")
            return
        if fd.template_id != template_id:
            reasons.append(f"{label} does not belong to the chosen template")
            return
        if fd.field_type not in NUMERIC_FIELD_TYPES:
            reasons.append(
                f"{label} must be a numeric field (got {fd.field_type})"
            )

    _check_field(primary_field_id, "primary_field_id")
    if secondary_field_id is not None:
        _check_field(secondary_field_id, "secondary_field_id")
        if secondary_field_id == primary_field_id:
            reasons.append(
                "secondary_field_id must differ from primary_field_id"
            )

    if reasons:
        raise ConfigError(reasons)


def _validate_dcd_filter(
    db: Session, user: User, payload: dict
) -> None:
    """Validate the {department_id?, client_id?, discipline_id?} shape
    used by all four 2.0 widgets.

    Rules:
    - All three keys are optional. None / omitted means "no narrowing
      at that dimension".
    - If client_id is set, department_id must be set AND the client must
      belong to that dept.
    - If discipline_id is set, department_id must be set AND the
      discipline must belong to that dept.
    - All referenced rows must be live.
    - Caller must have viewer+ access to the chosen department (or be
      org admin).
    """
    # Reject unknown keys to catch typos / wrong-widget configs early.
    allowed = {"department_id", "client_id", "discipline_id"}
    extra = set(payload.keys()) - allowed
    if extra:
        raise ConfigError([f"unknown config key: {k}" for k in sorted(extra)])

    reasons: list[str] = []
    dept_id = _optional_uuid(payload, "department_id", reasons)
    client_id = _optional_uuid(payload, "client_id", reasons)
    discipline_id = _optional_uuid(payload, "discipline_id", reasons)
    if reasons:
        raise ConfigError(reasons)

    if client_id is not None and dept_id is None:
        reasons.append("client_id requires department_id")
    if discipline_id is not None and dept_id is None:
        reasons.append("discipline_id requires department_id")
    if reasons:
        raise ConfigError(reasons)

    if dept_id is not None:
        dept = db.get(Department, dept_id)
        if dept is None or dept.deleted_at is not None:
            raise ConfigError(["department not found or deleted"])
        allowed_depts = accessible_department_ids(user)
        if allowed_depts is not None and dept_id not in allowed_depts:
            raise ConfigError(["department not accessible"])

    if client_id is not None:
        cl = db.get(Client, client_id)
        if cl is None or cl.deleted_at is not None:
            reasons.append("client not found or deleted")
        elif cl.department_id != dept_id:
            reasons.append("client does not belong to the chosen department")

    if discipline_id is not None:
        di = db.get(Discipline, discipline_id)
        if di is None or di.deleted_at is not None:
            reasons.append("discipline not found or deleted")
        elif di.department_id != dept_id:
            reasons.append(
                "discipline does not belong to the chosen department"
            )

    if reasons:
        raise ConfigError(reasons)


def _validate_milestone_lookahead_config(
    db: Session, user: User, payload: dict
) -> None:
    """milestone_lookahead extends the DCD-filter shape with an optional
    `future_days` integer (1..365). Validates the DCD subset via the
    existing helper, then handles the lookahead-specific key."""
    reasons: list[str] = []
    payload_dcd = {
        k: v
        for k, v in payload.items()
        if k in {"department_id", "client_id", "discipline_id"}
    }
    extras = set(payload.keys()) - {
        "department_id",
        "client_id",
        "discipline_id",
        "future_days",
    }
    if extras:
        raise ConfigError(
            [f"unknown config key: {k}" for k in sorted(extras)]
        )

    if "future_days" in payload:
        v = payload["future_days"]
        # Pydantic-style "bools are ints" trap: explicitly reject.
        if isinstance(v, bool) or not isinstance(v, int):
            reasons.append("future_days must be an integer")
        elif v < 1 or v > 365:
            reasons.append("future_days must be between 1 and 365")
        if reasons:
            raise ConfigError(reasons)

    if payload_dcd:
        _validate_dcd_filter(db, user, payload_dcd)


def validate_config(
    db: Session,
    widget_type: str,
    payload: dict | None,
    *,
    user: User | None = None,
) -> None:
    """Validate `payload` for the given widget_type.

    - field_aggregate: payload optional; when provided it must specify
      template + numeric field ids.
    - lifecycle / milestone_lookahead / cor_summary / recent_activity:
      payload optional; when provided it's the dept/client/discipline
      filter (see `_validate_dcd_filter`). `user` is required for the
      dept-scope check on these types.

    Raises ConfigError on validation failure.
    """
    if widget_type == "field_aggregate":
        if payload is None:
            return
        if not isinstance(payload, dict):
            raise ConfigError(["config must be an object"])
        _validate_field_aggregate(db, payload)
        return

    if widget_type in DCD_FILTER_WIDGET_TYPES:
        if payload is None or payload == {}:
            # Unconfigured / "show all in my accessible depts".
            return
        if not isinstance(payload, dict):
            raise ConfigError(["config must be an object"])
        if user is None:
            # Programmer error — routes that handle these widgets must
            # pass user through. Surface loudly.
            raise RuntimeError(
                "validate_config requires user for DCD-filter widget types"
            )
        if widget_type == "milestone_lookahead":
            _validate_milestone_lookahead_config(db, user, payload)
        else:
            _validate_dcd_filter(db, user, payload)
        return

    # Unknown widget_type fall-through: defensive reject.
    if payload is not None and payload != {}:
        raise ConfigError(
            [f"{widget_type} does not accept a config in this phase"]
        )
