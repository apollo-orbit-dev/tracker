"""Projects CRUD + lifecycle transition.

POST creates a project AND auto-spawns one milestone per live
template_milestone_def. PATCH merges custom_field_values key-by-key
(null removes a key). Lifecycle changes go through the dedicated
transition endpoint so the state machine + readiness checks are
bundled.
"""
import csv
import io
import json
import uuid
from datetime import date, datetime, timezone
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    Response,
    UploadFile,
    status,
)
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy import func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.roles import DEPARTMENT_MANAGER, PROJECT_EDITOR
from backend.app.auth.scope import (
    accessible_department_ids,
    assert_can_edit_dept,
    assert_can_edit_project,
    assert_can_manage_dept,
    assert_can_view_project,
    directly_granted_project_ids,
    has_role_in_dept,
)
from backend.app.db.models import (
    Client,
    Department,
    Discipline,
    Milestone,
    Project,
    Template,
    TemplateFieldDef,
    TemplateMilestoneDef,
    User,
)
from backend.app.schemas.templates import FieldDefOut
from backend.app.db.session import get_db
from backend.app.schemas.projects import (
    ImportError as ImportErrorRow,
    ImportResult,
    ImportSkipped,
    MilestoneCreate,
    MilestoneOut,
    MilestoneReorderRequest,
    MilestoneUpdate,
    ProjectCreate,
    ProjectDetailOut,
    ProjectListResponse,
    ProjectOut,
    ProjectUpdate,
    TransitionRequest,
)
from backend.app.services.audit import diff, record_audit
from backend.app.services.custom_field_values import (
    ValidationError,
    merge_values,
    validate_values,
)
from backend.app.services.project_create import (
    ProjectNumberConflict,
    create_project_record,
    live_field_defs as _live_field_defs,
    live_milestone_defs as _live_milestone_defs,
)
from backend.app.services.lifecycle import (
    LifecycleError,
    assert_transition_allowed,
    check_active_readiness,
    valid_next_states,
)
from backend.app.services.ref_labels import collect_ref_labels
from backend.app.schemas.views import MetricConditions
from backend.app.services.metric_engine import (
    ConfigError,
    compile_project_conditions,
)

router = APIRouter(prefix="/api/projects", tags=["projects"])


# Whitelist of sort keys -> SQLAlchemy column expressions. Maps the
# enum strings exposed in the API to the actual ORM columns. Any key
# not in this dict is rejected by the route handler — no string
# concatenation reaches SQL.
_SORT_COLUMNS = {
    "project_number": Project.project_number,
    "client_number": Project.client_project_number,
    "title": Project.title,
    "lifecycle": Project.lifecycle_state,
    "created_at": Project.created_at,
    "updated_at": Project.updated_at,
}


def _fetch_project(db: Session, pid: uuid.UUID) -> Project:
    """Fetch a live project with `template` eager-loaded so scope helpers
    can read template.department_id without an extra query."""
    obj = db.execute(
        select(Project)
        .options(selectinload(Project.template))
        .where(Project.id == pid)
    ).scalar_one_or_none()
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Project not found")
    return obj


def _fetch_project_for_read(
    db: Session, user: User, pid: uuid.UUID
) -> Project:
    """Fetch a live project, 404-ing if the caller can't see its dept."""
    obj = _fetch_project(db, pid)
    assert_can_view_project(user, obj)
    return obj


def _fetch_project_for_edit(
    db: Session, user: User, pid: uuid.UUID
) -> Project:
    """Fetch a live project, 403 if the caller isn't project_editor+ in
    its dept. Returns the project; callers can mutate it directly."""
    obj = _fetch_project(db, pid)
    assert_can_edit_project(user, obj)
    return obj


def _template_meta_for(
    db: Session, template_ids: set[uuid.UUID]
) -> dict[uuid.UUID, dict[str, str]]:
    """Look up template name + dept/client/discipline codes for the
    given template IDs. Returns a map keyed by template_id with
    `{"name", "intersection"}` per row.

    Phase 3.0.3: embedded into project responses so direct-grant users
    (who can read a project but not the dept-scoped /api/admin/templates
    endpoint) still see the template name and DEPT · CLIENT · DISC
    intersection on the list and detail pages.
    """
    if not template_ids:
        return {}
    templates = (
        db.execute(
            select(Template).where(Template.id.in_(template_ids))
        )
        .scalars()
        .all()
    )
    dept_ids = {t.department_id for t in templates}
    client_ids = {t.client_id for t in templates}
    disc_ids = {t.discipline_id for t in templates}
    dept_map = dict(
        db.execute(
            select(Department.id, Department.code).where(
                Department.id.in_(dept_ids)
            )
        ).all()
    )
    client_map = dict(
        db.execute(
            select(Client.id, Client.code).where(Client.id.in_(client_ids))
        ).all()
    )
    disc_map = dict(
        db.execute(
            select(Discipline.id, Discipline.code).where(
                Discipline.id.in_(disc_ids)
            )
        ).all()
    )
    return {
        t.id: {
            "name": t.name,
            "intersection": (
                f"{dept_map.get(t.department_id, '?')}"
                f" · {client_map.get(t.client_id, '?')}"
                f" · {disc_map.get(t.discipline_id, '?')}"
            ),
        }
        for t in templates
    }


