import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class EligibleUser(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: str
    display_name: str


class EligibleUsersResponse(BaseModel):
    items: list[EligibleUser]
    total: int


# ---- Assignment entity schemas -------------------------------------------


class AssignmentCreate(BaseModel):
    description: str = Field(min_length=1, max_length=2000)
    assignee_user_id: uuid.UUID
    milestone_id: uuid.UUID | None = None
    due_date: date | None = None
    status: str = Field(default="open")


class AssignmentUpdate(BaseModel):
    """PATCH payload for an assignment.

    Note: milestone_id cannot distinguish "set to null" from "absent" in a
    standard PATCH. For v1 this is acceptable — the frontend always sends the
    full milestone field on edit. A future version can use a sentinel/explicit
    null envelope if needed.
    """

    description: str | None = Field(default=None, min_length=1, max_length=2000)
    assignee_user_id: uuid.UUID | None = None
    milestone_id: uuid.UUID | None = None
    due_date: date | None = None
    status: str | None = None


class AssignmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    milestone_id: uuid.UUID | None
    milestone_name: str | None
    assignee_user_id: uuid.UUID
    assignee_name: str
    assignee_email: str
    description: str
    status: str
    due_date: date | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class AssignmentListResponse(BaseModel):
    items: list[AssignmentOut]
    total: int


# ---- "my assignments" (Phase 27.6) ---------------------------------------


class MyAssignmentOut(AssignmentOut):
    """An assignment plus its project title — the cross-project
    /api/me/assignments feed isn't nested under a known project, so the
    project title travels with each row for the dashboard widget."""

    project_title: str


class MyAssignmentListResponse(BaseModel):
    items: list[MyAssignmentOut]
    total: int
