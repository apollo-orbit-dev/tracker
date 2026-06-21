import uuid
import pytest
from pydantic import ValidationError

from backend.app.schemas.forms import FormCreate, FormFieldCreate, FormUpdate


def test_form_create_rejects_bad_target_entity():
    with pytest.raises(ValidationError):
        FormCreate(name="x", department_id=uuid.uuid4(), target_entity="bogus")


def test_field_create_rejects_unknown_type():
    with pytest.raises(ValidationError):
        FormFieldCreate(label="x", field_type="rich_text")


def test_field_create_requires_options_for_select():
    with pytest.raises(ValidationError):
        FormFieldCreate(label="x", field_type="single_select")
    ok = FormFieldCreate(label="x", field_type="single_select",
                         options={"choices": ["a", "b"]})
    assert ok.options["choices"] == ["a", "b"]


def test_field_create_accepts_target_key_without_entity():
    # The schema accepts a target_key as an opaque string — it does NOT know
    # the form's target_entity, so it cannot (and must not) validate binding
    # compatibility. That check lives at the route (`_validate_field_against_form`),
    # which knows the form. This mirrors the real frontend payload, which sends
    # target_key with no target_entity.
    ok = FormFieldCreate(label="x", field_type="short_text", target_key="description")
    assert ok.target_key == "description"


def test_field_create_rejects_options_on_non_select():
    with pytest.raises(ValidationError):
        FormFieldCreate(label="x", field_type="short_text", options={"choices": ["a"]})


def test_form_update_rejects_bad_status():
    with pytest.raises(ValidationError):
        FormUpdate(status="bogus")
