import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class LifecycleCounts(BaseModel):
    draft: int = 0
    active: int = 0
    on_hold: int = 0
    complete: int = 0
    cancelled: int = 0


class MilestoneLookaheadItem(BaseModel):
    project_id: uuid.UUID
    project_title: str
    milestone_id: uuid.UUID
    milestone_name: str
    direction: str
    planned_date: date
    # Negative = past due by this many days; positive = upcoming.
    days_offset: int
    # True iff there's no template_milestone_def_id (i.e., it was added
    # ad-hoc on the project, not inherited from the template).
    ad_hoc: bool


class MilestoneLookaheadResponse(BaseModel):
    items: list[MilestoneLookaheadItem]
    total: int


class CORStatusSummary(BaseModel):
    status: str
    count: int
    # Sum of `amount` across CORs in this status. NULL amounts coalesce to 0.
    total_amount: Decimal


class CORSummaryResponse(BaseModel):
    by_status: list[CORStatusSummary]


class ActivityItem(BaseModel):
    kind: str  # "note" for now; reserved for future ("cor", "lifecycle", etc.)
    project_id: uuid.UUID
    project_title: str
    author_name: str
    body_preview: str
    created_at: datetime


class ActivityResponse(BaseModel):
    items: list[ActivityItem]


# Phase 2.1 — per-user dashboard composition --------------------------------
# Phase 2.4 — added per-user multiple dashboards (tabs).

class Dashboard(BaseModel):
    id: uuid.UUID
    name: str
    order_index: int


class DashboardsResponse(BaseModel):
    items: list[Dashboard]


class DashboardCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class DashboardUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)


class DashboardReorderRequest(BaseModel):
    ordered_ids: list[uuid.UUID]


class DashboardWidget(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: uuid.UUID
    dashboard_id: uuid.UUID
    widget_type: str
    order_index: int
    width: int = 1
    # Phase 2.11: DB column is `column_pos`; we expose it as `column` in
    # the JSON response. Always 0 or 1; ignored on the frontend when
    # width == 2.
    column: int = Field(
        default=0,
        ge=0,
        le=1,
        validation_alias="column_pos",
        serialization_alias="column",
    )
    # Null means "fall back to the widget library's default label".
    title: str | None = None
    config: dict | None = None


class DashboardWidgetsResponse(BaseModel):
    items: list[DashboardWidget]


class DashboardWidgetCreate(BaseModel):
    # Pattern mirrors the DB CHECK constraint; widens here if more widget
    # types ship in later phases.
    widget_type: str  # validated against WIDGET_TYPES in the route
    config: dict | None = None


class DashboardWidgetUpdate(BaseModel):
    """Partial-update PATCH body. Only fields the caller sent are
    applied — `model_dump(exclude_unset=True)` is the test in the route.
    """

    config: dict | None = None
    width: int | None = Field(default=None, ge=1, le=2)
    # Empty / whitespace-only titles normalize to null in the route so
    # the DB never holds a blank string the UI would render as an empty
    # header.
    title: str | None = Field(default=None, max_length=200)


class WidgetReorderItem(BaseModel):
    id: uuid.UUID
    column: int = Field(default=0, ge=0, le=1)


class DashboardWidgetReorderRequest(BaseModel):
    """Reorder payload. Accepts either the legacy ordered_ids shape
    (Phase 2.1+) or the new items shape (Phase 2.11+).

    Exactly one of the two fields must be present; the route handler
    validates that and rejects payloads with both or neither set.
    """

    ordered_ids: list[uuid.UUID] | None = None
    items: list[WidgetReorderItem] | None = None


# field_aggregate widget --------------------------------------------------

class FieldAggregatePart(BaseModel):
    field_name: str
    # Field type so the frontend can pick the right display formatter
    # (currency → $X,XXX.XX, percent → N%, otherwise plain). Phase 2.10.
    field_type: str
    total: Decimal
    project_count: int


class FieldAggregateResponse(BaseModel):
    primary: FieldAggregatePart
    secondary: FieldAggregatePart | None = None
