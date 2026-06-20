import uuid
from datetime import date, time
from typing import Literal

from pydantic import BaseModel


class CalendarMilestoneItem(BaseModel):
    type: Literal["milestone"] = "milestone"
    id: uuid.UUID
    date: date
    name: str
    direction: str
    completed: bool
    actual_date: date | None
    project_id: uuid.UUID
    project_title: str


class CalendarAssignmentItem(BaseModel):
    type: Literal["assignment"] = "assignment"
    id: uuid.UUID
    date: date
    description: str
    status: str
    assignee_name: str
    milestone_id: uuid.UUID | None
    milestone_name: str | None
    project_id: uuid.UUID
    project_title: str


class CalendarItemsResponse(BaseModel):
    items: list[CalendarMilestoneItem | CalendarAssignmentItem]


class CalendarHolidayItem(BaseModel):
    type: Literal["holiday"] = "holiday"
    date: date
    name: str
    country: str


class CalendarHolidaysResponse(BaseModel):
    items: list[CalendarHolidayItem]


class CalendarEventItem(BaseModel):
    type: Literal["event"] = "event"
    event_id: uuid.UUID
    original_date: date
    date: date
    end_date: date
    title: str
    description: str | None
    all_day: bool
    start_time: time | None
    end_time: time | None
    about_user_name: str | None
    is_recurring: bool
    is_override: bool


class CalendarEventsResponse(BaseModel):
    items: list[CalendarEventItem]
