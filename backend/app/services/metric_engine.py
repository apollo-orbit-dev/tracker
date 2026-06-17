"""Metric engine: validate + compile + evaluate user-defined metrics.

Every query built here uses bound parameters; user input never reaches
SQL as a string. Operators, aggregations, and field kinds are
whitelisted; custom-field refs are resolved against live
TemplateFieldDef rows on a template the caller can access.
"""
import uuid
from datetime import date, timedelta
from decimal import Decimal

from pydantic import ValidationError
from sqlalchemy import Date as SADate
from sqlalchemy import Numeric, and_, cast, distinct, func, or_, select
from sqlalchemy.dialects.postgresql import array
from sqlalchemy.orm import Session

from backend.app.auth.scope import (
    accessible_department_ids,
    directly_granted_project_ids,
)
from backend.app.db.models import (
    COR,
    Milestone,
    Project,
    Template,
    TemplateFieldDef,
    TemplateMilestoneDef,
    User,
)
from backend.app.schemas.views import (
    COR_STATUSES,
    LIFECYCLE_STATES,
    BreakdownBlockConfig,
    ChartBlockConfig,
    MetricCardConfig,
    MetricCondition,
    MetricConditions,
    MetricDefinition,
    TableBlockConfig,
)
from backend.app.services.view_columns import (
    SORTABLE_BUILTIN_KEYS,
    parse_column_key,
)
from backend.app.services.widget_config import (
    ConfigError as WidgetConfigError,
)
from backend.app.services.widget_config import _validate_dcd_filter

TEXT_SIZE_PRESETS = frozenset({"heading", "body", "caption"})


class ConfigError(Exception):
    def __init__(self, reasons: list[str]):
        super().__init__("; ".join(reasons))
        self.reasons = reasons


# ---- field catalogs ------------------------------------------------------

# kind -> allowed ops. "is_empty" is valid for date kinds too (unset
# planned/actual dates) — _check_value and the compilers handle it.
OPS_BY_KIND: dict[str, frozenset[str]] = {
    "boolean": frozenset({"is_true", "is_false", "is_empty"}),
    "select": frozenset({"in", "not_in"}),
    "number": frozenset({"eq", "gt", "lt", "between"}),
    "date": frozenset(
        {"before", "after", "between", "last_n_days", "next_n_days",
         "this_month", "this_quarter", "last_month", "on_or_before_today",
         "is_empty"}
    ),
    "text": frozenset({"equals", "contains"}),
}

FIELD_TYPE_TO_KIND: dict[str, str] = {
    "boolean": "boolean",
    "boolean_conditional_date": "boolean",
    "boolean_conditional_text": "boolean",
    "single_select": "select",
    "multi_select": "select",
    "integer": "number",
    "decimal": "number",
    "currency": "number",
    "percent": "number",
    "date": "date",
    "short_text": "text",
    "long_text": "text",
    "url": "text",
    "email": "text",
    "phone": "text",
    "date_planned_actual": "date",   # sub-ref only: <uuid>.planned / .actual
    "date_range": "date",            # sub-ref only: <uuid>.start / .end
}
# Anything not in the map (reference field types, auto_number,
# duration, …) is rejected in v1.

# Field types whose stored value is an object of sub-dates; metric refs
# must name one sub via "<field-uuid>.<sub>" (kind date).
DATE_SUBFIELDS: dict[str, tuple[str, ...]] = {
    "date_planned_actual": ("planned", "actual"),
    "date_range": ("start", "end"),
}

# built-in name -> (kind, fixed choices or None)
PROJECT_BUILTINS: dict[str, tuple[str, tuple[str, ...] | None]] = {
    "lifecycle_state": ("select", LIFECYCLE_STATES),
    "title": ("text", None),
    "project_number": ("text", None),
    "client_project_number": ("text", None),
    "created_at": ("date", None),
}
MILESTONE_FIELDS: dict[str, tuple[str, tuple[str, ...] | None]] = {
    "planned": ("date", None),
    "actual": ("date", None),
    "direction": ("select", ("outbound", "inbound", "internal", "external")),
    "name": ("text", None),
}
COR_FIELDS: dict[str, tuple[str, tuple[str, ...] | None]] = {
    "status": ("select", COR_STATUSES),
    "amount": ("number", None),
    "submitted_date": ("date", None),
    "approved_date": ("date", None),
}

