"""Admin audit log viewer (Phase 3.1).

Read-only, admin-only window into the `audit_log` table. Supports
filtering by entity type, acting user, project (which combines the
denormalized `project_id` column with `entity_type='project'` rows so
"everything for project X" surfaces the parent row plus its sub-entity
rows), and a date range over `changed_at`.

Default date range is the last 30 days — the table grows unbounded by
design (no retention policy this phase), and an unfiltered query at
year-2 scale could be slow. Callers who want older history pass
explicit `from` / `to`.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from backend.app.auth.permissions import require_role
from backend.app.db.models import AuditLog, User
from backend.app.db.session import get_db
from backend.app.schemas.audit_log import AuditLogItem, AuditLogListResponse

router = APIRouter(prefix="/api/admin", tags=["audit-log"])


_ALLOWED_ENTITY_TYPES = frozenset(
    {
        "project",
        "milestone",
        "cor",
        "note",
        "user_role",
        "project_role_assignment",
    }
)


def _email_or_deleted(u: User | None) -> str:
    if u is None or u.deleted_at is not None:
        return "(deleted user)"
    return u.email


@router.get("/audit-log", response_model=AuditLogListResponse)
def list_audit_log(
    entity_type: str | None = Query(default=None),
    user_id: uuid.UUID | None = Query(default=None),
    project_id: uuid.UUID | None = Query(default=None),
    from_: date | None = Query(default=None, alias="from"),
    to: date | None = Query(default=None),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
    _admin: User = Depends(require_role("admin")),
) -> AuditLogListResponse:
    # Default the date range to the last 30 days so an unfiltered query
    # doesn't scan history forever.
    today = datetime.now(timezone.utc).date()
    if from_ is None:
        from_ = today - timedelta(days=30)
    if to is None:
        to = today
    if from_ > to:
        raise HTTPException(
            status_code=422, detail="`from` must be on or before `to`"
        )

    if entity_type is not None and entity_type not in _ALLOWED_ENTITY_TYPES:
        raise HTTPException(
            status_code=422, detail=f"unknown entity_type: {entity_type}"
        )

    base = select(AuditLog).where(
        AuditLog.changed_at >= datetime.combine(from_, datetime.min.time()),
        AuditLog.changed_at <= datetime.combine(
            to, datetime.max.time()
        ),
    )
    if entity_type is not None:
        base = base.where(AuditLog.entity_type == entity_type)
    if user_id is not None:
        base = base.where(AuditLog.changed_by == user_id)
    if project_id is not None:
        # Match either the denormalized project_id column OR the project
        # entity itself. This surfaces "everything for project X" in one
        # query — the parent project row + all its milestone/cor/note/
        # project_role_assignment children.
        base = base.where(
            or_(
                AuditLog.project_id == project_id,
                (AuditLog.entity_type == "project")
                & (AuditLog.entity_id == project_id),
            )
        )

    total = db.execute(
        select(func.count()).select_from(base.subquery())
    ).scalar_one()

    page_query = (
        base.order_by(AuditLog.changed_at.desc(), AuditLog.id.desc())
        .limit(limit)
        .offset(offset)
    )
    rows = db.execute(page_query).scalars().all()

    # Resolve changed_by_email in one extra query per page. Audit rows
    # outlive their acting user (ON DELETE SET NULL), so we need to
    # tolerate NULLs and soft-deletes.
    actor_ids = {r.changed_by for r in rows if r.changed_by is not None}
    actors: dict[uuid.UUID, User] = {}
    if actor_ids:
        actors = {
            u.id: u
            for u in db.execute(
                select(User).where(User.id.in_(actor_ids))
            ).scalars()
        }

    items = [
        AuditLogItem(
            id=r.id,
            entity_type=r.entity_type,
            entity_id=r.entity_id,
            project_id=r.project_id,
            operation=r.operation,
            changes=r.changes,
            changed_by=r.changed_by,
            changed_by_email=_email_or_deleted(actors.get(r.changed_by)),
            changed_at=r.changed_at,
        )
        for r in rows
    ]
    return AuditLogListResponse(
        items=items, total=total, limit=limit, offset=offset
    )
