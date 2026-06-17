import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class CORCreate(BaseModel):
    number: str = Field(min_length=1, max_length=32, pattern=r"^\S+$")
    description: str = Field(min_length=1, max_length=2000)
    amount: Decimal
    submitted_date: date | None = None
    approved_date: date | None = None
    status: str = Field(default="draft")


class CORUpdate(BaseModel):
    number: str | None = Field(
        default=None, min_length=1, max_length=32, pattern=r"^\S+$"
    )
    description: str | None = Field(default=None, min_length=1, max_length=2000)
    amount: Decimal | None = None
    submitted_date: date | None = None
    approved_date: date | None = None
    status: str | None = None


class COROut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    project_id: uuid.UUID
    number: str
    description: str
    amount: Decimal
    submitted_date: date | None
    approved_date: date | None
    status: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class CORListResponse(BaseModel):
    items: list[COROut]
    total: int
