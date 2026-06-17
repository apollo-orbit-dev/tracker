import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ContactCreate(BaseModel):
    department_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, min_length=1, max_length=50)
    organization: str | None = Field(default=None, min_length=1, max_length=200)


class ContactUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, min_length=1, max_length=50)
    organization: str | None = Field(default=None, min_length=1, max_length=200)


class ContactOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    department_id: uuid.UUID
    name: str
    email: EmailStr | None
    phone: str | None
    organization: str | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class ContactListResponse(BaseModel):
    items: list[ContactOut]
    total: int
    limit: int
    offset: int