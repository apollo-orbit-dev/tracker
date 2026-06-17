import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from backend.app.schemas.templates import FieldDefOut


class ProjectCreate(BaseModel):
    project_number: str = Field(min_length=4, max_length=32, pattern=r"^\S+$")
    client_project_number: str | None = Field(
        default=None, min_length=1, max_length=64
    )
    title: str = Field(min_length=1, max_length=200)
    template_id: uuid.UUID
    custom_field_values: dict[str, Any] = Field(default_factory=dict)


class ProjectUpdate(BaseModel):
    project_number: str | None = Field(
        default=None, min_length=4, max_length=32, pattern=r"^\S+$"
    )
    client_project_number: str | None = Field(
        default=None, min_length=1, max_length=64
    )
    title: str | None = Field(default=None, min_length=1, max_length=200)
    custom_field_values: dict[str, Any] | None = None


class MilestoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    template_milestone_def_id: uuid.UUID | None
    name: str
    direction: str
    date_model: str
    planned_date: date | None
    actual_date: date | None
    order_index: int
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_number: str
    client_project_number: str | None
    title: str
    template_id: uuid.UUID
    lifecycle_state: str
    custom_field_values: dict[str, Any]
    created_by: uuid.UUID
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
    # Phase 2.7.2: populated only when `GET /api/projects?expand_milestones=true`.
    # The route sets this AFTER `model_validate(row)` to avoid triggering
    # SQLAlchemy lazy-loading on the un-eager-loaded path.
    milestones: list[MilestoneOut] | None = None
    # Phase 3.0.3: embedded template metadata so the list renders for
    # direct-grant users who don't have dept-scope access to the
    # template via /api/admin/templates.
    template_name: str
    # "DEPT_CODE · CLIENT_CODE · DISC_CODE" — used by the detail page
    # header and any other context where the template's
    # dept/client/discipline identity is shown alongside the project.
    template_intersection: str


class ProjectDetailOut(ProjectOut):
    milestones: list[MilestoneOut]
    valid_next_states: list[str]
    # Phase 3.0.3: embedded live field defs so direct-grant users can
    # render the custom-fields card without needing dept-scoped access
    # to /api/admin/templates/{tid}/fields.
    template_field_defs: list[FieldDefOut]
    # Phase 3.0.2: per-project edit permission for the calling user.
    # True iff the user satisfies `project_editor+` in the project's
    # template's department. Lets the frontend gate edit affordances
    # per-project without re-deriving from the user's flat role list
    # (a user with project_editor in one dept + viewer in another would
    # otherwise see edit UI on every project regardless of dept).
    can_edit: bool
    # Phase 3.0.3: per-project access-management permission. True iff
    # the user is org admin OR has department_manager+ in the project's
    # dept. Gates the "Manage access" affordance on the project page.
    can_manage_access: bool


class ProjectListResponse(BaseModel):
    items: list[ProjectOut]
    total: int
    limit: int
    offset: int
    # Phase 2.7.2: populated only when `GET /api/projects?expand_refs=true`.
    ref_labels: dict[str, dict[str, str]] | None = None


class TransitionRequest(BaseModel):
    to_state: str


# Phase 5.3 — spreadsheet import response shape.


class ImportSkipped(BaseModel):
    row: int
    project_number: str
    reason: str


class ImportError(BaseModel):
    row: int
    error: str


class ImportResult(BaseModel):
    created: int
    skipped: list[ImportSkipped]
    errors: list[ImportError]


class MilestoneCreate(BaseModel):
    """Ad-hoc milestone creation. Order is server-assigned."""
    name: str = Field(min_length=1, max_length=200)
    direction: str
    date_model: str


class MilestoneUpdate(BaseModel):
    """PATCH any field. Dates stay nullable; name/direction/date_model are
    only updated when provided (None means 'leave unchanged' — see route
    handler's `exclude_unset` logic). order_index changes via the dedicated
    reorder endpoint, but is left here for completeness."""
    name: str | None = Field(default=None, min_length=1, max_length=200)
    direction: str | None = None
    date_model: str | None = None
    order_index: int | None = Field(default=None, ge=0)
    planned_date: date | None = None
    actual_date: date | None = None


class MilestoneReorderRequest(BaseModel):
    ordered_ids: list[uuid.UUID]
