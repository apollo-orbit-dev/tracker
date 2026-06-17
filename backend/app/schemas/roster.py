import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RosterEntry(BaseModel):
    """One row in a department's roster: a user holding a role there."""

    model_config = ConfigDict(from_attributes=True)

    user_role_id: uuid.UUID
    user_id: uuid.UUID
    email: EmailStr
    display_name: str
    role_id: str
    created_at: datetime


class RosterListResponse(BaseModel):
    items: list[RosterEntry]
    total: int


class GrantCreate(BaseModel):
    user_id: uuid.UUID
    # Restricted to the dept-bound roles. Org admin is *never* granted via
    # roster (the admin role has NULL dept and the CHECK forbids using it
    # with a non-NULL department_id anyway).
    role_id: str = Field(pattern=r"^(department_manager|project_editor|viewer)$")


class GrantUpdate(BaseModel):
    """Change the role on an existing dept grant. Same role enum as create."""

    role_id: str = Field(pattern=r"^(department_manager|project_editor|viewer)$")


class UserPickerItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    display_name: str


class UserPickerResponse(BaseModel):
    items: list[UserPickerItem]
    total: int