def _decorate_with_template_meta(
    row: Project, meta: dict[str, str] | None
) -> Project:
    """Attach template_name + template_intersection to a Project row so
    `ProjectOut.model_validate(row)` can read them. Falls back to '?' if
    the template is missing (defensive — should never happen because the
    project's template_id is a NOT NULL FK)."""
    if meta is None:
        row.template_name = "?"
        row.template_intersection = "?"
    else:
        row.template_name = meta["name"]
        row.template_intersection = meta["intersection"]
    return row


def _detail_out(
    db: Session,
    user: User,
    project: Project,
    milestones: list[Milestone],
) -> ProjectDetailOut:
    """Build a ProjectDetailOut including the per-user `can_edit` and
    `can_manage_access` flags plus embedded template metadata and live
    field defs (Phase 3.0.3 — direct-grant users would otherwise see
    blank template info on the detail page).

    `project.template` must be eager-loaded; helpers above guarantee this
    for the read/edit fetch paths, and `create_project` passes the freshly
    fetched template's dept directly via has_role_in_dept's contract.
    """
    dept_id = project.template.department_id
    can_edit = has_role_in_dept(user, dept_id, PROJECT_EDITOR)
    can_manage_access = has_role_in_dept(user, dept_id, DEPARTMENT_MANAGER)

    meta_map = _template_meta_for(db, {project.template_id})
    _decorate_with_template_meta(project, meta_map.get(project.template_id))
    field_defs = _live_field_defs(db, project.template_id)

    return ProjectDetailOut(
        **ProjectOut.model_validate(project).model_dump(exclude={"milestones"}),
        milestones=[MilestoneOut.model_validate(m) for m in milestones],
        valid_next_states=sorted(valid_next_states(project.lifecycle_state)),
        can_edit=can_edit,
        can_manage_access=can_manage_access,
        template_field_defs=[FieldDefOut.model_validate(fd) for fd in field_defs],
    )


def _fetch_template(db: Session, tid: uuid.UUID) -> Template:
    obj = db.get(Template, tid)
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(
            status_code=422, detail="Template not found or soft-deleted"
        )
    return obj


def _live_milestones(db: Session, project_id: uuid.UUID) -> list[Milestone]:
    return (
        db.execute(
            select(Milestone)
            .where(
                Milestone.project_id == project_id,
                Milestone.deleted_at.is_(None),
            )
            .order_by(Milestone.order_index.asc(), Milestone.created_at.asc())
        )
        .scalars()
        .all()
    )


# ---- read endpoints (viewer+) -------------------------------------------