NUMERIC_AGGS = frozenset({"sum", "avg", "min", "max"})


# ---- validation ----------------------------------------------------------

class _ResolvedField:
    """A validated condition/target field with everything needed to compile."""

    def __init__(
        self, kind: str, *, column=None, custom_fd=None, choices=None, sub=None
    ):
        self.kind = kind          # boolean | select | number | date | text
        self.column = column      # SQLAlchemy column for built-ins
        self.custom_fd = custom_fd  # TemplateFieldDef for custom fields
        self.choices = choices    # allowed values for selects
        self.sub = sub            # sub-key for DATE_SUBFIELDS types


def _resolve_field(
    db: Session,
    user: User,
    entity: str,
    field_ref: str,
    template: Template | None,
) -> _ResolvedField:
    builtins = {
        "project": PROJECT_BUILTINS,
        "milestone": MILESTONE_FIELDS,
        "cor": COR_FIELDS,
    }[entity]
    if field_ref in builtins:
        kind, choices = builtins[field_ref]
        columns = {
            ("project", "lifecycle_state"): Project.lifecycle_state,
            ("project", "title"): Project.title,
            ("project", "project_number"): Project.project_number,
            ("project", "client_project_number"): Project.client_project_number,
            ("project", "created_at"): cast(Project.created_at, SADate),
            ("milestone", "planned"): Milestone.planned_date,
            ("milestone", "actual"): Milestone.actual_date,
            ("milestone", "direction"): Milestone.direction,
            ("milestone", "name"): Milestone.name,
            ("cor", "status"): COR.status,
            ("cor", "amount"): COR.amount,
            ("cor", "submitted_date"): COR.submitted_date,
            ("cor", "approved_date"): COR.approved_date,
        }
        return _ResolvedField(kind, column=columns[(entity, field_ref)], choices=choices)

    # Custom field (projects only), referenced by UUID string, with an
    # optional ".<sub>" suffix for DATE_SUBFIELDS types.
    if entity != "project":
        raise ConfigError([f"unknown {entity} field: {field_ref}"])
    raw_ref, _, sub = field_ref.partition(".")
    try:
        fid = uuid.UUID(raw_ref)
    except ValueError:
        raise ConfigError([f"unknown project field: {field_ref}"])
    if template is None:
        raise ConfigError(["template_id is required when using custom fields"])
    fd = db.get(TemplateFieldDef, fid)
    if fd is None or fd.deleted_at is not None or fd.template_id != template.id:
        raise ConfigError([f"field {field_ref} not on template {template.id}"])
    kind = FIELD_TYPE_TO_KIND.get(fd.field_type)
    if kind is None:
        raise ConfigError(
            [f"field type {fd.field_type} is not supported in metrics"]
        )
    if fd.field_type in DATE_SUBFIELDS:
        if sub not in DATE_SUBFIELDS[fd.field_type]:
            raise ConfigError([
                f"field {fd.name} requires a sub-field: "
                f"{' / '.join(DATE_SUBFIELDS[fd.field_type])}"
            ])
    elif sub:
        raise ConfigError([f"field {fd.name} does not take a sub-field"])
    choices = None
    if kind == "select":
        choices = tuple((fd.options or {}).get("choices", []))
    return _ResolvedField(kind, custom_fd=fd, choices=choices, sub=sub or None)


