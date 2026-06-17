import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class UserGrant(BaseModel):
    role_id: str
    department_id: uuid.UUID | None
    department_code: str | None  # None for the org-wide admin grant


class UserListItem(BaseModel):
    id: uuid.UUID
    email: EmailStr
    display_name: str
    lifecycle_state: str
    roles: list[str]
    # Per-grant detail (Phase 1.10). `roles` stays as the flat role-id
    # list for back-compat with anything that already consumed this shape.
    grants: list[UserGrant] = []
    created_at: datetime | None = None
    updated_at: datetime | None = None
    deleted_at: datetime | None = None


class UserListResponse(BaseModel):
    users: list[UserListItem]
    total: int
    limit: int
    offset: int


class UserCreate(BaseModel):
    email: EmailStr
    display_name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=12, max_length=200)


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    # Mirrors the User model's CHECK constraint.
    lifecycle_state: str | None = Field(
        default=None, pattern=r"^(active|deactivated|pending)$"
    )


class PasswordResetRequest(BaseModel):
    password: str = Field(min_length=12, max_length=200)