@router.get("", response_model=ProjectListResponse)
def list_projects(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    template_id: uuid.UUID | None = Query(default=None),
    # Phase 4.8.14: filter by template taxonomy. Useful for "projects
    # under DIV1 across all clients", "everything for CON regardless of
    # discipline", etc. Composable with template_id (rarely useful but
    # not blocked).
    department_id: uuid.UUID | None = Query(default=None),
    client_id: uuid.UUID | None = Query(default=None),
    discipline_id: uuid.UUID | None = Query(default=None),
    lifecycle_state: str | None = Query(default=None),
    q: str | None = Query(default=None),
    # Phase 7.17: optional JSON-encoded MetricConditions over project
    # fields, validated/compiled through the metric engine. Requires
    # template_id (refs belong to one template). Additive — only the
    # table block passes it.
    conditions: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    sort_direction: str | None = Query(default=None),
    expand_milestones: bool = Query(default=False),
    expand_refs: bool = Query(default=False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectListResponse:
    allowed = accessible_department_ids(user)
    direct = directly_granted_project_ids(user)
    base = select(Project).where(Project.deleted_at.is_(None))
    # Whether the Project→Template join has already been applied. The
    # visibility scope above joins it for dept-scoped users; the
    # taxonomy filters below need it for everyone. Track the flag so
    # we don't double-join (SQLAlchemy raises) when both apply.
    template_joined = False
    if allowed is not None:
        if not allowed and not direct:
            return ProjectListResponse(items=[], total=0, limit=limit, offset=offset)
        # Phase 3.0.3: visibility is "projects in the caller's accessible
        # depts" OR "projects the caller has a direct project_role_assignment
        # on." Both clauses share an INNER JOIN on Template since
        # template_id is NOT NULL — one row per project, no duplicates
        # even when a project satisfies both clauses.
        base = base.join(Template, Project.template_id == Template.id)
        template_joined = True
        clauses = []
        if allowed:
            clauses.append(Template.department_id.in_(allowed))
        if direct:
            clauses.append(Project.id.in_(direct))
        base = base.where(or_(*clauses))
    if template_id is not None:
        base = base.where(Project.template_id == template_id)
    if (
        department_id is not None
        or client_id is not None
        or discipline_id is not None
    ):
        if not template_joined:
            base = base.join(Template, Project.template_id == Template.id)
            template_joined = True
        if department_id is not None:
            base = base.where(Template.department_id == department_id)
        if client_id is not None:
            base = base.where(Template.client_id == client_id)
        if discipline_id is not None:
            base = base.where(Template.discipline_id == discipline_id)
    if lifecycle_state is not None:
        base = base.where(Project.lifecycle_state == lifecycle_state)
    # Phase 2.6: free-text search across title + project # + client #.
    # Whitespace-only `q` is treated as no filter so a stray space in
    # the search box doesn't yield an empty list.
    if q is not None:
        needle = q.strip()
        if needle:
            pattern = f"%{needle}%"
            base = base.where(
                Project.title.ilike(pattern)
                | Project.project_number.ilike(pattern)
                | func.coalesce(Project.client_project_number, "").ilike(pattern)
            )
    # Phase 7.17: field conditions. Validated through the metric engine
    # (refs checked against a template the caller can access; bad
    # refs/ops -> 422) and compiled to bound parameters. Applied on top
    # of the visibility scope above — it narrows, never widens.
    if conditions is not None:
        if template_id is None:
            raise HTTPException(
                status_code=422, detail="conditions require template_id"
            )
        try:
            parsed_conditions = MetricConditions.model_validate_json(conditions)
        except PydanticValidationError:
            raise HTTPException(status_code=422, detail="invalid conditions")
        try:
            clause = compile_project_conditions(
                db, user, template_id, parsed_conditions
            )
        except ConfigError as e:
            raise HTTPException(status_code=422, detail=e.reasons)
        if clause is not None:
            base = base.where(clause)
    # Phase 2.7.2: sort whitelist. When `sort` is omitted, fall back to
    # the existing default (created_at DESC). When set, it must be one
    # of the keys in _SORT_COLUMNS — anything else is 422 (caller error,
    # not a 500). Direction defaults to 'desc' if omitted.
    if sort is not None:
        if sort not in _SORT_COLUMNS:
            raise HTTPException(
                status_code=422,
                detail=f"unknown sort key: {sort}",
            )
        direction = (sort_direction or "desc").lower()
        if direction not in ("asc", "desc"):
            raise HTTPException(
                status_code=422,
                detail="sort_direction must be 'asc' or 'desc'",
            )
        col = _SORT_COLUMNS[sort]
        base = base.order_by(col.asc() if direction == "asc" else col.desc())
    else:
        base = base.order_by(Project.created_at.desc())

    total = db.execute(
        select(func.count()).select_from(base.subquery())
    ).scalar_one()

    page_query = base.limit(limit).offset(offset)
    if expand_milestones:
        # Eager-load to avoid N+1 when the response includes milestones.
        page_query = page_query.options(selectinload(Project.milestones))

    rows = db.execute(page_query).scalars().all()

    # Phase 3.0.3: embed template_name + intersection per project so the
    # list renders correctly for direct-grant users (who can't read the
    # dept-scoped /api/admin/templates endpoint to build a lookup).
    template_meta_map = _template_meta_for(
        db, {r.template_id for r in rows}
    )

    items: list[ProjectOut] = []
    for row in rows:
        _decorate_with_template_meta(
            row, template_meta_map.get(row.template_id)
        )
        item = ProjectOut.model_validate(row)
        if expand_milestones:
            live = [m for m in row.milestones if m.deleted_at is None]
            live.sort(key=lambda m: (m.order_index, m.created_at))
            item.milestones = [MilestoneOut.model_validate(m) for m in live]
        items.append(item)

    response_kwargs: dict[str, Any] = {
        "items": items,
        "total": total,
        "limit": limit,
        "offset": offset,
    }
    if expand_refs and items:
        # Look up the template's live field defs once (we need their
        # types). When template_id is filtered, there's a single set;
        # otherwise fetch field defs for every template represented in
        # the page.
        if template_id is not None:
            field_defs = _live_field_defs(db, template_id)
        else:
            template_ids = {row.template_id for row in rows}
            field_defs = list(
                db.execute(
                    select(TemplateFieldDef).where(
                        TemplateFieldDef.template_id.in_(template_ids),
                        TemplateFieldDef.deleted_at.is_(None),
                    )
                ).scalars()
            )
        response_kwargs["ref_labels"] = collect_ref_labels(
            db, projects=rows, live_field_defs=field_defs
        )

    return ProjectListResponse(**response_kwargs)


# ---- export (Phase 5.4) ---------------------------------------------------


@router.get("/export")
def export_projects(
    template_id: uuid.UUID = Query(...),
    format: str = Query(..., pattern="^(csv|xlsx)$"),
    columns: str = Query(...),
    lifecycle_state: str | None = Query(default=None),
    department_id: uuid.UUID | None = Query(default=None),
    client_id: uuid.UUID | None = Query(default=None),
    discipline_id: uuid.UUID | None = Query(default=None),
    q: str | None = Query(default=None),
    sort: str | None = Query(default=None),
    sort_direction: str | None = Query(default=None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """Stream a CSV or XLSX of the current Saved View.

    Reuses the project-list query for the same filter/sort behavior the
    user sees on the page. Anyone who can see the Saved View can export
    (no DM gate — read-only). Caps at EXPORT_ROW_CAP rows; over the cap
    returns 422 so the user can tighten filters.
    """
    from backend.app.services.project_export import (
        EXPORT_ROW_CAP,
        ColumnsError,
        gather_export_context,
        header_label,
        render_csv,
        render_row,
        render_xlsx,
        slug_for_filename,
        validate_export_columns,
    )

    template = _fetch_template(db, template_id)
    # Visibility: same dept-scope rule as the list endpoint. Reject 404
    # to match the existence-hiding pattern used elsewhere.
    allowed = accessible_department_ids(user)
    if allowed is not None and template.department_id not in allowed:
        # A direct-grant user might still have visibility into some
        # projects under this template; fall through and let the row
        # query do the work (it filters via direct grants too).
        if not directly_granted_project_ids(user):
            raise HTTPException(status_code=404, detail="Template not found")

    # Parse + validate columns against the template's live defs.
    field_ids = {
        fd.id
        for fd in _live_field_defs(db, template.id)
    }
    milestone_ids = {
        md.id
        for md in _live_milestone_defs(db, template.id)
    }
    col_keys = [c for c in columns.split(",") if c]
    try:
        parsed_keys = validate_export_columns(
            col_keys,
            live_custom_field_ids=field_ids,
            live_milestone_def_ids=milestone_ids,
        )
    except ColumnsError as e:
        raise HTTPException(status_code=422, detail=e.message)

    # Build the row query — same scope/filter shape as list_projects.
    base = select(Project).where(
        Project.deleted_at.is_(None),
        Project.template_id == template.id,
    )
    template_joined = False
    direct = directly_granted_project_ids(user)
    if allowed is not None:
        if not allowed and not direct:
            return _empty_export(parsed_keys, format, template, field_ids, milestone_ids, db)
        base = base.join(Template, Project.template_id == Template.id)
        template_joined = True
        clauses = []
        if allowed:
            clauses.append(Template.department_id.in_(allowed))
        if direct:
            clauses.append(Project.id.in_(direct))
        base = base.where(or_(*clauses))
    if (
        department_id is not None
        or client_id is not None
        or discipline_id is not None
    ):
        if not template_joined:
            base = base.join(Template, Project.template_id == Template.id)
            template_joined = True
        if department_id is not None:
            base = base.where(Template.department_id == department_id)
        if client_id is not None:
            base = base.where(Template.client_id == client_id)
        if discipline_id is not None:
            base = base.where(Template.discipline_id == discipline_id)
    if lifecycle_state is not None:
        base = base.where(Project.lifecycle_state == lifecycle_state)
    if q is not None:
        needle = q.strip()
        if needle:
            pattern = f"%{needle}%"
            base = base.where(
                Project.title.ilike(pattern)
                | Project.project_number.ilike(pattern)
                | func.coalesce(Project.client_project_number, "").ilike(pattern)
            )
    if sort is not None:
        if sort not in _SORT_COLUMNS:
            raise HTTPException(status_code=422, detail=f"unknown sort key: {sort}")
        direction = (sort_direction or "desc").lower()
        if direction not in ("asc", "desc"):
            raise HTTPException(
                status_code=422,
                detail="sort_direction must be 'asc' or 'desc'",
            )
        col = _SORT_COLUMNS[sort]
        base = base.order_by(col.asc() if direction == "asc" else col.desc())
    else:
        base = base.order_by(Project.created_at.desc())

    # Hard cap before loading rows.
    total = db.execute(
        select(func.count()).select_from(base.subquery())
    ).scalar_one()
    if total > EXPORT_ROW_CAP:
        raise HTTPException(
            status_code=422,
            detail=(
                f"Export limited to {EXPORT_ROW_CAP} rows; this query matched "
                f"{total}. Tighten the filters and try again."
            ),
        )

    rows = list(
        db.execute(base.options(selectinload(Project.milestones))).scalars()
    )

    field_defs_by_id, milestone_defs_by_id, ref_labels = gather_export_context(
        db, template=template, projects=rows
    )

    headers = [
        header_label(pk, field_defs_by_id, milestone_defs_by_id)
        for pk in parsed_keys
    ]
    body_rows = [
        render_row(p, parsed_keys, field_defs_by_id, ref_labels)
        for p in rows
    ]

    # Filename: DIV1-CON-DESIGN_2026-06-09.csv
    dept = db.get(Department, template.department_id)
    client_row = db.get(Client, template.client_id)
    disc = db.get(Discipline, template.discipline_id)
    stem = slug_for_filename(
        [
            dept.code if dept else "",
            client_row.code if client_row else "",
            disc.code if disc else "",
        ],
        date.today(),
    )

    if format == "csv":
        body = render_csv(headers, body_rows)
        return Response(
            content=body,
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{stem}.csv"',
            },
        )
    # xlsx
    intersection = " / ".join(
        s for s in [
            (dept.code if dept else None),
            (client_row.code if client_row else None),
            (disc.code if disc else None),
        ] if s
    )
    body = render_xlsx(headers, body_rows, intersection or "Projects")
    return Response(
        content=body,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": f'attachment; filename="{stem}.xlsx"',
        },
    )


def _empty_export(
    parsed_keys, format, template, field_ids, milestone_ids, db
) -> Response:
    """Render an empty CSV/XLSX (headers only) when the caller has no
    visibility — same shape as a zero-row export. Avoids leaking the
    fact that the template has projects the caller can't see."""
    from backend.app.services.project_export import (
        header_label,
        render_csv,
        render_xlsx,
        slug_for_filename,
    )
    fd_map = {str(fd.id): fd for fd in _live_field_defs(db, template.id)}
    md_map = {str(md.id): md for md in _live_milestone_defs(db, template.id)}
    headers = [header_label(pk, fd_map, md_map) for pk in parsed_keys]
    stem = slug_for_filename([], date.today())
    if format == "csv":
        return Response(
            content=render_csv(headers, []),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="{stem}.csv"',
            },
        )
    return Response(
        content=render_xlsx(headers, [], "Projects"),
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": f'attachment; filename="{stem}.xlsx"',
        },
    )


