from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user
from backend.app.db.models import User
from backend.app.db.session import get_db
from backend.app.schemas.views import (
    DrillRequest,
    DrillRow,
    DrillRowsResponse,
    MetricDefinition,
    MetricEvalResponse,
)
from backend.app.services.metric_engine import (
    ConfigError,
    drill_rows,
    evaluate_metric,
)

router = APIRouter(prefix="/api/metrics", tags=["metrics"])


@router.post("/eval", response_model=MetricEvalResponse)
def eval_metric(
    payload: MetricDefinition,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MetricEvalResponse:
    """Live-preview evaluation. Identical validation + dept scoping as
    stored block configs — this endpoint can never see more than the
    caller's normal access."""
    try:
        value = evaluate_metric(db, user, payload)
    except ConfigError as e:
        raise HTTPException(status_code=422, detail=e.reasons)
    return MetricEvalResponse(value=value)


@router.post("/eval/rows", response_model=DrillRowsResponse)
def eval_rows(
    payload: DrillRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DrillRowsResponse:
    """Drill-down: the entity rows behind a metric (or one group bucket).
    Same validation + dept scoping as eval; capped at 100 rows."""
    try:
        total, rows = drill_rows(
            db, user, payload.metric, payload.group_by, payload.group_value
        )
    except ConfigError as e:
        raise HTTPException(status_code=422, detail=e.reasons)
    return DrillRowsResponse(
        total=total,
        rows=[
            DrillRow(id=rid, project_id=pid, label=label, sublabel=sub)
            for rid, pid, label, sub in rows
        ],
    )
