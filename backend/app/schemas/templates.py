import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator

from backend.app.db.models import (
    FIELD_TYPES,
    MILESTONE_DATE_MODELS,
    MILESTONE_DIRECTIONS,
    SELECT_FIELD_TYPES,
)

# ---- templates -----------------------------------------------------------


class TemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    department_id: uuid.UUID
    client_id: uuid.UUID
    discipline_id: uuid.UUID


class TemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)


class TemplateOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    department_id: uuid.UUID
    client_id: uuid.UUID
    discipline_id: uuid.UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class TemplateListResponse(BaseModel):
    items: list[TemplateOut]
    total: int
    limit: int
    offset: int


# ---- field defs ----------------------------------------------------------


class FieldDefBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    field_type: str
    required: bool = False
    # Phase 5.2: surface this field's value in the at-a-glance contexts
    # (PeekPanel metric grid + project detail right-sidebar Metrics block).
    is_project_metric: bool = False
    order_index: int = 0
    options: dict[str, Any] | None = None

    @model_validator(mode="after")
    def _check_type_and_options(self) -> "FieldDefBase":
        if self.field_type not in FIELD_TYPES:
            raise ValueError(f"unknown field_type: {self.field_type}")
        is_select = self.field_type in SELECT_FIELD_TYPES
        if is_select and self.options is None:
            raise ValueError(f"{self.field_type} requires options")
        if not is_select and self.options is not None:
            raise ValueError(f"{self.field_type} must not have options")
        if is_select:
            choices = self.options.get("choices") if self.options else None
            if not isinstance(choices, list) or not all(
                isinstance(c, str) and c for c in choices
            ):
                raise ValueError(
                    "options must be {'choices': [non-empty strings, ...]}"
                )
            if len(choices) == 0:
                raise ValueError("options.choices must be non-empty")
        return self


class FieldDefCreate(FieldDefBase):
    pass


class FieldDefUpdate(BaseModel):
    """Patch shape — every field optional, but combinations are validated by
    the route handler against the existing row before persisting."""
    name: str | None = Field(default=None, min_length=1, max_length=200)
    field_type: str | None = None
    required: bool | None = None
    is_project_metric: bool | None = None
    order_index: int | None = None
    options: dict[str, Any] | None = None


class FieldDefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    template_id: uuid.UUID
    name: str
    field_type: str
    required: bool
    is_project_metric: bool
    order_index: int
    options: dict[str, Any] | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class FieldDefListResponse(BaseModel):
    items: list[FieldDefOut]
    total: int


# ---- milestone defs ------------------------------------------------------


class MilestoneDefBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    direction: str
    date_model: str
    order_index: int = 0

    @model_validator(mode="after")
    def _check_enums(self) -> "MilestoneDefBase":
        if self.direction not in MILESTONE_DIRECTIONS:
            raise ValueError(f"unknown direction: {self.direction}")
        if self.date_model not in MILESTONE_DATE_MODELS:
            raise ValueError(f"unknown date_model: {self.date_model}")
        return self


class MilestoneDefCreate(MilestoneDefBase):
    pass


class MilestoneDefUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    direction: str | None = None
    date_model: str | None = None
    order_index: int | None = None


class MilestoneDefOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    template_id: uuid.UUID
    name: str
    direction: str
    date_model: str
    order_index: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class MilestoneDefListResponse(BaseModel):
    items: list[MilestoneDefOut]
    total: int


# ---- reorder -------------------------------------------------------------


class ReorderRequest(BaseModel):
    ordered_ids: list[uuid.UUID]
