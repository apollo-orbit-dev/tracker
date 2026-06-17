import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field


class UserSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    email: EmailStr
    display_name: str


class NoteCreate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class NoteUpdate(BaseModel):
    body: str = Field(min_length=1, max_length=5000)


class NoteOut(BaseModel):
    # populate_by_name lets us keep the field named `created_by` on the
    # wire while reading the value from `note.author` (the relationship).
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: uuid.UUID
    project_id: uuid.UUID
    body: str
    created_by: UserSummary = Field(validation_alias="author")
    created_at: datetime
    updated_at: datetime


class NoteListResponse(BaseModel):
    items: list[NoteOut]
    total: int
    limit: int = 5
    offset: int = 0
