"""Project lifecycle state machine.

Direct PATCH on `lifecycle_state` is rejected; transitions go through
`POST /api/projects/{pid}/transition`. The transition handler calls
`validate_transition` here to bundle the state-machine check with the
required-field/milestone-date checks for `draft → active`.
"""
from collections.abc import Iterable

# Allowed transitions: from-state -> set of valid to-states.
ALLOWED_TRANSITIONS: dict[str, frozenset[str]] = {
    "draft": frozenset({"active", "cancelled"}),
    "active": frozenset({"on_hold", "complete", "cancelled"}),
    "on_hold": frozenset({"active", "complete", "cancelled"}),
    "complete": frozenset(),
    "cancelled": frozenset(),
}

VALID_STATES: frozenset[str] = frozenset(ALLOWED_TRANSITIONS.keys())


class LifecycleError(ValueError):
    """Raised by validate_transition; carries a list of human-readable reasons."""
    def __init__(self, reasons: list[str]):
        super().__init__("; ".join(reasons))
        self.reasons = reasons


def assert_transition_allowed(from_state: str, to_state: str) -> None:
    if from_state not in ALLOWED_TRANSITIONS:
        raise LifecycleError([f"unknown current state: {from_state}"])
    if to_state not in VALID_STATES:
        raise LifecycleError([f"unknown target state: {to_state}"])
    if to_state not in ALLOWED_TRANSITIONS[from_state]:
        raise LifecycleError(
            [f"cannot transition from {from_state} to {to_state}"]
        )


def valid_next_states(from_state: str) -> frozenset[str]:
    return ALLOWED_TRANSITIONS.get(from_state, frozenset())


def check_active_readiness(
    *,
    required_field_def_ids: Iterable[str],
    custom_field_values: dict,
    milestone_planned_dates: Iterable[object | None],
) -> list[str]:
    """Returns a list of reasons why the project isn't ready for `active`.
    Empty list = ready.
    """
    reasons: list[str] = []
    for fid in required_field_def_ids:
        val = custom_field_values.get(fid)
        if val is None or val == "" or val == []:
            reasons.append(f"required field {fid} is not set")
    for i, planned in enumerate(milestone_planned_dates):
        if planned is None:
            reasons.append(f"milestone #{i + 1} has no planned date")
    return reasons
