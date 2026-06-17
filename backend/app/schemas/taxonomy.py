import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class TaxonomyCreate(BaseModel):
    """Used by the org-wide departments endpoint."""

    code: str = Field(min_length=1, max_length=32, pattern=r"^\S+$")
    name: str = Field(min_length=1, max_length=200)


class DeptScopedTaxonomyCreate(TaxonomyCreate):
    """Used by clients + disciplines, which belong to a department."""

    department_id: uuid.UUID


class TaxonomyUpdate(BaseModel):
    code: str | None = Field(default=None, min_length=1, max_length=32, pattern=r"^\S+$")
    name: str | None = Field(default=None, min_length=1, max_length=200)


class TaxonomyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    code: str
    name: str
    created_at: datetime
    updated_at: datetime
    deleted_at: datetime | None


class DeptScopedTaxonomyOut(TaxonomyOut):
    department_id: uuid.UUID


class TaxonomyListResponse(BaseModel):
    items: list[TaxonomyOut]
    total: int
    limit: int
    offset: int


class DeptScopedTaxonomyListResponse(BaseModel):
    items: list[DeptScopedTaxonomyOut]
    total: int
    limit: int
    offset: int
