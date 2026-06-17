import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ContactSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: EmailStr | None
    phone: str | None
    organization: str | None


class ProjectContactCreate(BaseModel):
    contact_id: uuid.UUID
    role: str = Field(min_length=1, max_length=100)


class ProjectContactUpdate(BaseModel):
    role: str = Field(min_length=1, max_length=100)


class ProjectContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID
    project_id: uuid.UUID
    contact_id: uuid.UUID
    role: str
    contact: ContactSummary
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class ProjectContactListResponse(BaseModel):
    items: list[ProjectContactOut]
    total: int
