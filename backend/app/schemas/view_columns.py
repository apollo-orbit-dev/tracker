"""Pydantic schemas for the per-template viewing list column prefs."""
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class ViewColumnsRead(BaseModel):
    """What GET / PUT return."""
    model_config = ConfigDict(from_attributes=True)

    columns: list[str]
    sort_key: str | None = None
    sort_direction: Literal["asc", "desc"] | None = None


class ViewColumnsWrite(BaseModel):
    """PUT body. Full replace — no PATCH semantics. Length cap matches
    services.view_columns.MAX_COLUMNS."""
    columns: list[str] = Field(default_factory=list, max_length=60)
    sort_key: str | None = None
    sort_direction: Literal["asc", "desc"] | None = None