@router.get("/{pid}", response_model=ProjectDetailOut)
def get_project(
    pid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectDetailOut:
    obj = _fetch_project_for_read(db, user, pid)
    milestones = _live_milestones(db, obj.id)
    return _detail_out(db, user, obj, milestones)


# ---- write endpoints (project_editor+) ----------------------------------


@router.post(
    "", response_model=ProjectDetailOut, status_code=status.HTTP_201_CREATED
)
def create_project(
    payload: ProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectDetailOut:
    template = _fetch_template(db, payload.template_id)
    assert_can_edit_dept(user, template.department_id)
    try:
        project = create_project_record(
            db,
            user,
            template,
            project_number=payload.project_number,
            title=payload.title,
            custom_field_values=payload.custom_field_values,
            client_project_number=payload.client_project_number,
        )
    except ProjectNumberConflict:
        raise HTTPException(
            status_code=409,
            detail="A live project with that project number already exists.",
        )
    db.commit()
    db.refresh(project)

    milestones = _live_milestones(db, project.id)
    return _detail_out(db, user, project, milestones)


# Phase 5.3 — spreadsheet import.

_BUILTIN_FIELD_KEYS = frozenset(
    ("project_number", "client_project_number", "title")
)
# Placeholder for a blank/empty title (NOT-NULL column). Custom field
# values don't get a placeholder — `required` is enforced at the
# draft→active transition, not at create-time, so imported drafts are
# allowed to land with missing values that the DM fills in later.
_TITLE_PLACEHOLDER = "UPDATE"


# Phase 5.3.2: Excel-format normalization. CSVs exported from
# spreadsheets render currency as "$3,224.93", percent as "%56" or
# "56%", and dates as "3/6/2025". The validators in
# services/custom_field_values expect raw numbers + ISO dates, so we
# transform first and let the existing validator catch anything we
# couldn't parse.


def _parse_csv_date(raw: str) -> str | None:
    """Return an ISO `YYYY-MM-DD` string or None if unparseable."""
    s = raw.strip()
    if not s:
        return None
    # Try ISO first.
    try:
        return date.fromisoformat(s).isoformat()
    except ValueError:
        pass
    # US-first (m/d/yyyy or m-d-yyyy), 2 or 4 digit year. Then d/m/yyyy
    # as a fallback for non-US locales.
    for fmt in ("%m/%d/%Y", "%m-%d-%Y", "%m/%d/%y", "%m-%d-%y", "%d/%m/%Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def _normalize_import_value(raw: str, field_type: str, options: dict | None) -> Any | None:
    """Coerce a raw CSV cell into the shape the validator expects.

    Returns the normalized value, or None when the cell can't be made
    sense of (caller drops it silently — matches the behavior for
    cells that fail validation).
    """
    s = raw.strip()
    if not s:
        return None

    if field_type in {"short_text", "long_text", "url", "email", "phone"}:
        return s

    if field_type == "integer":
        cleaned = s.lstrip("$").rstrip("%").replace(",", "").strip()
        try:
            return int(float(cleaned))
        except ValueError:
            return None

    if field_type in {"decimal", "currency"}:
        cleaned = s.lstrip("$").rstrip("%").replace(",", "").strip()
        # Allow "%" prefix too (the maintainer's CSVs use "%56").
        if cleaned.startswith("%"):
            cleaned = cleaned[1:].strip()
        try:
            return float(cleaned)
        except ValueError:
            return None

    if field_type == "percent":
        cleaned = s.replace("%", "").replace(",", "").strip()
        try:
            return float(cleaned)
        except ValueError:
            return None

    if field_type == "auto_number":
        try:
            return int("".join(ch for ch in s if ch.isdigit()))
        except ValueError:
            return None

    if field_type == "date":
        return _parse_csv_date(s)

    if field_type == "boolean":
        if s.lower() in {"true", "yes", "y", "1", "t"}:
            return True
        if s.lower() in {"false", "no", "n", "0", "f"}:
            return False
        return None

    if field_type == "single_select":
        choices = (options or {}).get("choices") or []
        for c in choices:
            if c.lower() == s.lower():
                return c
        return None

    if field_type == "multi_select":
        choices = (options or {}).get("choices") or []
        parts = [p.strip() for p in s.replace(";", ",").split(",") if p.strip()]
        out: list[str] = []
        for p in parts:
            match = next((c for c in choices if c.lower() == p.lower()), None)
            if match is None:
                return None  # one unknown choice → reject whole list
            out.append(match)
        return out

    # date_planned_actual / date_range / duration / reference types:
    # not currently supported via CSV import (they need a multi-cell
    # mapping for the planned/actual pair, or a UUID lookup). Return
    # None so the cell is dropped.
    return None


@router.post(
    "/import", response_model=ImportResult, status_code=status.HTTP_200_OK
)
def import_projects(
    file: UploadFile = File(...),
    template_id: uuid.UUID = Form(...),
    mapping: str = Form(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ImportResult:
    """Bulk-create projects from a CSV.

    Multipart form: `file` (CSV), `template_id`, `mapping` (JSON
    `{csv_header: field_target}` where `field_target` is a built-in
    key — project_number / client_project_number / title — or a
    custom field def id).

    Skip rules: blank Project # → skipped; duplicate Project # (live or
    soft-deleted) → skipped. Title blank → placeholder "UPDATE".
    Per-value shape errors drop the value silently. Row-level
    constraint failures land in `errors`; other rows continue
    committing.

    All created projects land as `draft`. DM-or-up only.
    """
    template = _fetch_template(db, template_id)
    assert_can_manage_dept(user, template.department_id)

    # Parse mapping (JSON form field).
    try:
        raw_mapping = json.loads(mapping)
        if not isinstance(raw_mapping, dict):
            raise ValueError("mapping must be a JSON object")
    except (json.JSONDecodeError, ValueError) as e:
        raise HTTPException(status_code=422, detail=f"invalid mapping JSON: {e}")

    field_defs = _live_field_defs(db, template.id)
    field_def_ids = {str(fd.id) for fd in field_defs}
    field_def_by_id = {str(fd.id): fd for fd in field_defs}
    milestone_defs = _live_milestone_defs(db, template.id)
    milestone_def_by_id = {str(md.id): md for md in milestone_defs}

    # Validate mapping targets. Each value must be either a built-in
    # key, a live custom field def id, or a milestone target with
    # syntax `milestone:<uuid>[:planned|:actual]`. Reject early so a
    # malicious / buggy mapping never reaches DB writes.
    for col, target in raw_mapping.items():
        if not isinstance(target, str):
            raise HTTPException(
                status_code=422,
                detail=f"mapping target for column '{col}' must be a string",
            )
        if target in _BUILTIN_FIELD_KEYS:
            continue
        if target in field_def_ids:
            continue
        if target.startswith("milestone:"):
            parts = target.split(":")
            # `milestone:<uuid>` or `milestone:<uuid>:planned|actual`
            if len(parts) not in (2, 3):
                raise HTTPException(
                    status_code=422,
                    detail=f"mapping target for column '{col}' has invalid milestone syntax",
                )
            md_id = parts[1]
            slot = parts[2] if len(parts) == 3 else None
            md = milestone_def_by_id.get(md_id)
            if md is None:
                raise HTTPException(
                    status_code=422,
                    detail=f"mapping target for column '{col}' references unknown milestone {md_id}",
                )
            if slot is not None and slot not in ("planned", "actual"):
                raise HTTPException(
                    status_code=422,
                    detail=f"mapping target for column '{col}' milestone slot must be 'planned' or 'actual'",
                )
            if slot == "actual" and md.date_model != "planned_actual":
                raise HTTPException(
                    status_code=422,
                    detail=f"milestone '{md.name}' uses single date model — cannot map an actual date",
                )
            continue
        raise HTTPException(
            status_code=422,
            detail=f"mapping target for column '{col}' is neither a built-in field, a custom field on this template, nor a milestone target",
        )

    # Read + decode CSV. UTF-8 with BOM tolerated.
    raw = file.file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=422, detail="CSV must be UTF-8 encoded")
    if not text.strip():
        raise HTTPException(status_code=422, detail="CSV file is empty")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=422, detail="CSV has no header row")

    created = 0
    skipped: list[ImportSkipped] = []
    errors: list[ImportErrorRow] = []

    for i, row in enumerate(reader):
        # Row numbering: header is row 1, first data row is row 2.
        row_no = i + 2

        # Extract values via the mapping.
        builtins: dict[str, str | None] = {}
        cfv: dict[str, Any] = {}
        # `milestone_values[md_id] = {"planned": iso?, "actual": iso?}`
        milestone_values: dict[str, dict[str, str]] = {}
        for col, target in raw_mapping.items():
            raw_val = (row.get(col) or "").strip()
            if target in _BUILTIN_FIELD_KEYS:
                builtins[target] = raw_val
                continue
            if target.startswith("milestone:"):
                if not raw_val:
                    continue
                parts = target.split(":")
                md_id = parts[1]
                slot = parts[2] if len(parts) == 3 else "planned"
                milestone_values.setdefault(md_id, {})[slot] = raw_val
                continue
            # Custom field def id.
            fd = field_def_by_id.get(target)
            if fd is None:
                continue
            if fd.field_type in (
                "boolean_conditional_date",
                "boolean_conditional_text",
            ):
                # Per the maintainer's rule: non-empty cell → boolean true + the
                # inner value (date or text). Empty cell → explicit
                # false. Other types silently drop empty cells; the
                # boolean-conditional case always carries the boolean.
                if raw_val:
                    if fd.field_type == "boolean_conditional_date":
                        iso = _parse_csv_date(raw_val)
                        if iso is None:
                            # Can't parse the date → fall back to false.
                            cfv[target] = {"value": False}
                        else:
                            cfv[target] = {"value": True, "date": iso}
                    else:
                        cfv[target] = {"value": True, "text": raw_val}
                else:
                    cfv[target] = {"value": False}
                continue
            if not raw_val:
                continue  # blank custom-field cell → leave unset
            # Normalize Excel-format cells before validation (currency
            # with $ + commas, percent with leading %, US date m/d/yyyy).
            normalized = _normalize_import_value(
                raw_val, fd.field_type, fd.options
            )
            if normalized is None:
                continue
            cfv[target] = normalized

        number = (builtins.get("project_number") or "").strip()
        if not number:
            skipped.append(
                ImportSkipped(row=row_no, project_number="", reason="missing Project #")
            )
            continue

        # Dedup against existing projects (live + soft-deleted).
        existing = db.execute(
            select(Project.id).where(Project.project_number == number)
        ).first()
        if existing is not None:
            skipped.append(
                ImportSkipped(
                    row=row_no,
                    project_number=number,
                    reason="Project # already exists",
                )
            )
            continue

        title = (builtins.get("title") or "").strip() or _TITLE_PLACEHOLDER
        client_no = builtins.get("client_project_number") or None
        if client_no:
            client_no = client_no.strip() or None

        # Validate custom-field value shapes. Per the design, drop any
        # value that fails its type validator (silent) — the DM can
        # fill missing values in the editor before promoting the draft.
        cleaned_cfv: dict[str, Any] = {}
        for fid, val in cfv.items():
            try:
                validate_values({fid: val}, field_defs)
                cleaned_cfv[fid] = val
            except ValidationError:
                continue

        # Create the project + milestones. Wrap in a savepoint so a
        # row-level failure doesn't poison the outer transaction.
        sp = db.begin_nested()
        try:
            project = Project(
                project_number=number,
                client_project_number=client_no,
                title=title,
                template_id=template.id,
                custom_field_values=cleaned_cfv,
                created_by=user.id,
            )
            db.add(project)
            db.flush()
            for md in milestone_defs:
                planned: date | None = None
                actual: date | None = None
                slots = milestone_values.get(str(md.id))
                if slots:
                    p_raw = slots.get("planned")
                    a_raw = slots.get("actual")
                    if p_raw:
                        iso = _parse_csv_date(p_raw)
                        if iso is not None:
                            planned = date.fromisoformat(iso)
                    if a_raw and md.date_model == "planned_actual":
                        iso = _parse_csv_date(a_raw)
                        if iso is not None:
                            actual = date.fromisoformat(iso)
                db.add(
                    Milestone(
                        project_id=project.id,
                        template_milestone_def_id=md.id,
                        name=md.name,
                        direction=md.direction,
                        date_model=md.date_model,
                        order_index=md.order_index,
                        planned_date=planned,
                        actual_date=actual,
                    )
                )
            record_audit(
                db,
                user=user,
                entity_type="project",
                entity_id=project.id,
                operation="create",
                changes={
                    "initial": {
                        "title": project.title,
                        "project_number": project.project_number,
                        "client_project_number": project.client_project_number,
                        "template_id": str(project.template_id),
                        "custom_field_values": project.custom_field_values or {},
                    },
                    "via": "import",
                },
                project_id=project.id,
            )
            sp.commit()
            created += 1
        except (IntegrityError, Exception) as e:  # noqa: BLE001 — fail-soft per row
            sp.rollback()
            errors.append(ImportErrorRow(row=row_no, error=str(e)))

    db.commit()
    return ImportResult(created=created, skipped=skipped, errors=errors)


@router.patch("/{pid}", response_model=ProjectDetailOut)
def update_project(
    pid: uuid.UUID,
    payload: ProjectUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectDetailOut:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(status_code=422, detail="At least one field is required")
    project = _fetch_project_for_edit(db, user, pid)

    # Snapshot pre-mutation values for the audit diff (Phase 3.1).
    _AUDITED_PROJECT_FIELDS = (
        "title",
        "project_number",
        "client_project_number",
    )
    before = {f: getattr(project, f) for f in _AUDITED_PROJECT_FIELDS}
    before_cfv = dict(project.custom_field_values or {})

    if "custom_field_values" in data:
        incoming = data.pop("custom_field_values") or {}
        field_defs = _live_field_defs(db, project.template_id)
        # If a template field was soft-deleted after the project was
        # created, its UUID can persist in two places: the project's
        # stored custom_field_values JSONB, and the frontend's local
        # state (which loads the full dict from GET and sends it back
        # on PATCH). The user can't see or fix orphan data — the field
        # is gone from the UI — so failing the save would be a footgun.
        # Strip orphan keys from BOTH sides of the merge, then validate
        # against live field defs. The JSONB gets quietly cleaned up
        # as a side effect of any subsequent save.
        live_ids = {str(fd.id) for fd in field_defs}
        stored = {
            k: v
            for k, v in (project.custom_field_values or {}).items()
            if k in live_ids
        }
        incoming = {k: v for k, v in incoming.items() if k in live_ids}
        merged = merge_values(stored, incoming)
        try:
            validate_values(merged, field_defs)
        except ValidationError as e:
            raise HTTPException(status_code=422, detail=e.reasons)
        project.custom_field_values = merged

    for k, v in data.items():
        setattr(project, k, v)

    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="A live project with that project number already exists.",
        )

    # Build the audit diff. Top-level scalar fields, plus a sub-diff for
    # custom_field_values keyed by field-def UUID (spec §6.2).
    after = {f: getattr(project, f) for f in _AUDITED_PROJECT_FIELDS}
    changes = diff(before, after, fields=_AUDITED_PROJECT_FIELDS)
    after_cfv = project.custom_field_values or {}
    cfv_changes = diff(
        before_cfv,
        after_cfv,
        fields=set(before_cfv.keys()) | set(after_cfv.keys()),
    )
    if cfv_changes:
        changes["custom_field_values"] = cfv_changes
    if changes:
        record_audit(
            db,
            user=user,
            entity_type="project",
            entity_id=project.id,
            operation="update",
            changes=changes,
            project_id=project.id,
        )

    db.commit()
    db.refresh(project)

    milestones = _live_milestones(db, project.id)
    return _detail_out(db, user, project, milestones)


@router.delete("/{pid}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    pid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    project = _fetch_project_for_edit(db, user, pid)
    project.deleted_at = datetime.now(timezone.utc)
    project.deleted_by = user.id
    record_audit(
        db,
        user=user,
        entity_type="project",
        entity_id=project.id,
        operation="delete",
        changes={},
        project_id=project.id,
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{pid}/transition", response_model=ProjectDetailOut)
def transition_project(
    pid: uuid.UUID,
    payload: TransitionRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ProjectDetailOut:
    project = _fetch_project_for_edit(db, user, pid)
    try:
        assert_transition_allowed(project.lifecycle_state, payload.to_state)
    except LifecycleError as e:
        raise HTTPException(status_code=422, detail=e.reasons)

    if project.lifecycle_state == "draft" and payload.to_state == "active":
        field_defs = _live_field_defs(db, project.template_id)
        required_ids = [str(fd.id) for fd in field_defs if fd.required]
        milestones = _live_milestones(db, project.id)
        reasons = check_active_readiness(
            required_field_def_ids=required_ids,
            custom_field_values=project.custom_field_values or {},
            milestone_planned_dates=[m.planned_date for m in milestones],
        )
        if reasons:
            raise HTTPException(status_code=422, detail=reasons)

    prev_state = project.lifecycle_state
    project.lifecycle_state = payload.to_state
    record_audit(
        db,
        user=user,
        entity_type="project",
        entity_id=project.id,
        operation="transition",
        changes={"from": prev_state, "to": payload.to_state},
        project_id=project.id,
    )
    db.commit()
    db.refresh(project)

    milestones = _live_milestones(db, project.id)
    return _detail_out(db, user, project, milestones)


# ---- milestone PATCH (dates only — Phase 1.7) ---------------------------
# Full milestone CRUD (rename, change direction/date_model, add ad-hoc,
# soft-delete) is Phase 1.8. For 1.7 we only need date editing because
# the draft→active transition requires every milestone to have a
# planned_date.


def _fetch_project_milestone_for_edit(
    db: Session, user: User, pid: uuid.UUID, mid: uuid.UUID
) -> Milestone:
    project = _fetch_project_for_edit(db, user, pid)
    obj = db.get(Milestone, mid)
    if (
        obj is None
        or obj.project_id != project.id
        or obj.deleted_at is not None
    ):
        raise HTTPException(status_code=404, detail="Milestone not found")
    return obj


def _validate_milestone_enums(data: dict) -> None:
    from backend.app.db.models import MILESTONE_DATE_MODELS, MILESTONE_DIRECTIONS

    if "direction" in data and data["direction"] not in MILESTONE_DIRECTIONS:
        raise HTTPException(
            status_code=422, detail=f"unknown direction: {data['direction']}"
        )
    if "date_model" in data and data["date_model"] not in MILESTONE_DATE_MODELS:
        raise HTTPException(
            status_code=422, detail=f"unknown date_model: {data['date_model']}"
        )


@router.post(
    "/{pid}/milestones",
    response_model=MilestoneOut,
    status_code=status.HTTP_201_CREATED,
)
def create_milestone(
    pid: uuid.UUID,
    payload: MilestoneCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MilestoneOut:
    from backend.app.services.milestone_create import create_milestone_record

    project = _fetch_project_for_edit(db, user, pid)
    obj = create_milestone_record(
        db,
        user,
        project,
        name=payload.name,
        direction=payload.direction,
        date_model=payload.date_model,
    )
    db.commit()
    db.refresh(obj)
    return MilestoneOut.model_validate(obj)


@router.patch("/{pid}/milestones/{mid}", response_model=MilestoneOut)
def update_milestone(
    pid: uuid.UUID,
    mid: uuid.UUID,
    payload: MilestoneUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MilestoneOut:
    data = payload.model_dump(exclude_unset=True)
    if not data:
        raise HTTPException(
            status_code=422, detail="At least one field is required"
        )
    _validate_milestone_enums(data)
    obj = _fetch_project_milestone_for_edit(db, user, pid, mid)
    _AUDITED_MILESTONE_FIELDS = (
        "name",
        "direction",
        "date_model",
        "planned_date",
        "actual_date",
    )
    before = {f: getattr(obj, f) for f in _AUDITED_MILESTONE_FIELDS}
    for k, v in data.items():
        setattr(obj, k, v)
    after = {f: getattr(obj, f) for f in _AUDITED_MILESTONE_FIELDS}
    changes = diff(before, after, fields=_AUDITED_MILESTONE_FIELDS)
    if changes:
        record_audit(
            db,
            user=user,
            entity_type="milestone",
            entity_id=obj.id,
            operation="update",
            changes=changes,
            project_id=obj.project_id,
        )
    db.commit()
    db.refresh(obj)
    return MilestoneOut.model_validate(obj)


@router.delete(
    "/{pid}/milestones/{mid}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_milestone(
    pid: uuid.UUID,
    mid: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    obj = _fetch_project_milestone_for_edit(db, user, pid, mid)
    obj.deleted_at = datetime.now(timezone.utc)
    obj.deleted_by = user.id
    record_audit(
        db,
        user=user,
        entity_type="milestone",
        entity_id=obj.id,
        operation="delete",
        changes={},
        project_id=obj.project_id,
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{pid}/milestones/reorder", status_code=status.HTTP_204_NO_CONTENT
)
def reorder_milestones(
    pid: uuid.UUID,
    payload: MilestoneReorderRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    project = _fetch_project_for_edit(db, user, pid)
    ordered_ids = payload.ordered_ids
    if len(set(ordered_ids)) != len(ordered_ids):
        raise HTTPException(
            status_code=422, detail="ordered_ids contains duplicates"
        )
    live_rows = (
        db.execute(
            select(Milestone).where(
                Milestone.project_id == project.id,
                Milestone.deleted_at.is_(None),
            )
        )
        .scalars()
        .all()
    )
    live_by_id = {row.id: row for row in live_rows}
    incoming_set = set(ordered_ids)
    live_set = set(live_by_id.keys())
    missing = live_set - incoming_set
    extra = incoming_set - live_set
    if missing or extra:
        reasons: list[str] = []
        for m in missing:
            reasons.append(f"missing id: {m}")
        for e in extra:
            reasons.append(f"not in project: {e}")
        raise HTTPException(status_code=422, detail=reasons)
    for position, item_id in enumerate(ordered_ids):
        live_by_id[item_id].order_index = position
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
