"""Dashboard aggregate endpoints (Phase 2.0).

All endpoints are dept-scoped via the same `accessible_department_ids`
helper used by 1.9.3. Org admin sees everything; non-admins see only
their accessible departments' data.

The widgets are static — no per-user widget config in 2.0. Per-user
selection lands in 2.1, per-widget customization in 2.2.
"""
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import Numeric, case, func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.scope import accessible_department_ids
from backend.app.db.models import (
    COR,
    Milestone,
    Note,
    Project,
    Template,
    TemplateFieldDef,
    User,
    UserDashboard,
    UserDashboardWidget,
    NUMERIC_FIELD_TYPES,
    WIDGET_TYPES,
)
from backend.app.db.session import get_db
from backend.app.schemas.dashboard import (
    ActivityItem,
    ActivityResponse,
    CORStatusSummary,
    CORSummaryResponse,
    Dashboard,
    DashboardCreate,
    DashboardReorderRequest,
    DashboardUpdate,
    DashboardWidget,
    DashboardWidgetCreate,
    DashboardWidgetReorderRequest,
    DashboardWidgetUpdate,
    DashboardWidgetsResponse,
    DashboardsResponse,
    FieldAggregatePart,
    FieldAggregateResponse,
    LifecycleCounts,
    MilestoneLookaheadItem,
    MilestoneLookaheadResponse,
)
from backend.app.services.widget_config import ConfigError, validate_config

# Default widget set for a newly-arrived user — (widget_type, width).
# Matches the 2.0 visual layout: wide lifecycle on top, two narrow
# widgets in a row, wide CORs below.
DEFAULT_WIDGETS: tuple[tuple[str, int], ...] = (
    ("lifecycle", 2),
    ("milestone_lookahead", 1),
    ("recent_activity", 1),
    ("cor_summary", 2),
)

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


def _scoped_project_ids_subquery(
    db: Session,
    user: User,
    base_project_filter=None,
    *,
    department_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    discipline_id: uuid.UUID | None = None,
):
    """Build a SELECT of project ids the caller can see.

    Returns a SQLAlchemy select() that other queries can use via IN(...).
    `base_project_filter` is an extra WHERE clause applied to Project.
    The dept/client/discipline kwargs (Phase 2.5) further narrow via the
    Template JOIN — they don't bypass `accessible_department_ids`; if a
    user's config points at a dept they lost access to, the
    accessibility filter still wins and they see nothing.
    """
    allowed = accessible_department_ids(user)
    q = (
        select(Project.id)
        .join(Template, Project.template_id == Template.id)
        .where(Project.deleted_at.is_(None))
    )
    if base_project_filter is not None:
        q = q.where(base_project_filter)
    if allowed is not None:
        if not allowed:
            # Empty set — short-circuit by filtering on a never-true clause.
            q = q.where(Project.id.is_(None))
        else:
            q = q.where(Template.department_id.in_(allowed))
    if department_id is not None:
        q = q.where(Template.department_id == department_id)
    if client_id is not None:
        q = q.where(Template.client_id == client_id)
    if discipline_id is not None:
        q = q.where(Template.discipline_id == discipline_id)
    return q


