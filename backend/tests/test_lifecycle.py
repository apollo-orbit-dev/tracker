import pytest

from backend.app.services.lifecycle import (
    ALLOWED_TRANSITIONS,
    LifecycleError,
    assert_transition_allowed,
    check_active_readiness,
    valid_next_states,
)


def test_allowed_transitions_shape():
    # Sanity: terminal states have no outgoing transitions.
    assert ALLOWED_TRANSITIONS["complete"] == frozenset()
    assert ALLOWED_TRANSITIONS["cancelled"] == frozenset()


def test_draft_to_active_allowed():
    assert_transition_allowed("draft", "active")


def test_draft_to_complete_rejected():
    with pytest.raises(LifecycleError):
        assert_transition_allowed("draft", "complete")


def test_active_to_complete_allowed():
    assert_transition_allowed("active", "complete")


def test_complete_is_terminal():
    with pytest.raises(LifecycleError):
        assert_transition_allowed("complete", "active")


def test_cancelled_is_terminal():
    with pytest.raises(LifecycleError):
        assert_transition_allowed("cancelled", "active")


def test_unknown_state_rejected():
    with pytest.raises(LifecycleError):
        assert_transition_allowed("draft", "zombified")
    with pytest.raises(LifecycleError):
        assert_transition_allowed("unknown", "active")


def test_valid_next_states_for_each():
    assert valid_next_states("draft") == frozenset({"active", "cancelled"})
    assert valid_next_states("complete") == frozenset()


def test_check_active_readiness_pass():
    reasons = check_active_readiness(
        required_field_def_ids=[],
        custom_field_values={},
        milestone_planned_dates=[],
    )
    assert reasons == []


def test_check_active_readiness_required_missing():
    reasons = check_active_readiness(
        required_field_def_ids=["abc"],
        custom_field_values={},
        milestone_planned_dates=[],
    )
    assert len(reasons) == 1
    assert "abc" in reasons[0]


def test_check_active_readiness_required_empty_string():
    reasons = check_active_readiness(
        required_field_def_ids=["abc"],
        custom_field_values={"abc": ""},
        milestone_planned_dates=[],
    )
    assert len(reasons) == 1


def test_check_active_readiness_milestone_missing_date():
    reasons = check_active_readiness(
        required_field_def_ids=[],
        custom_field_values={},
        milestone_planned_dates=[None, "2026-05-19"],
    )
    assert len(reasons) == 1
    assert "#1" in reasons[0]


def test_check_active_readiness_required_satisfied():
    reasons = check_active_readiness(
        required_field_def_ids=["abc"],
        custom_field_values={"abc": "filled"},
        milestone_planned_dates=["2026-05-19"],
    )
    assert reasons == []
