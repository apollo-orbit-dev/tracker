"""Per-type validation matrix for custom_field_values."""
import uuid
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from backend.app.services.custom_field_values import (
    ValidationError,
    merge_values,
    validate_values,
)


def fd(field_type: str, *, options=None, fid=None, name="x", required=False):
    """Shape that matches what validate_values reads from TemplateFieldDef."""
    return SimpleNamespace(
        id=uuid.UUID(fid) if fid else uuid.uuid4(),
        field_type=field_type,
        options=options,
        name=name,
        required=required,
        deleted_at=None,
    )


def test_unknown_key_rejected():
    f = fd("short_text")
    with pytest.raises(ValidationError):
        validate_values({"not-a-known-id": "x"}, [f])


def test_short_text_max_length():
    f = fd("short_text")
    validate_values({str(f.id): "ok"}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): "x" * 201}, [f])


def test_long_text():
    f = fd("long_text")
    validate_values({str(f.id): "x" * 9000}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): "x" * 10_001}, [f])


def test_url_must_be_http_or_https():
    f = fd("url")
    validate_values({str(f.id): "https://example.com"}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): "ftp://example.com"}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): "not a url"}, [f])


def test_email_pattern():
    f = fd("email")
    validate_values({str(f.id): "a@b.co"}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): "not-an-email"}, [f])


def test_integer_rejects_string_and_bool():
    f = fd("integer")
    validate_values({str(f.id): 42}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): "42"}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): True}, [f])


def test_decimal_accepts_float_and_int():
    f = fd("decimal")
    validate_values({str(f.id): 1.5}, [f])
    validate_values({str(f.id): 1}, [f])


def test_percent_range():
    f = fd("percent")
    validate_values({str(f.id): 0}, [f])
    validate_values({str(f.id): 100}, [f])
    validate_values({str(f.id): 42.5}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): -1}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): 101}, [f])


def test_date_iso():
    f = fd("date")
    validate_values({str(f.id): "2026-05-19"}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): "05/19/2026"}, [f])


def test_date_planned_actual_shape():
    f = fd("date_planned_actual")
    validate_values(
        {str(f.id): {"planned": "2026-05-19", "actual": None}}, [f]
    )
    validate_values(
        {str(f.id): {"planned": "2026-05-19", "actual": "2026-05-20"}}, [f]
    )
    with pytest.raises(ValidationError):
        validate_values({str(f.id): "2026-05-19"}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): {"planned": "garbage"}}, [f])


def test_single_select_choices():
    f = fd("single_select", options={"choices": ["a", "b", "c"]})
    validate_values({str(f.id): "a"}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): "z"}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): ["a"]}, [f])


def test_multi_select_choices():
    f = fd("multi_select", options={"choices": ["a", "b", "c"]})
    validate_values({str(f.id): ["a", "c"]}, [f])
    validate_values({str(f.id): []}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): ["a", "z"]}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): "a"}, [f])


def test_boolean():
    f = fd("boolean")
    validate_values({str(f.id): True}, [f])
    validate_values({str(f.id): False}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): "true"}, [f])


def test_boolean_conditional_date():
    f = fd("boolean_conditional_date")
    validate_values({str(f.id): {"value": False}}, [f])
    validate_values(
        {str(f.id): {"value": True, "date": "2026-05-19"}}, [f]
    )
    # True without date → error
    with pytest.raises(ValidationError):
        validate_values({str(f.id): {"value": True}}, [f])


def test_boolean_conditional_text():
    f = fd("boolean_conditional_text")
    validate_values({str(f.id): {"value": False}}, [f])
    validate_values({str(f.id): {"value": True, "text": "reason"}}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): {"value": True}}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): {"value": True, "text": ""}}, [f])


def test_user_picker_single_uuid():
    f = fd("user_picker_single")
    validate_values({str(f.id): str(uuid.uuid4())}, [f])
    with pytest.raises(ValidationError):
        validate_values({str(f.id): "not-uuid"}, [f])


def test_user_picker_multi():
    f = fd("user_picker_multi")
    validate_values(
        {str(f.id): [str(uuid.uuid4()), str(uuid.uuid4())]}, [f]
    )
    with pytest.raises(ValidationError):
        validate_values({str(f.id): [str(uuid.uuid4()), "x"]}, [f])


def test_null_value_accepted_at_schema_layer():
    """A null value bypasses type validation — required-field enforcement
    is the job of the lifecycle transition, not this validator."""
    f = fd("short_text", required=True)
    validate_values({str(f.id): None}, [f])


def test_validates_against_deleted_field_def_rejected():
    f = fd("short_text")
    f.deleted_at = datetime.now(timezone.utc)
    with pytest.raises(ValidationError):
        validate_values({str(f.id): "x"}, [f])


# ---- merge_values --------------------------------------------------------


def test_merge_overlays():
    out = merge_values({"a": 1, "b": 2}, {"b": 3, "c": 4})
    assert out == {"a": 1, "b": 3, "c": 4}


def test_merge_null_removes_key():
    out = merge_values({"a": 1, "b": 2}, {"b": None})
    assert out == {"a": 1}


def test_merge_does_not_mutate_inputs():
    stored = {"a": 1}
    incoming = {"a": 2}
    out = merge_values(stored, incoming)
    assert stored == {"a": 1}
    assert incoming == {"a": 2}
    assert out == {"a": 2}