@router.get("/projects/lifecycle", response_model=LifecycleCounts)
def lifecycle_counts(
    department_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    discipline_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> LifecycleCounts:
    project_ids = _scoped_project_ids_subquery(
        db,
        user,
        department_id=department_id,
        client_id=client_id,
        discipline_id=discipline_id,
    ).subquery()
    rows = db.execute(
        select(Project.lifecycle_state, func.count(Project.id))
        .where(Project.id.in_(select(project_ids.c.id)))
        .group_by(Project.lifecycle_state)
    ).all()
    counts = {state: 0 for state in (
        "draft", "active", "on_hold", "complete", "cancelled"
    )}
    for state, n in rows:
        counts[state] = n
    return LifecycleCounts(**counts)


@router.get(
    "/milestones/lookahead", response_model=MilestoneLookaheadResponse
)
def milestones_lookahead(
    future_days: int = Query(default=60, ge=0, le=365),
    limit: int = Query(default=200, ge=1, le=500),
    department_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    discipline_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MilestoneLookaheadResponse:
    today = date.today()
    latest = today + timedelta(days=future_days)

    project_ids = _scoped_project_ids_subquery(
        db,
        user,
        department_id=department_id,
        client_id=client_id,
        discipline_id=discipline_id,
    ).subquery()
    rows = db.execute(
        select(
            Milestone.id,
            Milestone.name,
            Milestone.direction,
            Milestone.planned_date,
            Milestone.template_milestone_def_id,
            Project.id,
            Project.title,
        )
        .join(Project, Milestone.project_id == Project.id)
        .where(
            Project.id.in_(select(project_ids.c.id)),
            Milestone.deleted_at.is_(None),
            Milestone.planned_date.isnot(None),
            # No lower bound: past-due milestones should surface regardless
            # of how long they've been overdue — that's the whole point of
            # a lookahead. Upper bound caps the upcoming window so we
            # don't drown the widget in milestones years out.
            Milestone.planned_date <= latest,
            # Hide milestones that already have an actual_date — the
            # lookahead is about *what still needs to happen*.
            Milestone.actual_date.is_(None),
        )
        # Past due first (planned_date asc), then upcoming (planned_date asc).
        # Same ORDER BY works for both halves because both are <= or >= today
        # and we just want chronological order with most-overdue at the top.
        .order_by(Milestone.planned_date.asc())
        .limit(limit)
    ).all()

    items = [
        MilestoneLookaheadItem(
            project_id=p_id,
            project_title=p_title,
            milestone_id=m_id,
            milestone_name=m_name,
            direction=m_dir,
            planned_date=m_planned,
            days_offset=(m_planned - today).days,
            ad_hoc=(m_def_id is None),
        )
        for (m_id, m_name, m_dir, m_planned, m_def_id, p_id, p_title) in rows
    ]
    return MilestoneLookaheadResponse(items=items, total=len(items))


@router.get("/cors/summary", response_model=CORSummaryResponse)
def cor_summary(
    department_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    discipline_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CORSummaryResponse:
    project_ids = _scoped_project_ids_subquery(
        db,
        user,
        department_id=department_id,
        client_id=client_id,
        discipline_id=discipline_id,
    ).subquery()
    rows = db.execute(
        select(
            COR.status,
            func.count(COR.id),
            func.coalesce(func.sum(COR.amount), 0),
        )
        .where(
            COR.project_id.in_(select(project_ids.c.id)),
            COR.deleted_at.is_(None),
        )
        .group_by(COR.status)
        .order_by(COR.status.asc())
    ).all()
    summaries = [
        CORStatusSummary(status=s, count=n, total_amount=Decimal(str(amt)))
        for s, n, amt in rows
    ]
    return CORSummaryResponse(by_status=summaries)


@router.get("/activity/recent", response_model=ActivityResponse)
def recent_activity(
    limit: int = Query(default=10, ge=1, le=50),
    department_id: uuid.UUID | None = None,
    client_id: uuid.UUID | None = None,
    discipline_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ActivityResponse:
    project_ids = _scoped_project_ids_subquery(
        db,
        user,
        department_id=department_id,
        client_id=client_id,
        discipline_id=discipline_id,
    ).subquery()
    rows = db.execute(
        select(
            Note.id,
            Note.body,
            Note.created_at,
            Project.id,
            Project.title,
            User.display_name,
        )
        .join(Project, Note.project_id == Project.id)
        .join(User, Note.created_by == User.id)
        .where(
            Project.id.in_(select(project_ids.c.id)),
            Note.deleted_at.is_(None),
        )
        .order_by(Note.created_at.desc(), Note.id.desc())
        .limit(limit)
    ).all()
    items = [
        ActivityItem(
            kind="note",
            project_id=p_id,
            project_title=p_title,
            author_name=author,
            body_preview=(body[:140] + "…") if len(body) > 140 else body,
            created_at=created,
        )
        for (_n_id, body, created, p_id, p_title, author) in rows
    ]
    return ActivityResponse(items=items)


# ---- per-user dashboards + widgets (Phases 2.1 + 2.4) --------------------
#
# Phase 2.4 introduced multi-dashboard (tabbed) support. The original
# `/api/dashboard/widgets*` endpoints from 2.1 became
# `/api/dashboards/{dashboard_id}/widgets*` under a separate router
# below. Dashboards CRUD (list / create / patch / delete / reorder)
# lives on that router too. Data endpoints (`/api/dashboard/*`) stay
# on `router` — they're keyed only by accessible_department_ids and
# don't care which dashboard the caller is viewing.

dashboards_router = APIRouter(
    prefix="/api/dashboards", tags=["dashboards"]
)


def _user_dashboards(db: Session, user_id) -> list[UserDashboard]:
    return (
        db.execute(
            select(UserDashboard)
            .where(UserDashboard.user_id == user_id)
            .order_by(UserDashboard.order_index.asc())
        )
        .scalars()
        .all()
    )


def _ensure_dashboard_initialized(
    db: Session, user_id
) -> list[UserDashboard]:
    """Lazy-init: if the user has no dashboards, create one called
    "Dashboard" so the first GET has a tab to render. Widget defaults
    materialize separately when that dashboard's widgets are first
    listed."""
    rows = _user_dashboards(db, user_id)
    if rows:
        return rows
    db.add(UserDashboard(user_id=user_id, name="Dashboard", order_index=0))
    db.commit()
    return _user_dashboards(db, user_id)


def _fetch_dashboard(
    db: Session, user_id, dashboard_id: uuid.UUID
) -> UserDashboard:
    """Fetch the caller's dashboard or 404 (hides cross-user IDs)."""
    obj = db.get(UserDashboard, dashboard_id)
    if obj is None or obj.user_id != user_id:
        raise HTTPException(status_code=404, detail="Dashboard not found")
    return obj


def _dashboard_widgets(
    db: Session, dashboard_id
) -> list[UserDashboardWidget]:
    return (
        db.execute(
            select(UserDashboardWidget)
            .where(UserDashboardWidget.dashboard_id == dashboard_id)
            .order_by(UserDashboardWidget.order_index.asc())
        )
        .scalars()
        .all()
    )


def _ensure_widgets_initialized(
    db: Session, user_id, dashboard_id
) -> list[UserDashboardWidget]:
    """If the dashboard has no widgets, materialize the default set.
    Idempotent — concurrent first-GETs are caught by the partial unique
    index on (dashboard_id, widget_type) and the loser swallows."""
    rows = _dashboard_widgets(db, dashboard_id)
    if rows:
        return rows
    for i, (wt, w) in enumerate(DEFAULT_WIDGETS):
        db.add(
            UserDashboardWidget(
                user_id=user_id,
                dashboard_id=dashboard_id,
                widget_type=wt,
                order_index=i,
                width=w,
            )
        )
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return _dashboard_widgets(db, dashboard_id)


def _to_dashboard_payload(d: UserDashboard) -> Dashboard:
    return Dashboard(id=d.id, name=d.name, order_index=d.order_index)


def _to_widget_payload(w: UserDashboardWidget) -> DashboardWidget:
    return DashboardWidget(
        id=w.id,
        dashboard_id=w.dashboard_id,
        widget_type=w.widget_type,
        order_index=w.order_index,
        width=w.width,
        column_pos=w.column_pos,
        title=w.title,
        config=w.config,
    )


# ---- dashboards CRUD ----------------------------------------------------


@dashboards_router.get("", response_model=DashboardsResponse)
def list_dashboards(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardsResponse:
    rows = _ensure_dashboard_initialized(db, user.id)
    return DashboardsResponse(
        items=[_to_dashboard_payload(r) for r in rows]
    )


@dashboards_router.post(
    "", response_model=Dashboard, status_code=status.HTTP_201_CREATED
)
def create_dashboard(
    payload: DashboardCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dashboard:
    # Append at max(order_index) + 1.
    current_max = db.execute(
        select(func.max(UserDashboard.order_index)).where(
            UserDashboard.user_id == user.id
        )
    ).scalar()
    next_index = 0 if current_max is None else current_max + 1
    obj = UserDashboard(
        user_id=user.id, name=payload.name.strip(), order_index=next_index
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _to_dashboard_payload(obj)


@dashboards_router.patch(
    "/{dashboard_id}", response_model=Dashboard
)
def update_dashboard(
    dashboard_id: uuid.UUID,
    payload: DashboardUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Dashboard:
    obj = _fetch_dashboard(db, user.id, dashboard_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        obj.name = data["name"].strip()
    db.commit()
    db.refresh(obj)
    return _to_dashboard_payload(obj)


@dashboards_router.delete(
    "/{dashboard_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_dashboard(
    dashboard_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    obj = _fetch_dashboard(db, user.id, dashboard_id)
    # Refuse to delete the user's last dashboard — they'd have nothing
    # to render. Add another tab first.
    remaining = db.execute(
        select(func.count(UserDashboard.id)).where(
            UserDashboard.user_id == user.id
        )
    ).scalar_one()
    if remaining <= 1:
        raise HTTPException(
            status_code=422,
            detail="Cannot delete your last dashboard",
        )
    db.delete(obj)  # CASCADE drops widget rows
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@dashboards_router.post(
    "/reorder", status_code=status.HTTP_204_NO_CONTENT
)
def reorder_dashboards(
    payload: DashboardReorderRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    ordered_ids = payload.ordered_ids
    if len(set(ordered_ids)) != len(ordered_ids):
        raise HTTPException(
            status_code=422, detail="ordered_ids contains duplicates"
        )
    live_rows = _user_dashboards(db, user.id)
    live_by_id = {row.id: row for row in live_rows}
    incoming_set = set(ordered_ids)
    live_set = set(live_by_id.keys())
    missing = live_set - incoming_set
    extra = incoming_set - live_set
    if missing or extra:
        reasons: list[str] = []
        for mid in missing:
            reasons.append(f"missing id: {mid}")
        for eid in extra:
            reasons.append(f"not yours: {eid}")
        raise HTTPException(status_code=422, detail=reasons)
    for position, item_id in enumerate(ordered_ids):
        live_by_id[item_id].order_index = position
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---- widgets (nested under a specific dashboard) ------------------------


@dashboards_router.get(
    "/{dashboard_id}/widgets", response_model=DashboardWidgetsResponse
)
def list_widgets(
    dashboard_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardWidgetsResponse:
    _fetch_dashboard(db, user.id, dashboard_id)
    rows = _ensure_widgets_initialized(db, user.id, dashboard_id)
    return DashboardWidgetsResponse(
        items=[_to_widget_payload(r) for r in rows]
    )


@dashboards_router.post(
    "/{dashboard_id}/widgets",
    response_model=DashboardWidget,
    status_code=status.HTTP_201_CREATED,
)
def add_widget(
    dashboard_id: uuid.UUID,
    payload: DashboardWidgetCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardWidget:
    _fetch_dashboard(db, user.id, dashboard_id)
    if payload.widget_type not in WIDGET_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"unknown widget_type: {payload.widget_type}",
        )
    try:
        validate_config(db, payload.widget_type, payload.config, user=user)
    except ConfigError as e:
        raise HTTPException(status_code=422, detail=e.reasons)

    # Materialize defaults if this dashboard is fresh so we don't fight
    # the partial unique on a subsequent auto-init.
    _ensure_widgets_initialized(db, user.id, dashboard_id)

    current_max = db.execute(
        select(func.max(UserDashboardWidget.order_index)).where(
            UserDashboardWidget.dashboard_id == dashboard_id
        )
    ).scalar()
    next_index = 0 if current_max is None else current_max + 1

    obj = UserDashboardWidget(
        user_id=user.id,
        dashboard_id=dashboard_id,
        widget_type=payload.widget_type,
        order_index=next_index,
        config=payload.config,
    )
    db.add(obj)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Widget already on this dashboard"
        )
    db.commit()
    db.refresh(obj)
    return _to_widget_payload(obj)


@dashboards_router.delete(
    "/{dashboard_id}/widgets/{widget_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def remove_widget(
    dashboard_id: uuid.UUID,
    widget_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    obj = db.get(UserDashboardWidget, widget_id)
    # 404 catches three cases: row missing, wrong user, OR widget id
    # belongs to a different dashboard than the URL says. Avoids
    # cross-dashboard manipulation by id.
    if (
        obj is None
        or obj.user_id != user.id
        or obj.dashboard_id != dashboard_id
    ):
        raise HTTPException(status_code=404, detail="Widget not found")
    db.delete(obj)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@dashboards_router.post(
    "/{dashboard_id}/widgets/reorder",
    status_code=status.HTTP_204_NO_CONTENT,
)
def reorder_widgets(
    dashboard_id: uuid.UUID,
    payload: DashboardWidgetReorderRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    _fetch_dashboard(db, user.id, dashboard_id)

    # Exactly one of ordered_ids / items must be provided.
    if (payload.ordered_ids is None) == (payload.items is None):
        raise HTTPException(
            status_code=422,
            detail="exactly one of ordered_ids or items must be provided",
        )

    if payload.items is not None:
        # New shape: each entry carries its own column.
        items = payload.items
        ordered_ids = [it.id for it in items]
        column_by_id = {it.id: it.column for it in items}
    else:
        # Legacy shape: column defaults to 0 for every widget.
        assert payload.ordered_ids is not None
        ordered_ids = payload.ordered_ids
        column_by_id = {wid: 0 for wid in ordered_ids}

    if len(set(ordered_ids)) != len(ordered_ids):
        raise HTTPException(
            status_code=422, detail="reorder request contains duplicate ids"
        )

    live_rows = _dashboard_widgets(db, dashboard_id)
    live_by_id = {row.id: row for row in live_rows}
    incoming_set = set(ordered_ids)
    live_set = set(live_by_id.keys())
    missing = live_set - incoming_set
    extra = incoming_set - live_set
    if missing or extra:
        reasons: list[str] = []
        for mid in missing:
            reasons.append(f"missing id: {mid}")
        for eid in extra:
            reasons.append(f"not on this dashboard: {eid}")
        raise HTTPException(status_code=422, detail=reasons)

    for position, item_id in enumerate(ordered_ids):
        row = live_by_id[item_id]
        row.order_index = position
        row.column_pos = column_by_id[item_id]
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@dashboards_router.patch(
    "/{dashboard_id}/widgets/{widget_id}", response_model=DashboardWidget
)
def update_widget(
    dashboard_id: uuid.UUID,
    widget_id: uuid.UUID,
    payload: DashboardWidgetUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DashboardWidget:
    obj = db.get(UserDashboardWidget, widget_id)
    if (
        obj is None
        or obj.user_id != user.id
        or obj.dashboard_id != dashboard_id
    ):
        raise HTTPException(status_code=404, detail="Widget not found")

    data = payload.model_dump(exclude_unset=True)
    if "config" in data:
        try:
            validate_config(db, obj.widget_type, data["config"], user=user)
        except ConfigError as e:
            raise HTTPException(status_code=422, detail=e.reasons)
        obj.config = data["config"]
    if "width" in data and data["width"] is not None:
        obj.width = data["width"]
    if "title" in data:
        raw = data["title"]
        obj.title = raw.strip() if isinstance(raw, str) and raw.strip() else None

    db.commit()
    db.refresh(obj)
    return _to_widget_payload(obj)


# ---- field_aggregate data endpoint --------------------------------------


@router.get("/field_aggregate", response_model=FieldAggregateResponse)
def field_aggregate(
    template_id: uuid.UUID,
    primary_field_id: uuid.UUID,
    secondary_field_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> FieldAggregateResponse:
    """Sum a numeric custom field across all live projects on a template
    (dept-scoped). Optionally sums a second field for "X vs Y" displays.
    """
    # Template must exist and be in the caller's dept scope; reuse the
    # _scoped_project_ids_subquery filter to enforce scope.
    template = db.get(Template, template_id)
    if template is None or template.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Template not found")

    allowed = accessible_department_ids(user)
    if allowed is not None and template.department_id not in allowed:
        # Out-of-scope template: same 404 as a missing one.
        raise HTTPException(status_code=404, detail="Template not found")

    def _resolve_field(field_id: uuid.UUID) -> TemplateFieldDef:
        fd = db.get(TemplateFieldDef, field_id)
        if (
            fd is None
            or fd.deleted_at is not None
            or fd.template_id != template_id
        ):
            raise HTTPException(
                status_code=422,
                detail=f"field {field_id} not on template {template_id}",
            )
        if fd.field_type not in NUMERIC_FIELD_TYPES:
            raise HTTPException(
                status_code=422,
                detail=f"field {fd.name} is not numeric ({fd.field_type})",
            )
        return fd

    primary_fd = _resolve_field(primary_field_id)
    secondary_fd = (
        _resolve_field(secondary_field_id)
        if secondary_field_id is not None
        else None
    )

    def _aggregate(fd: TemplateFieldDef) -> FieldAggregatePart:
        # custom_field_values is JSONB keyed by stringified field def id.
        # The ->> operator returns text; cast to numeric and SUM. NULLs
        # coalesce to 0; project_count includes only projects with a
        # non-NULL value.
        sql_total = func.coalesce(
            func.sum(
                func.cast(
                    Project.custom_field_values.op("->>")(str(fd.id)),
                    Numeric,
                )
            ),
            0,
        )
        sql_count = func.count(
            Project.custom_field_values.op("->>")(str(fd.id))
        )
        row = db.execute(
            select(sql_total, sql_count).where(
                Project.template_id == template_id,
                Project.deleted_at.is_(None),
            )
        ).one()
        return FieldAggregatePart(
            field_name=fd.name,
            field_type=fd.field_type,
            total=Decimal(str(row[0])),
            project_count=row[1],
        )

    return FieldAggregateResponse(
        primary=_aggregate(primary_fd),
        secondary=_aggregate(secondary_fd) if secondary_fd is not None else None,
    )
