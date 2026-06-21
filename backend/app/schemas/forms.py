import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

# ---------------------------------------------------------------------------
# Submission schemas are at the bottom of this file.
# ---------------------------------------------------------------------------

from backend.app.db.models import (
    COR_STATUSES,
    FORM_FIELD_TYPES, FORM_STATUSES, FORM_TARGET_ENTITIES,
)

MAX_FIELDS_PER_FORM = 50


class FormFieldBase(BaseModel):
    label: str = Field(min_length=1, max_length=200)
    field_type: str
    required: bool = False
    help_text: str | None = Field(default=None, max_length=500)
    placeholder: str | None = Field(default=None, max_length=200)
    options: dict[str, Any] | None = None
    target_key: str | None = None

    @model_validator(mode="after")
    def _validate(self):
        if self.field_type not in FORM_FIELD_TYPES:
            raise ValueError(f"unknown field_type: {self.field_type}")
        if self.field_type == "single_select":
            choices = (self.options or {}).get("choices")
            if not isinstance(choices, list) or not choices:
                raise ValueError("single_select requires options.choices (non-empty list)")
        elif self.options is not None:
            raise ValueError(f"{self.field_type} does not accept options")
        # NOTE: target_key ↔ field-type compatibility is validated at the ROUTE
        # (`_validate_field_against_form`), which knows the form's target_entity —
        # the source of truth. The schema can't know the form's entity (it's a
        # form property, not a field property), so it must NOT gate target_key here
        # (doing so rejected the real frontend payload, which sends target_key with
        # no target_entity).
        return self


class FormFieldCreate(FormFieldBase):
    pass


class FormFieldUpdate(FormFieldBase):
    pass


class FormFieldOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    form_id: uuid.UUID
    label: str
    field_type: str
    required: bool
    help_text: str | None
    placeholder: str | None
    options: dict[str, Any] | None
    order_index: int
    target_key: str | None


class FormCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    department_id: uuid.UUID
    description: str | None = Field(default=None, max_length=2000)
    target_entity: str | None = None
    target_template_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def _validate(self):
        if self.target_entity is not None and self.target_entity not in FORM_TARGET_ENTITIES:
            raise ValueError(f"unknown target_entity: {self.target_entity}")
        return self


class FormUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    target_entity: str | None = None
    target_template_id: uuid.UUID | None = None
    status: str | None = None

    @model_validator(mode="after")
    def _validate(self):
        if self.target_entity is not None and self.target_entity not in FORM_TARGET_ENTITIES:
            raise ValueError(f"unknown target_entity: {self.target_entity}")
        if self.status is not None and self.status not in FORM_STATUSES:
            raise ValueError(f"unknown status: {self.status}")
        return self


class FormOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    department_id: uuid.UUID
    name: str
    description: str | None
    target_entity: str | None
    target_template_id: uuid.UUID | None = None
    status: str
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    fields: list[FormFieldOut] = []


class FormListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: uuid.UUID
    department_id: uuid.UUID
    name: str
    target_entity: str | None
    status: str
    updated_at: datetime
    # #49: count of pending submissions awaiting review. Only populated for forms
    # the requester can review (project_editor+ in the dept); 0 otherwise.
    pending_count: int = 0


class FormListResponse(BaseModel):
    items: list[FormListItem]
    total: int


class FieldReorderRequest(BaseModel):
    field_ids: list[uuid.UUID]


# ---------------------------------------------------------------------------
# Submission schemas
# ---------------------------------------------------------------------------


class SubmissionCreate(BaseModel):
    """Payload a user submits when filling out a form."""

    values: dict[str, Any] = Field(
        default_factory=dict,
        description="Keyed by form_field id (UUID string) → submitted value.",
    )
    target_project_id: uuid.UUID | None = None


class ProposedChange(BaseModel):
    """One proposed data change derived from a bound form field."""

    group: str
    """Target entity label (e.g. 'Change order')."""

    target: str
    """Human label of the target field (e.g. 'Amount')."""

    value: str
    """Formatted display value."""

    field_id: str
    """The FormField UUID that produced this change."""


class SubmissionOut(BaseModel):
    """Full submission detail, including computed proposed changes."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    form_id: uuid.UUID
    submitted_by: uuid.UUID
    submitted_by_name: str | None = None
    values: dict[str, Any]
    target_project_id: uuid.UUID | None
    status: str
    reviewed_by: uuid.UUID | None
    reviewed_by_name: str | None = None
    reviewed_at: datetime | None
    review_note: str | None
    pushed_entity_type: str | None
    pushed_entity_id: uuid.UUID | None
    created_at: datetime
    updated_at: datetime

    # Populated by the route handler after calling compute_proposed_changes().
    proposed_changes: list[ProposedChange] = []


class SubmissionListItem(BaseModel):
    """Lightweight submission row for list views."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    form_id: uuid.UUID
    submitted_by: uuid.UUID
    submitted_by_name: str | None = None
    target_project_id: uuid.UUID | None
    status: str
    created_at: datetime
    updated_at: datetime


class SubmissionListResponse(BaseModel):
    items: list[SubmissionListItem]
    total: int


# ---------------------------------------------------------------------------
# Review request schemas (C3)
# ---------------------------------------------------------------------------

_COR_NUMBER_PATTERN = r"^\S+$"


class ApproveRequest(BaseModel):
    """Body for POST .../submissions/{sid}/approve."""

    final_values: dict[str, Any] = Field(
        default_factory=dict,
        description="Reviewer's (possibly edited) values, keyed by field UUID string.",
    )
    # Required only for COR-target forms (enforced in the route handler).
    # A collect-only ("General") form is approved with no project/COR.
    target_project_id: uuid.UUID | None = None
    cor_number: str | None = Field(
        default=None, min_length=1, max_length=32, pattern=_COR_NUMBER_PATTERN
    )
    cor_status: str = Field(default="submitted")
    # Approval-time assignee for assignment-target forms (Pattern B, Phase 20.2).
    assignee_user_id: uuid.UUID | None = None
    # Approval-time milestone structure for milestone-target forms (Pattern B,
    # Phase 20.3). Validated against the enums inside the writer.
    milestone_direction: str | None = None
    milestone_date_model: str | None = None
    # Reviewer-entered project number for intake-target forms (Phase 20.5).
    intake_project_number: str | None = Field(
        default=None, min_length=4, max_length=32, pattern=r"^\S+$"
    )

    @model_validator(mode="after")
    def _validate_cor_status(self):
        if self.cor_status not in COR_STATUSES:
            raise ValueError(
                f"cor_status must be one of: {sorted(COR_STATUSES)}"
            )
        return self


class RejectRequest(BaseModel):
    """Body for POST .../submissions/{sid}/reject."""

    review_note: str | None = None