def _check_value(cond: MetricCondition, rf: _ResolvedField) -> list[str]:
    """Validate cond.value for the op/kind. Returns reasons (empty = ok)."""
    op, v = cond.op, cond.value
    if op == "is_empty":
        return [] if v is None else ["is_empty takes no value"]
    if rf.kind == "boolean":
        return [] if v is None else ["boolean ops take no value"]
    if rf.kind == "select":
        if not isinstance(v, list) or not v or not all(isinstance(x, str) for x in v):
            return [f"{op} needs a non-empty list of strings"]
        bad = [x for x in v if rf.choices is not None and rf.choices and x not in rf.choices]
        return [f"value not in options: {x}" for x in bad]
    if rf.kind == "number":
        def _is_num(x) -> bool:
            # bool is an int subclass; reject it explicitly or
            # {"op": "gt", "value": true} passes and 500s in SQL.
            return isinstance(x, (int, float)) and not isinstance(x, bool)
        if op == "between":
            ok = isinstance(v, list) and len(v) == 2 and all(_is_num(x) for x in v)
            return [] if ok else ["between needs [low, high] numbers"]
        return [] if _is_num(v) else [f"{op} needs a number"]
    if rf.kind == "date":
        def _is_date(x) -> bool:
            if x == "today":
                return True
            try:
                date.fromisoformat(x)
                return True
            except (TypeError, ValueError):
                return False
        if op in ("before", "after"):
            return [] if _is_date(v) else [f"{op} needs YYYY-MM-DD or 'today'"]
        if op == "between":
            ok = isinstance(v, list) and len(v) == 2 and all(_is_date(x) for x in v)
            return [] if ok else ["between needs [start, end] dates"]
        if op in ("last_n_days", "next_n_days"):
            ok = isinstance(v, int) and not isinstance(v, bool) and 1 <= v <= 730
            return [] if ok else [f"{op} needs an integer 1-730"]
        # No-value preset ops land here: this_month, this_quarter,
        # last_month, on_or_before_today. A future value-taking date op
        # must add its own branch above, not rely on this fall-through.
        return [] if v is None else [f"{op} takes no value"]
    if rf.kind == "text":
        ok = isinstance(v, str) and 1 <= len(v) <= 200
        return [] if ok else [f"{op} needs a string (max 200 chars)"]
    return [f"unsupported field kind: {rf.kind}"]


def validate_metric(db: Session, user: User, m: MetricDefinition) -> dict:
    """Full semantic validation. Returns {'template': Template|None,
    'fields': {ref: _ResolvedField}, 'target': _ResolvedField|None}.
    Raises ConfigError with all reasons collected."""
    reasons: list[str] = []

    template: Template | None = None
    if m.template_id is not None:
        if m.entity != "project":
            reasons.append("template_id only applies to project metrics")
        template = db.get(Template, m.template_id)
        if template is None or template.deleted_at is not None:
            raise ConfigError(["template not found"])
        allowed = accessible_department_ids(user)
        if allowed is not None and template.department_id not in allowed:
            # Same message as the missing-template branch: an
            # out-of-scope caller can't distinguish "exists but not
            # mine" from "doesn't exist".
            raise ConfigError(["template not found"])

    # scope DCD reuses the dashboard widgets' validator
    dcd = {
        k: str(getattr(m.scope, k))
        for k in ("department_id", "client_id", "discipline_id")
        if getattr(m.scope, k) is not None
    }
    if dcd:
        try:
            _validate_dcd_filter(db, user, dcd)
        except WidgetConfigError as e:
            reasons.extend(e.reasons)
    if m.scope.cor_status is not None and m.entity != "cor":
        reasons.append("scope.cor_status only applies to cor metrics")

    fields: dict[str, _ResolvedField] = {}
    for cond in m.conditions.items:
        try:
            rf = fields.get(cond.field) or _resolve_field(
                db, user, m.entity, cond.field, template
            )
        except ConfigError as e:
            reasons.extend(e.reasons)
            continue
        fields[cond.field] = rf
        allowed_ops = OPS_BY_KIND[rf.kind]
        if cond.op not in allowed_ops:
            reasons.append(f"op {cond.op} not allowed for {rf.kind} field")
            continue
        reasons.extend(_check_value(cond, rf))

    target: _ResolvedField | None = None
    if m.aggregation in NUMERIC_AGGS or m.aggregation == "count_distinct":
        if m.target_field is None:
            reasons.append(f"{m.aggregation} requires target_field")
        else:
            try:
                target = _resolve_field(db, user, m.entity, m.target_field, template)
                if m.aggregation in NUMERIC_AGGS and target.kind != "number":
                    reasons.append(f"{m.aggregation} requires a numeric target")
            except ConfigError as e:
                reasons.extend(e.reasons)
    elif m.target_field is not None:
        reasons.append(f"{m.aggregation} takes no target_field")
    if m.entity == "milestone" and m.aggregation not in ("count", "pct_of_total"):
        reasons.append("milestone metrics support count / pct_of_total only")

    if reasons:
        raise ConfigError(reasons)
    return {"template": template, "fields": fields, "target": target}


