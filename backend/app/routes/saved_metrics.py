"""Personal saved-metric library (Phase 7.9).

Owner-scoped CRUD mirroring routes/views.py: _fetch 404s on missing OR
not-owned (no existence leak), configs are fully semantically validated
via validate_metric at save time, 50-per-user cap on create, hard
delete (lightweight personal rows, mirrors widgets).
"""
import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user
from backend.app.db.models import SavedMetric, User
from backend.app.db.session import get_db
from backend.app.schemas.views import (
    SavedMetricCreate,
    SavedMetricOut,
    SavedMetricsResponse,
    SavedMetricUpdate,
)
from backend.app.services.metric_engine import ConfigError, validate_metric

router = APIRouter(prefix="/api/saved-metrics", tags=["saved-metrics"])

MAX_SAVED_METRICS = 50


def _fetch_saved_metric(
    db: Session, user_id: uuid.UUID, metric_id: uuid.UUID
) -> SavedMetric:
    obj = db.get(SavedMetric, metric_id)
    if obj is None or obj.owner_user_id != user_id:
        raise HTTPException(status_code=404, detail="Saved metric not found")
    return obj


def _to_payload(m: SavedMetric) -> SavedMetricOut:
    return SavedMetricOut(id=m.id, name=m.name, config=m.config)


@router.get("", response_model=SavedMetricsResponse)
def list_saved_metrics(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SavedMetricsResponse:
    items = db.execute(
        select(SavedMetric)
        .where(SavedMetric.owner_user_id == user.id)
        .order_by(SavedMetric.name, SavedMetric.created_at)
    ).scalars()
    return SavedMetricsResponse(items=[_to_payload(m) for m in items])


@router.post(
    "", response_model=SavedMetricOut, status_code=status.HTTP_201_CREATED
)
def create_saved_metric(
    payload: SavedMetricCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SavedMetricOut:
    count = db.execute(
        select(func.count(SavedMetric.id)).where(
            SavedMetric.owner_user_id == user.id
        )
    ).scalar_one()
    if count >= MAX_SAVED_METRICS:
        raise HTTPException(
            status_code=422,
            detail=f"You can save at most {MAX_SAVED_METRICS} metrics",
        )
    try:
        validate_metric(db, user, payload.config)
    except ConfigError as e:
        raise HTTPException(status_code=422, detail=e.reasons)
    obj = SavedMetric(
        owner_user_id=user.id,
        name=payload.name.strip(),
        config=payload.config.model_dump(mode="json"),
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _to_payload(obj)


@router.patch("/{metric_id}", response_model=SavedMetricOut)
def update_saved_metric(
    metric_id: uuid.UUID,
    payload: SavedMetricUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SavedMetricOut:
    obj = _fetch_saved_metric(db, user.id, metric_id)
    data = payload.model_dump(exclude_unset=True)
    if "config" in data and payload.config is not None:
        try:
            validate_metric(db, user, payload.config)
        except ConfigError as e:
            raise HTTPException(status_code=422, detail=e.reasons)
        obj.config = payload.config.model_dump(mode="json")
    if "name" in data and data["name"] is not None:
        obj.name = data["name"].strip()
    db.commit()
    db.refresh(obj)
    return _to_payload(obj)


@router.delete("/{metric_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_metric(
    metric_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    obj = _fetch_saved_metric(db, user.id, metric_id)
    db.delete(obj)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
