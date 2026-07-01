"""Tests for backend/app/services/form_values.py

TDD: written BEFORE implementation. Run first to confirm RED, then GREEN.
"""
import uuid
from decimal import Decimal

import pytest

from backend.app.services.form_values import (
    compute_proposed_changes,
    validate_submission_values,
)


# ---------------------------------------------------------------------------
# Helpers — build in-memory FormField-like objects without the DB
# ---------------------------------------------------------------------------

class _FF:
    """Minimal stand-in for a FormField row."""

    def __init__(
        self,
        field_type: str,
        *,
        label: str = "A field",
        required: bool = False,
        options: dict | None = None,
        target_key: str | None = None,
        deleted_at=None,
        id: uuid.UUID | None = None,
    ):
        self.id = id or uuid.uuid4()
        self.form_id = uuid.uuid4()
        self.label = label
        self.field_type = field_type
        self.required = required
        self.options = options
        self.target_key = target_key
        self.deleted_at = deleted_at


class _Form:
    """Minimal stand-in for a Form row."""

    def __init__(self, target_entity: str | None = None):
        self.id = uuid.uuid4()
        self.target_entity = target_entity


# ---------------------------------------------------------------------------
# validate_submission_values
# ---------------------------------------------------------------------------


def test_valid_values_pass():
    fid = uuid.uuid4()
    fields = [_FF("short_text", label="Name", required=True, id=fid)]
    validate_submission_values({str(fid): "Hello"}, fields)  # must not raise


def test_user_field_accepts_uuid():
    fid = uuid.uuid4()
    fields = [_FF("user", label="Assignee", required=True, id=fid)]
    validate_submission_values({str(fid): str(uuid.uuid4())}, fields)  # must not raise


def test_user_field_rejects_non_uuid():
    fid = uuid.uuid4()
    fields = [_FF("user", label="Assignee", required=True, id=fid)]
    with pytest.raises(Exception):
        validate_submission_values({str(fid): "not-a-uuid"}, fields)


def test_required_field_missing_raises():
    fid = uuid.uuid4()
    fields = [_FF("short_text", label="Name", required=True, id=fid)]
    with pytest.raises(ValueError, match="required"):
        validate_submission_values({}, fields)


def test_required_field_empty_string_raises():
    fid = uuid.uuid4()
    fields = [_FF("short_text", label="Name", required=True, id=fid)]
    with pytest.raises(ValueError, match="required"):
        validate_submission_values({str(fid): ""}, fields)


def test_unknown_key_raises():
    """Keys not matching any live field must be rejected (strict mode)."""
    fields = [_FF("short_text", label="Name")]
    with pytest.raises(ValueError, match="unknown"):
        validate_submission_values({"deadbeef-0000-0000-0000-000000000000": "x"}, fields)


def test_currency_non_numeric_raises():
    fid = uuid.uuid4()
    fields = [_FF("currency", label="Amount", id=fid)]
    with pytest.raises(ValueError, match="numeric"):
        validate_submission_values({str(fid): "not-a-number"}, fields)


def test_currency_numeric_string_passes():
    fid = uuid.uuid4()
    fields = [_FF("currency", label="Amount", id=fid)]
    validate_submission_values({str(fid): "1234.56"}, fields)


def test_currency_numeric_int_passes():
    fid = uuid.uuid4()
    fields = [_FF("currency", label="Amount", id=fid)]
    validate_submission_values({str(fid): 100}, fields)


def test_decimal_non_numeric_raises():
    fid = uuid.uuid4()
    fields = [_FF("decimal", label="Rate", id=fid)]
    with pytest.raises(ValueError, match="numeric"):
        validate_submission_values({str(fid): "abc"}, fields)


def test_integer_non_int_raises():
    fid = uuid.uuid4()
    fields = [_FF("integer", label="Count", id=fid)]
    with pytest.raises(ValueError, match="integer"):
        validate_submission_values({str(fid): "not-an-int"}, fields)


def test_integer_valid_int_passes():
    fid = uuid.uuid4()
    fields = [_FF("integer", label="Count", id=fid)]
    validate_submission_values({str(fid): "42"}, fields)


def test_integer_float_string_raises():
    fid = uuid.uuid4()
    fields = [_FF("integer", label="Count", id=fid)]
    with pytest.raises(ValueError, match="integer"):
        validate_submission_values({str(fid): "3.14"}, fields)


def test_date_bad_format_raises():
    fid = uuid.uuid4()
    fields = [_FF("date", label="Due date", id=fid)]
    with pytest.raises(ValueError, match="ISO date"):
        validate_submission_values({str(fid): "not-a-date"}, fields)


def test_date_valid_passes():
    fid = uuid.uuid4()
    fields = [_FF("date", label="Due date", id=fid)]
    validate_submission_values({str(fid): "2026-06-20"}, fields)


def test_single_select_invalid_choice_raises():
    fid = uuid.uuid4()
    fields = [_FF("single_select", label="Priority", options={"choices": ["low", "high"]}, id=fid)]
    with pytest.raises(ValueError, match="one of"):
        validate_submission_values({str(fid): "critical"}, fields)


