import uuid
from datetime import date, datetime, time

from pydantic import BaseModel, ConfigDict, Field


class EventCreate(BaseModel):
    department_id: uuid.UUID
    title: str = Field(min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    about_user_id: uuid.UUID | None = None
    all_day: bool = True
    start_time: time | None = None
    end_time: time | None = None
    start_date: date
    end_date: date | None = None
    recurrence: dict | None = None


class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    about_user_id: uuid.UUID | None = None
    all_day: bool | None = None
    start_time: time | None = None
    end_time: time | None = None
    start_date: date | None = None
    end_date: date | None = None
    recurrence: dict | None = None


class OccurrenceModify(BaseModel):
    override_date: date | None = None
    override_title: str | None = Field(default=None, max_length=200)
    override_description: str | None = Field(default=None, max_length=2000)
    override_all_day: bool | None = None
    override_start_time: time | None = None
    override_end_time: time | None = None


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    department_id: uuid.UUID
    about_user_id: uuid.UUID | None
    title: str
    description: str | None
    all_day: bool
    start_time: time | None
    end_time: time | None
    start_date: date
    end_date: date | None
    recurrence: dict | None
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None