# ---- compilation ---------------------------------------------------------

def _escape_like(s: str) -> str:
    return s.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def _date_bounds(op: str, value) -> tuple[date | None, date | None]:
    today = date.today()
    def _d(x) -> date:
        return today if x == "today" else date.fromisoformat(x)
    if op == "before":
        return None, _d(value) - timedelta(days=1)
    if op == "after":
        return _d(value) + timedelta(days=1), None
    if op == "between":
        return _d(value[0]), _d(value[1])
    if op == "last_n_days":
        return today - timedelta(days=value), today
    if op == "next_n_days":
        return today, today + timedelta(days=value)
    if op == "this_month":
        start = today.replace(day=1)
        nxt = (start + timedelta(days=32)).replace(day=1)
        return start, nxt - timedelta(days=1)
    if op == "this_quarter":
        qstart_month = 3 * ((today.month - 1) // 3) + 1
        start = date(today.year, qstart_month, 1)
        nxt = (start + timedelta(days=93)).replace(day=1)
        return start, nxt - timedelta(days=1)
    if op == "last_month":
        first_this = today.replace(day=1)
        last_prev = first_this - timedelta(days=1)   # last day of last month
        return last_prev.replace(day=1), last_prev   # [first..last] of last month
    if op == "on_or_before_today":
        return None, today
    raise ConfigError([f"unknown date op: {op}"])


def _condition_expr(cond: MetricCondition, rf: _ResolvedField):
    if rf.custom_fd is not None:
        fid = str(rf.custom_fd.id)
        txt = Project.custom_field_values.op("->>")(fid)
        if rf.sub is not None:
            # DATE_SUBFIELDS types store {planned?, actual?} / {start?,
            # end?}; the condition targets one nested sub-date.
            # is_empty then means *that sub-date* is unset.
            txt = Project.custom_field_values[fid][rf.sub].astext
        if cond.op == "is_empty":
            return txt.is_(None)
        if rf.kind == "boolean":
            # boolean_conditional_* store {"value": bool, ...}; the flag
            # lives at the nested "value" key. {value: false} counts as
            # false (parity with project_export). Plain boolean stays a
            # top-level true/false. is_empty (handled above) means the
            # field is unset for all three types.
            if rf.custom_fd.field_type in (
                "boolean_conditional_date", "boolean_conditional_text"
            ):
                flag = Project.custom_field_values[fid]["value"].astext
            else:
                flag = txt
            if cond.op == "is_true":
                return flag == "true"
            if cond.op == "is_false":
                return flag == "false"
        if rf.kind == "select":
            if rf.custom_fd.field_type == "multi_select":
                elem = Project.custom_field_values[fid]
                has = elem.has_any(array(cond.value))
                if cond.op == "in":
                    return has
                # Strict not_in: unset rows do NOT match (parity with
                # single_select, where SQL NOT IN excludes NULL).
                # Users combine with is_empty for "missing" semantics.
                return and_(txt.isnot(None), ~has)
            return txt.in_(cond.value) if cond.op == "in" else txt.notin_(cond.value)
        if rf.kind == "number":
            num = cast(txt, Numeric)
            if cond.op == "eq":
                return num == cond.value
            if cond.op == "gt":
                return num > cond.value
            if cond.op == "lt":
                return num < cond.value
            if cond.op == "between":
                return num.between(cond.value[0], cond.value[1])
        if rf.kind == "date":
            col = cast(txt, SADate)
            lo, hi = _date_bounds(cond.op, cond.value)
            parts = [txt.isnot(None)]
            if lo is not None:
                parts.append(col >= lo)
            if hi is not None:
                parts.append(col <= hi)
            return and_(*parts)
        if rf.kind == "text":
            if cond.op == "equals":
                return txt == cond.value
            if cond.op == "contains":
                return txt.ilike(f"%{_escape_like(cond.value)}%", escape="\\")
        # Fail loud: any op added to OPS_BY_KIND without a compile branch
        # must raise here instead of compiling as the wrong expression.
        raise ConfigError([f"unsupported op {cond.op} for {rf.kind}"])

    col = rf.column
    if cond.op == "is_empty":
        return col.is_(None)
    if rf.kind == "select":
        return col.in_(cond.value) if cond.op == "in" else col.notin_(cond.value)
    if rf.kind == "number":
        if cond.op == "eq":
            return col == cond.value
        if cond.op == "gt":
            return col > cond.value
        if cond.op == "lt":
            return col < cond.value
        if cond.op == "between":
            return col.between(cond.value[0], cond.value[1])
    if rf.kind == "date":
        lo, hi = _date_bounds(cond.op, cond.value)
        parts = [col.isnot(None)]
        if lo is not None:
            parts.append(col >= lo)
        if hi is not None:
            parts.append(col <= hi)
        return and_(*parts)
    if rf.kind == "text":
        if cond.op == "equals":
            return col == cond.value
        if cond.op == "contains":
            return col.ilike(f"%{_escape_like(cond.value)}%", escape="\\")
    # Fail loud: any op added to OPS_BY_KIND without a compile branch
    # must raise here instead of compiling as the wrong expression.
    raise ConfigError([f"unsupported op {cond.op} for {rf.kind}"])


def _scoped_base(db: Session, user: User, m: MetricDefinition, resolved: dict):
    """WHERE clauses shared by every aggregation for this metric."""
    where = [Project.deleted_at.is_(None)]

    allowed = accessible_department_ids(user)
    direct = directly_granted_project_ids(user)
    if allowed is not None:
        clauses = []
        if allowed:
            clauses.append(Template.department_id.in_(allowed))
        if direct:
            clauses.append(Project.id.in_(direct))
        if not clauses:
            where.append(Project.id.is_(None))  # matches nothing
        else:
            where.append(or_(*clauses))

    s = m.scope
    if s.department_id is not None:
        where.append(Template.department_id == s.department_id)
    if s.client_id is not None:
        where.append(Template.client_id == s.client_id)
    if s.discipline_id is not None:
        where.append(Template.discipline_id == s.discipline_id)
    if s.lifecycle_state is not None:
        where.append(Project.lifecycle_state == s.lifecycle_state)
    if resolved["template"] is not None:
        where.append(Project.template_id == resolved["template"].id)
    return where


def _conditions_clause(m: MetricDefinition, resolved: dict):
    exprs = [
        _condition_expr(c, resolved["fields"][c.field]) for c in m.conditions.items
    ]
    if not exprs:
        return None
    return and_(*exprs) if m.conditions.combinator == "and" else or_(*exprs)


def _entity_base(m: MetricDefinition, where: list):
    """Scoped SELECT of entity ids; shared by scalar, grouped, and drill paths."""
    if m.entity == "project":
        return select(Project.id).join(
            Template, Project.template_id == Template.id
        ).where(*where)
    if m.entity == "milestone":
        return (
            select(Milestone.id)
            .join(Project, Milestone.project_id == Project.id)
            .join(Template, Project.template_id == Template.id)
            .where(Milestone.deleted_at.is_(None), *where)
        )
    base = (
        select(COR.id)
        .join(Project, COR.project_id == Project.id)
        .join(Template, Project.template_id == Template.id)
        .where(COR.deleted_at.is_(None), *where)
    )
    if m.scope.cor_status:
        base = base.where(COR.status.in_(m.scope.cor_status))
    return base


def _agg_expr(m: MetricDefinition, target):
    if m.aggregation == "count":
        return func.count()
    if target.custom_fd is not None:
        fid = str(target.custom_fd.id)
        if target.sub is not None:
            # count_distinct on a sub-ref counts the nested sub-date,
            # not the whole {planned, actual} object. Numeric aggs
            # never see a sub-ref (kind date fails the numeric check).
            value_col = Project.custom_field_values[fid][target.sub].astext
        else:
            value_col = Project.custom_field_values.op("->>")(fid)
        num_col = cast(value_col, Numeric)
    else:
        value_col = target.column
        num_col = target.column
    if m.aggregation == "count_distinct":
        return func.count(distinct(value_col))
    return {"sum": func.sum, "avg": func.avg, "min": func.min, "max": func.max}[
        m.aggregation
    ](num_col)


def compile_project_conditions(
    db: Session, user: User, template_id, conditions: MetricConditions
):
    """Validate + compile a MetricConditions over projects on one template
    into a bound-parameter SQLAlchemy clause (or None if empty). Reuses the
    metric validation + condition compiler so the projects list endpoint and
    the table block speak the same field-condition language. Raises
    ConfigError on bad refs/ops/values."""
    m = MetricDefinition(
        entity="project",
        aggregation="count",
        template_id=template_id,
        conditions=conditions,
    )
    resolved = validate_metric(db, user, m)
    return _conditions_clause(m, resolved)


def evaluate_metric(db: Session, user: User, m: MetricDefinition) -> Decimal | None:
    resolved = validate_metric(db, user, m)
    where = _scoped_base(db, user, m, resolved)
    cond = _conditions_clause(m, resolved)

    base = _entity_base(m, where)

    if m.aggregation == "pct_of_total":
        total = db.execute(
            select(func.count()).select_from(base.subquery())
        ).scalar_one()
        if total == 0:
            return Decimal(0)
        matched_q = base.where(cond) if cond is not None else base
        matched = db.execute(
            select(func.count()).select_from(matched_q.subquery())
        ).scalar_one()
        return (Decimal(matched) / Decimal(total) * 100).quantize(Decimal("0.1"))

    if cond is not None:
        base = base.where(cond)

    if m.aggregation == "count":
        return Decimal(
            db.execute(select(func.count()).select_from(base.subquery())).scalar_one()
        )

    agg = _agg_expr(m, resolved["target"])

    row = db.execute(base.with_only_columns(agg)).scalar()
    if row is None:
        return Decimal(0) if m.aggregation in ("sum", "count_distinct") else None
    return Decimal(str(row))


# ---- grouped evaluation ----------------------------------------------------

GROUPABLE_KINDS = frozenset({"select", "boolean"})


def _resolve_group_by(
    db: Session, user: User, m: MetricDefinition, group_by: str, resolved: dict
) -> _ResolvedField:
    rf = _resolve_field(db, user, m.entity, group_by, resolved["template"])
    if rf.kind not in GROUPABLE_KINDS:
        raise ConfigError([f"cannot group by a {rf.kind} field"])
    if rf.custom_fd is not None and rf.custom_fd.field_type == "multi_select":
        raise ConfigError(["cannot group by a multi-select field"])
    return rf


def _group_expr(rf: _ResolvedField):
    if rf.custom_fd is None:
        return rf.column
    fid = str(rf.custom_fd.id)
    if rf.custom_fd.field_type in (
        "boolean_conditional_date", "boolean_conditional_text"
    ):
        return Project.custom_field_values[fid]["value"].astext
    return Project.custom_field_values.op("->>")(fid)


class GroupRow:
    """One group bucket. The label is display text only; consumers key
    off the sentinel flags, so a real option literally named "—" or
    "Other" can't collide with the synthetic buckets."""

    def __init__(
        self, label: str, value: Decimal | None,
        *, is_null: bool = False, is_other: bool = False,
    ):
        self.label = label
        self.value = value
        self.is_null = is_null    # the unset ("—") bucket
        self.is_other = is_other  # the synthetic top-N tail


GROUP_TOP_N = 12


def evaluate_grouped(
    db: Session, user: User, m: MetricDefinition, group_by: str,
    *, top_n: int | None = GROUP_TOP_N,
) -> list[GroupRow]:
    """Grouped aggregate, ordered value-desc. top_n=None returns every
    group untruncated; otherwise groups past top_n collapse into one
    "Other" row (is_other=True) summing their values."""
    resolved = validate_metric(db, user, m)
    if m.aggregation == "pct_of_total":
        raise ConfigError(["pct_of_total cannot be grouped"])
    rf = _resolve_group_by(db, user, m, group_by, resolved)
    where = _scoped_base(db, user, m, resolved)
    cond = _conditions_clause(m, resolved)

    base = _entity_base(m, where)
    if cond is not None:
        base = base.where(cond)
    gexpr = _group_expr(rf)
    agg = _agg_expr(m, resolved["target"])
    q = (
        base.with_only_columns(gexpr.label("g"), agg.label("v"))
        .group_by(gexpr)
        # nulls_last on the value: Postgres DESC defaults to NULLS
        # FIRST, which would float all-NULL aggregate groups to the
        # top. Secondary key makes tie order deterministic (label asc,
        # the NULL "—" bucket last among equals).
        .order_by(agg.desc().nulls_last(), gexpr.asc().nulls_last())
    )
    raw = db.execute(q).all()

    def _label(g) -> str:
        if g is None:
            return "—"
        if rf.kind == "boolean":
            return "True" if str(g) == "true" else "False"
        return str(g)

    rows = [
        GroupRow(
            _label(g),
            None if v is None else Decimal(str(v)),
            is_null=g is None,
        )
        for g, v in raw
    ]
    if top_n is not None and len(rows) > top_n:
        head, tail = rows[:top_n], rows[top_n:]
        other = sum((r.value or Decimal(0)) for r in tail)
        head.append(GroupRow("Other", other, is_other=True))
        rows = head
    return rows


# ---- drill-down rows --------------------------------------------------------

DRILL_ROW_CAP = 100


def drill_rows(
    db: Session, user: User, m: MetricDefinition,
    group_by: str | None, group_value: str | None,
):
    """Matching entity rows for a metric (optionally one group bucket).
    Returns (total, list of (id, project_id, label, sublabel))."""
    resolved = validate_metric(db, user, m)
    where = _scoped_base(db, user, m, resolved)
    cond = _conditions_clause(m, resolved)
    base = _entity_base(m, where)
    if cond is not None:
        base = base.where(cond)
    if group_by is not None:
        rf = _resolve_group_by(db, user, m, group_by, resolved)
        gexpr = _group_expr(rf)
        if group_value is None:
            base = base.where(gexpr.is_(None))
        elif rf.kind == "boolean":
            if group_value not in {"True", "False"}:
                raise ConfigError(
                    ["group_value must be 'True' or 'False' for a boolean group"]
                )
            base = base.where(gexpr == ("true" if group_value == "True" else "false"))
        else:
            base = base.where(gexpr == group_value)

    total = db.execute(
        select(func.count()).select_from(base.subquery())
    ).scalar_one()

    if m.entity == "project":
        q = base.with_only_columns(
            Project.id, Project.id.label("pid"),
            Project.title, Project.project_number,
        ).order_by(Project.title).limit(DRILL_ROW_CAP)
        rows = [
            (rid, pid, title, number or "—")
            for rid, pid, title, number in db.execute(q).all()
        ]
    elif m.entity == "milestone":
        q = base.with_only_columns(
            Milestone.id, Project.id, Milestone.name,
            Project.title, Milestone.planned_date,
        ).order_by(Milestone.planned_date.nulls_last()).limit(DRILL_ROW_CAP)
        rows = [
            (rid, pid, name, f"{ptitle} · planned {planned or '—'}")
            for rid, pid, name, ptitle, planned in db.execute(q).all()
        ]
    else:
        q = base.with_only_columns(
            COR.id, Project.id, COR.number, Project.title, COR.amount,
        ).order_by(COR.number).limit(DRILL_ROW_CAP)
        rows = [
            (rid, pid, f"COR {number}", f"{ptitle} · ${amount:,.2f}")
            for rid, pid, number, ptitle, amount in db.execute(q).all()
        ]
    return total, rows


# ---- block config validation ----------------------------------------------

def validate_block_config(
    db: Session, user: User, block_type: str, config: dict | None
) -> None:
    if block_type == "text":
        if config is None:
            return
        if not isinstance(config, dict):
            raise ConfigError(["config must be an object"])
        extra = set(config.keys()) - {"md", "size_preset"}
        if extra:
            raise ConfigError([f"unknown config key: {k}" for k in sorted(extra)])
        md = config.get("md", "")
        if not isinstance(md, str) or len(md) > 5000:
            raise ConfigError(["md must be a string of at most 5000 chars"])
        if config.get("size_preset", "body") not in TEXT_SIZE_PRESETS:
            raise ConfigError([f"unknown size_preset: {config.get('size_preset')}"])
        return
    if block_type == "metric":
        if config is None:
            return  # unconfigured card renders the "Configure" prompt
        try:
            parsed = MetricCardConfig.model_validate(config)
        except ValidationError as e:
            raise ConfigError([str(err["msg"]) for err in e.errors()])
        validate_metric(db, user, parsed.metric)
        return
    if block_type == "chart":
        if config is None:
            return
        try:
            parsed = ChartBlockConfig.model_validate(config)
        except ValidationError as e:
            raise ConfigError([str(err["msg"]) for err in e.errors()])
        resolved = validate_metric(db, user, parsed.metric)
        if parsed.metric.aggregation == "pct_of_total":
            raise ConfigError(["pct_of_total cannot be grouped"])
        _resolve_group_by(db, user, parsed.metric, parsed.group_by, resolved)
        return
    if block_type == "breakdown":
        if config is None:
            return
        try:
            parsed = BreakdownBlockConfig.model_validate(config)
        except ValidationError as e:
            raise ConfigError([str(err["msg"]) for err in e.errors()])
        first = parsed.columns[0].metric
        reasons: list[str] = []
        for col in parsed.columns[1:]:
            if col.metric.entity != first.entity:
                reasons.append("all columns must share the same entity")
            if col.metric.template_id != first.template_id:
                reasons.append("all columns must share the same template")
        if reasons:
            raise ConfigError(sorted(set(reasons)))
        resolved = None
        for col in parsed.columns:
            if col.metric.aggregation == "pct_of_total":
                raise ConfigError(["pct_of_total cannot be grouped"])
            resolved = validate_metric(db, user, col.metric)
        _resolve_group_by(db, user, first, parsed.group_by, resolved)
        return
    if block_type == "table":
        # The table block stores CONFIG only — its data path is the
        # existing GET /api/projects (frontend), which carries its own
        # auth/visibility. Here we validate the config against the
        # template's live fields/milestone defs (view_columns grammar).
        if config is None:
            return
        try:
            parsed = TableBlockConfig.model_validate(config)
        except ValidationError as e:
            raise ConfigError([str(err["msg"]) for err in e.errors()])
        template = db.get(Template, parsed.template_id)
        if template is None or template.deleted_at is not None:
            raise ConfigError(["template not found"])
        allowed = accessible_department_ids(user)
        if allowed is not None and template.department_id not in allowed:
            # Unified with the missing-template message: an out-of-scope
            # caller can't distinguish "exists but not mine" from
            # "doesn't exist".
            raise ConfigError(["template not found"])
        reasons: list[str] = []
        live_fields = {
            str(fd.id)
            for fd in db.execute(
                select(TemplateFieldDef).where(
                    TemplateFieldDef.template_id == template.id,
                    TemplateFieldDef.deleted_at.is_(None),
                )
            ).scalars()
        }
        live_milestones = {
            str(md.id)
            for md in db.execute(
                select(TemplateMilestoneDef).where(
                    TemplateMilestoneDef.template_id == template.id,
                    TemplateMilestoneDef.deleted_at.is_(None),
                )
            ).scalars()
        }
        seen: set[str] = set()
        for key in parsed.columns:
            if key in seen:
                # Aligned with view_columns.validate_columns' message.
                reasons.append(f"duplicate column key: {key}")
                continue
            seen.add(key)
            parsed_key = parse_column_key(key)
            if parsed_key is None:
                reasons.append(f"unknown column key: {key}")
                continue
            category, ident, _mode = parsed_key
            if category == "custom_field" and ident not in live_fields:
                reasons.append(f"field {ident} not on this template")
            if category == "milestone" and ident not in live_milestones:
                reasons.append(f"milestone {ident} not on this template")
        if parsed.sort is not None and parsed.sort not in SORTABLE_BUILTIN_KEYS:
            reasons.append(f"unsortable column: {parsed.sort}")
        if reasons:
            raise ConfigError(reasons)
        if parsed.conditions is not None and parsed.conditions.items:
            # Reuse the project condition validator/compiler; discard the
            # clause — we only need it to raise on bad refs/ops here.
            compile_project_conditions(db, user, parsed.template_id, parsed.conditions)
        return
    raise ConfigError([f"{block_type} blocks are not available yet"])