def test_single_select_valid_choice_passes():
    fid = uuid.uuid4()
    fields = [_FF("single_select", label="Priority", options={"choices": ["low", "high"]}, id=fid)]
    validate_submission_values({str(fid): "low"}, fields)


def test_boolean_non_bool_raises():
    fid = uuid.uuid4()
    fields = [_FF("boolean", label="Active", id=fid)]
    with pytest.raises(ValueError, match="boolean"):
        validate_submission_values({str(fid): "yes"}, fields)


def test_boolean_valid_passes():
    fid = uuid.uuid4()
    fields = [_FF("boolean", label="Active", id=fid)]
    validate_submission_values({str(fid): True}, fields)


def test_short_text_too_long_raises():
    fid = uuid.uuid4()
    fields = [_FF("short_text", label="Title", id=fid)]
    with pytest.raises(ValueError, match="200"):
        validate_submission_values({str(fid): "x" * 201}, fields)


def test_long_text_too_long_raises():
    fid = uuid.uuid4()
    fields = [_FF("long_text", label="Body", id=fid)]
    with pytest.raises(ValueError, match="10000"):
        validate_submission_values({str(fid): "x" * 10_001}, fields)


def test_deleted_field_is_ignored():
    """A deleted field is ignored (not live) — its key is treated as unknown."""
    from datetime import datetime, timezone
    fid = uuid.uuid4()
    fields = [_FF("short_text", label="Gone", deleted_at=datetime.now(timezone.utc), id=fid)]
    with pytest.raises(ValueError, match="unknown"):
        validate_submission_values({str(fid): "hello"}, fields)


def test_optional_field_may_be_omitted():
    fid = uuid.uuid4()
    fields = [_FF("short_text", label="Optional", required=False, id=fid)]
    validate_submission_values({}, fields)  # no error


def test_none_value_for_optional_passes():
    fid = uuid.uuid4()
    fields = [_FF("short_text", label="Optional", required=False, id=fid)]
    validate_submission_values({str(fid): None}, fields)  # null = "no value"


def test_none_value_for_required_raises():
    fid = uuid.uuid4()
    fields = [_FF("short_text", label="Name", required=True, id=fid)]
    with pytest.raises(ValueError, match="required"):
        validate_submission_values({str(fid): None}, fields)


# ---------------------------------------------------------------------------
# compute_proposed_changes
# ---------------------------------------------------------------------------


def test_compute_proposed_changes_single_mapped_field():
    form = _Form(target_entity="cor")
    fid = uuid.uuid4()
    fields = [_FF("currency", label="COR Amount", target_key="amount", id=fid)]
    values = {str(fid): "500.00"}
    result = compute_proposed_changes(form, fields, values)
    assert len(result) == 1
    change = result[0]
    assert change["group"] == "Change order"
    assert change["target"] == "Amount"   # label from form_targets registry
    assert change["value"] == "$500.00"  # currency fields are formatted with $ prefix
    assert change["field_id"] == str(fid)


def test_compute_proposed_changes_skips_unmapped_fields():
    form = _Form(target_entity="cor")
    fid1 = uuid.uuid4()
    fid2 = uuid.uuid4()
    fields = [
        _FF("short_text", label="Notes (no target)", id=fid1),
        _FF("currency", label="Amount", target_key="amount", id=fid2),
    ]
    values = {str(fid1): "some notes", str(fid2): "999"}
    result = compute_proposed_changes(form, fields, values)
    assert len(result) == 1
    assert result[0]["target"] == "Amount"


def test_compute_proposed_changes_skips_empty_values():
    form = _Form(target_entity="cor")
    fid = uuid.uuid4()
    fields = [_FF("currency", label="Amount", target_key="amount", id=fid)]
    values = {str(fid): ""}
    result = compute_proposed_changes(form, fields, values)
    assert result == []


def test_compute_proposed_changes_skips_none_values():
    form = _Form(target_entity="cor")
    fid = uuid.uuid4()
    fields = [_FF("currency", label="Amount", target_key="amount", id=fid)]
    values = {str(fid): None}
    result = compute_proposed_changes(form, fields, values)
    assert result == []


def test_compute_proposed_changes_no_target_entity():
    form = _Form(target_entity=None)
    fid = uuid.uuid4()
    fields = [_FF("short_text", label="Notes", target_key=None, id=fid)]
    values = {str(fid): "hello"}
    result = compute_proposed_changes(form, fields, values)
    assert result == []


def test_compute_proposed_changes_multiple_fields():
    form = _Form(target_entity="cor")
    fid_amount = uuid.uuid4()
    fid_desc = uuid.uuid4()
    fields = [
        _FF("currency", label="Amount", target_key="amount", id=fid_amount),
        _FF("long_text", label="Description", target_key="description", id=fid_desc),
    ]
    values = {str(fid_amount): "1200.00", str(fid_desc): "Revised scope"}
    result = compute_proposed_changes(form, fields, values)
    assert len(result) == 2
    targets = {r["target"] for r in result}
    assert targets == {"Amount", "Description"}
    groups = {r["group"] for r in result}
    assert groups == {"Change order"}
