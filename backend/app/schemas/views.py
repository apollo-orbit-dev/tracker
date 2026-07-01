import uuid
from decimal import Decimal
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

LIFECYCLE_STATES = ("draft", "active", "on_hold", "complete", "cancelled")
COR_STATUSES = ("draft", "submitted", "approved", "rejected", "cancelled")
ASSIGNMENT_STATUSES = ("open", "in_progress", "done", "cancelled")

Aggregation = Literal[
    "count", "count_distinct", "sum", "avg", "min", "max", "pct_of_total"
]


class MetricCondition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    field: str = Field(min_length=1, max_length=100)
    op: str = Field(min_length=1, max_length=30)
    value: Any = None


class MetricConditions(BaseModel):
    model_config = ConfigDict(extra="forbid")
    combinator: Literal["and", "or"] = "and"
    items: list[MetricCondition] = Field(default_factory=list, max_length=10)


class MetricScope(BaseModel):
    model_config = ConfigDict(extra="forbid")
    department_id: uuid.UUID | None = None
    client_id: uuid.UUID | None = None
    discipline_id: uuid.UUID | None = None
    lifecycle_state: Literal[*LIFECYCLE_STATES] | None = None
    cor_status: list[Literal[*COR_STATUSES]] | None = None


class MetricDefinition(BaseModel):
    model_config = ConfigDict(extra="forbid")
    entity: Literal["project", "milestone", "cor", "assignment"]
    aggregation: Aggregation
    # Required when the metric references custom fields (conditions or
    # target). All custom-field refs must belong to this template; the
    # engine adds Project.template_id == template_id when set.
    template_id: uuid.UUID | None = None
    target_field: str | None = Field(default=None, max_length=100)
    conditions: MetricConditions = Field(default_factory=MetricConditions)
    scope: MetricScope = Field(default_factory=MetricScope)


class Thresholds(BaseModel):
    model_config = ConfigDict(extra="forbid")
    green: float
    amber: float

    @model_validator(mode="after")
    def _ordered(self) -> "Thresholds":
        if self.green > self.amber:
            raise ValueError("thresholds.green must be <= thresholds.amber")
        return self


class MetricCardConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric: MetricDefinition
    thresholds: Thresholds | None = None
    money: bool = False
    compact: bool = False


class MetricEvalResponse(BaseModel):
    # Decimal serializes as a JSON string ("1284000"), matching the
    # field_aggregate widget's existing payloads.
    value: Decimal | None


class ChartBlockConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric: MetricDefinition
    group_by: str = Field(min_length=1, max_length=110)
    kind: Literal["bar", "donut"]
    money: bool = False


class BreakdownColumn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    label: str = Field(min_length=1, max_length=60)
    metric: MetricDefinition
    money: bool = False


class BreakdownBlockConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")
    group_by: str = Field(min_length=1, max_length=110)
    columns: list[BreakdownColumn] = Field(min_length=1, max_length=4)


class TableBlockConfig(BaseModel):
    """Embedded Saved View table block (Phase 7.9). Column keys use the
    existing view_columns grammar (builtin:/custom_field:/milestone:);
    semantic checks (template access, live fields/milestones, sortable
    keys) live in metric_engine.validate_block_config."""

    model_config = ConfigDict(extra="forbid")
    template_id: uuid.UUID
    columns: list[str] = Field(min_length=1, max_length=8)
    lifecycle_state: Literal[*LIFECYCLE_STATES] | None = None
    q: str | None = Field(default=None, max_length=200)
    # Optional field conditions, validated/compiled through the metric
    # engine's project condition compiler (compile_project_conditions).
    conditions: MetricConditions | None = None
    limit: Literal[6, 10, 15] = 6
    sort: str | None = None              # SORTABLE_BUILTIN_KEYS member
    sort_direction: Literal["asc", "desc"] | None = None


class GroupRowOut(BaseModel):
    label: str
    value: Decimal | None
    # Sentinel flags: labels are display text only. A real select option
    # literally named "—" or "Other" must not collide with the synthetic
    # buckets, so consumers key/disable off these instead of the label.
    is_null: bool = False   # the unset ("—") bucket
    is_other: bool = False  # the synthetic top-N tail


class MetricBlockData(BaseModel):
    kind: Literal["metric"] = "metric"
    value: Decimal | None


class ChartBlockData(BaseModel):
    kind: Literal["chart"] = "chart"
    rows: list[GroupRowOut]
    money: bool = False
    chart_kind: Literal["bar", "donut"]


class BreakdownRowOut(BaseModel):
    label: str
    cells: list[Decimal | None]
    # Same sentinel rule as GroupRowOut: the label is display text only,
    # so a real option literally named "—" never merges with the unset
    # bucket — consumers key off these flags, not the label.
    is_null: bool = False   # the unset ("—") bucket
    is_other: bool = False  # the synthetic shared-tail row


class BreakdownBlockData(BaseModel):
    kind: Literal["breakdown"] = "breakdown"
    columns: list[str]
    money: list[bool]
    rows: list[BreakdownRowOut]


BlockDataResponse = Annotated[
    MetricBlockData | ChartBlockData | BreakdownBlockData,
    Field(discriminator="kind"),
]


class DrillRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    metric: MetricDefinition
    group_by: str | None = Field(default=None, max_length=110)
    group_value: str | None = None  # None + group_by set = the "—" bucket

    @model_validator(mode="after")
    def _group_value_requires_group_by(self) -> "DrillRequest":
        if self.group_value is not None and self.group_by is None:
            raise ValueError("group_value requires group_by")
        return self


class DrillRow(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    label: str
    sublabel: str


class DrillRowsResponse(BaseModel):
    total: int
    rows: list[DrillRow]


class CustomViewCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class CustomViewUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)


class CustomViewOut(BaseModel):
    id: uuid.UUID
    name: str
    order_index: int
    published_department_id: uuid.UUID | None = None
    # Phase 7.15 sharing fields:
    is_owner: bool = True
    owner_name: str = ""
    published_department_code: str | None = None


class PublishRequest(BaseModel):
    department_id: uuid.UUID


class CustomViewsResponse(BaseModel):
    items: list[CustomViewOut]


class ViewReorderRequest(BaseModel):
    ordered_ids: list[uuid.UUID]


class BlockCreate(BaseModel):
    block_type: Literal["metric", "chart", "breakdown", "table", "text"]
    title: str | None = Field(default=None, max_length=200)
    width: Literal[1, 2, 4] | None = None
    accent: (
        Literal["indigo", "blue", "emerald", "amber", "rose", "slate"] | None
    ) = None
    config: dict | None = None


class BlockUpdate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    width: Literal[1, 2, 4] | None = None
    accent: (
        Literal["indigo", "blue", "emerald", "amber", "rose", "slate"] | None
    ) = None
    config: dict | None = None


class BlockOut(BaseModel):
    id: uuid.UUID
    view_id: uuid.UUID
    block_type: str
    title: str | None
    order_index: int
    width: int
    accent: str
    config: dict | None


class BlocksResponse(BaseModel):
    items: list[BlockOut]


class BlockReorderRequest(BaseModel):
    ordered_ids: list[uuid.UUID]


_SavedMetricName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=120)
]


class SavedMetricCreate(BaseModel):
    name: _SavedMetricName
    config: MetricDefinition


class SavedMetricUpdate(BaseModel):
    name: _SavedMetricName | None = None
    config: MetricDefinition | None = None


class SavedMetricOut(BaseModel):
    id: uuid.UUID
    name: str
    config: dict


class SavedMetricsResponse(BaseModel):
    items: list[SavedMetricOut]
