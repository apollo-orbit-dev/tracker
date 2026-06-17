import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import false, func, select
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.scope import accessible_department_ids, assert_can_manage_dept
from backend.app.db.models import CustomView, CustomViewBlock, Department, User
from backend.app.db.session import get_db
from backend.app.schemas.views import (
    BlockCreate,
    BlockDataResponse,
    BlockOut,
    BlockReorderRequest,
    BlocksResponse,
    BlockUpdate,
    BreakdownBlockConfig,
    BreakdownBlockData,
    BreakdownRowOut,
    ChartBlockConfig,
    ChartBlockData,
    CustomViewCreate,
    CustomViewOut,
    CustomViewsResponse,
    CustomViewUpdate,
    GroupRowOut,
    MetricBlockData,
    MetricCardConfig,
    PublishRequest,
    ViewReorderRequest,
)
from backend.app.services.metric_engine import (
    GROUP_TOP_N,
    ConfigError,
    evaluate_grouped,
    evaluate_metric,
    validate_block_config,
)

router = APIRouter(prefix="/api/views", tags=["views"])

MAX_BLOCKS_PER_VIEW = 30

DEFAULT_BLOCK_WIDTH: dict[str, int] = {
    "metric": 1,
    "chart": 2,
    "breakdown": 2,
    "table": 4,
    "text": 2,
}


def _fetch_view(db: Session, user_id: uuid.UUID, view_id: uuid.UUID) -> CustomView:
    obj = db.get(CustomView, view_id)
    if obj is None or obj.deleted_at is not None or obj.owner_user_id != user_id:
        raise HTTPException(status_code=404, detail="View not found")
    return obj


def _fetch_view_readable(
    db: Session, user: User, view_id: uuid.UUID
) -> CustomView:
    """Read access: the owner, or a view published to a department the
    caller belongs to. Write paths keep using owner-only `_fetch_view`."""
    obj = db.get(CustomView, view_id)
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="View not found")
    if obj.owner_user_id == user.id:
        return obj
    if obj.published_department_id is not None:
        allowed = accessible_department_ids(user)
        if allowed is None or obj.published_department_id in allowed:
            return obj
    raise HTTPException(status_code=404, detail="View not found")


def _user_views(db: Session, user_id: uuid.UUID) -> list[CustomView]:
    return list(
        db.execute(
            select(CustomView)
            .where(
                CustomView.owner_user_id == user_id,
                CustomView.deleted_at.is_(None),
            )
            .order_by(CustomView.order_index, CustomView.created_at)
        ).scalars()
    )


def _to_view_payload(
    v: CustomView, *, user_id: uuid.UUID, owner_name: str, dept_code: str | None
) -> CustomViewOut:
    return CustomViewOut(
        id=v.id,
        name=v.name,
        order_index=v.order_index,
        published_department_id=v.published_department_id,
        is_owner=v.owner_user_id == user_id,
        owner_name=owner_name,
        published_department_code=dept_code,
    )


def _to_block_payload(b: CustomViewBlock) -> BlockOut:
    return BlockOut(
        id=b.id,
        view_id=b.view_id,
        block_type=b.block_type,
        title=b.title,
        order_index=b.order_index,
        width=b.width,
        accent=b.accent,
        config=b.config,
    )


@router.get("", response_model=CustomViewsResponse)
def list_views(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CustomViewsResponse:
    owned = list(
        db.execute(
            select(CustomView)
            .where(
                CustomView.owner_user_id == user.id,
                CustomView.deleted_at.is_(None),
            )
            .order_by(CustomView.order_index, CustomView.created_at)
        ).scalars()
    )
    allowed = accessible_department_ids(user)
    shared_q = select(CustomView).where(
        CustomView.deleted_at.is_(None),
        CustomView.owner_user_id != user.id,
        CustomView.published_department_id.isnot(None),
    )
    if allowed is not None:
        if allowed:
            shared_q = shared_q.where(
                CustomView.published_department_id.in_(allowed)
            )
        else:
            shared_q = shared_q.where(false())  # no accessible depts
    shared = list(
        db.execute(shared_q.order_by(CustomView.name)).scalars()
    )

    rows = owned + shared
    owner_ids = {v.owner_user_id for v in rows}
    dept_ids = {v.published_department_id for v in rows if v.published_department_id}
    owner_names = (
        {
            u.id: u.display_name
            for u in db.execute(
                select(User).where(User.id.in_(owner_ids))
            ).scalars()
        }
        if owner_ids
        else {}
    )
    dept_codes = (
        {
            d.id: d.code
            for d in db.execute(
                select(Department).where(Department.id.in_(dept_ids))
            ).scalars()
        }
        if dept_ids
        else {}
    )

    return CustomViewsResponse(
        items=[
            _to_view_payload(
                v,
                user_id=user.id,
                owner_name=owner_names.get(v.owner_user_id, ""),
                dept_code=dept_codes.get(v.published_department_id),
            )
            for v in rows
        ]
    )


@router.post("", response_model=CustomViewOut, status_code=status.HTTP_201_CREATED)
def create_view(
    payload: CustomViewCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CustomViewOut:
    current_max = db.execute(
        select(func.max(CustomView.order_index)).where(
            CustomView.owner_user_id == user.id,
            CustomView.deleted_at.is_(None),
        )
    ).scalar()
    obj = CustomView(
        owner_user_id=user.id,
        name=payload.name.strip(),
        order_index=0 if current_max is None else current_max + 1,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _to_view_payload(
        obj, user_id=user.id, owner_name=user.display_name, dept_code=None
    )


@router.patch("/{view_id}", response_model=CustomViewOut)
def update_view(
    view_id: uuid.UUID,
    payload: CustomViewUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CustomViewOut:
    obj = _fetch_view(db, user.id, view_id)
    data = payload.model_dump(exclude_unset=True)
    if "name" in data and data["name"] is not None:
        obj.name = data["name"].strip()
    db.commit()
    db.refresh(obj)
    code = None
    if obj.published_department_id is not None:
        d = db.get(Department, obj.published_department_id)
        code = d.code if d else None
    return _to_view_payload(
        obj, user_id=user.id, owner_name=user.display_name, dept_code=code
    )


@router.delete("/{view_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_view(
    view_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    obj = _fetch_view(db, user.id, view_id)
    obj.deleted_at = func.now()
    obj.deleted_by = user.id
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_views(
    payload: ViewReorderRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    ordered_ids = payload.ordered_ids
    if len(set(ordered_ids)) != len(ordered_ids):
        raise HTTPException(status_code=422, detail="ordered_ids contains duplicates")
    live = {v.id: v for v in _user_views(db, user.id)}
    if set(ordered_ids) != set(live.keys()):
        raise HTTPException(status_code=422, detail="ordered_ids must match your views")
    for pos, vid in enumerate(ordered_ids):
        live[vid].order_index = pos
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/{view_id}/publish", response_model=CustomViewOut)
def publish_view(
    view_id: uuid.UUID,
    payload: PublishRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CustomViewOut:
    obj = _fetch_view(db, user.id, view_id)  # owner-only (404 otherwise)
    dept = db.get(Department, payload.department_id)
    if dept is None or dept.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Department not found")
    assert_can_manage_dept(user, payload.department_id)  # 403 unless admin/DM
    obj.published_department_id = payload.department_id
    db.commit()
    db.refresh(obj)
    return _to_view_payload(
        obj, user_id=user.id, owner_name=user.display_name, dept_code=dept.code
    )


@router.post("/{view_id}/unpublish", response_model=CustomViewOut)
def unpublish_view(
    view_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CustomViewOut:
    obj = _fetch_view(db, user.id, view_id)  # owner-only
    obj.published_department_id = None
    db.commit()
    db.refresh(obj)
    return _to_view_payload(
        obj, user_id=user.id, owner_name=user.display_name, dept_code=None
    )


@router.post(
    "/{view_id}/duplicate",
    response_model=CustomViewOut,
    status_code=status.HTTP_201_CREATED,
)
def duplicate_view(
    view_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CustomViewOut:
    src = _fetch_view_readable(db, user, view_id)  # owner or reader
    current_max = db.execute(
        select(func.max(CustomView.order_index)).where(
            CustomView.owner_user_id == user.id,
            CustomView.deleted_at.is_(None),
        )
    ).scalar()
    copy = CustomView(
        owner_user_id=user.id,
        name=f"{src.name} (copy)",
        published_department_id=None,
        order_index=0 if current_max is None else current_max + 1,
    )
    db.add(copy)
    db.flush()
    src_blocks = db.execute(
        select(CustomViewBlock)
        .where(CustomViewBlock.view_id == src.id)
        .order_by(CustomViewBlock.order_index, CustomViewBlock.created_at)
    ).scalars()
    for b in src_blocks:
        db.add(
            CustomViewBlock(
                view_id=copy.id,
                block_type=b.block_type,
                title=b.title,
                order_index=b.order_index,
                width=b.width,
                accent=b.accent,
                config=b.config,
            )
        )
    db.commit()
    db.refresh(copy)
    return _to_view_payload(
        copy, user_id=user.id, owner_name=user.display_name, dept_code=None
    )


def _assert_block_capacity(db: Session, view_id: uuid.UUID) -> None:
    """422 when the view is already at the block cap."""
    count = db.execute(
        select(func.count(CustomViewBlock.id)).where(
            CustomViewBlock.view_id == view_id
        )
    ).scalar_one()
    if count >= MAX_BLOCKS_PER_VIEW:
        raise HTTPException(
            status_code=422,
            detail=f"A view holds at most {MAX_BLOCKS_PER_VIEW} blocks",
        )


def _next_order_index(db: Session, view_id: uuid.UUID) -> int:
    current_max = db.execute(
        select(func.max(CustomViewBlock.order_index)).where(
            CustomViewBlock.view_id == view_id
        )
    ).scalar()
    return 0 if current_max is None else current_max + 1


def _view_blocks(db: Session, view_id: uuid.UUID) -> list[CustomViewBlock]:
    return list(
        db.execute(
            select(CustomViewBlock)
            .where(CustomViewBlock.view_id == view_id)
            .order_by(CustomViewBlock.order_index, CustomViewBlock.created_at)
        ).scalars()
    )


@router.get("/{view_id}/blocks", response_model=BlocksResponse)
def list_blocks(
    view_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BlocksResponse:
    _fetch_view_readable(db, user, view_id)
    return BlocksResponse(
        items=[_to_block_payload(b) for b in _view_blocks(db, view_id)]
    )


@router.post(
    "/{view_id}/blocks",
    response_model=BlockOut,
    status_code=status.HTTP_201_CREATED,
)
def add_block(
    view_id: uuid.UUID,
    payload: BlockCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BlockOut:
    _fetch_view(db, user.id, view_id)
    _assert_block_capacity(db, view_id)
    try:
        validate_block_config(db, user, payload.block_type, payload.config)
    except ConfigError as e:
        raise HTTPException(status_code=422, detail=e.reasons)
    obj = CustomViewBlock(
        view_id=view_id,
        block_type=payload.block_type,
        title=payload.title.strip() if payload.title else None,
        order_index=_next_order_index(db, view_id),
        width=payload.width if payload.width is not None else DEFAULT_BLOCK_WIDTH.get(payload.block_type, 1),
        accent=payload.accent or "indigo",
        config=payload.config,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _to_block_payload(obj)


def _fetch_block(
    db: Session, user_id: uuid.UUID, view_id: uuid.UUID, block_id: uuid.UUID
) -> CustomViewBlock:
    _fetch_view(db, user_id, view_id)
    obj = db.get(CustomViewBlock, block_id)
    if obj is None or obj.view_id != view_id:
        raise HTTPException(status_code=404, detail="Block not found")
    return obj


def _fetch_block_readable(
    db: Session, user: User, view_id: uuid.UUID, block_id: uuid.UUID
) -> CustomViewBlock:
    """Read access to a single block: owner or reader of a published view."""
    _fetch_view_readable(db, user, view_id)
    obj = db.get(CustomViewBlock, block_id)
    if obj is None or obj.view_id != view_id:
        raise HTTPException(status_code=404, detail="Block not found")
    return obj


@router.patch("/{view_id}/blocks/{block_id}", response_model=BlockOut)
def update_block(
    view_id: uuid.UUID,
    block_id: uuid.UUID,
    payload: BlockUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BlockOut:
    obj = _fetch_block(db, user.id, view_id, block_id)
    data = payload.model_dump(exclude_unset=True)
    if "config" in data:
        try:
            validate_block_config(db, user, obj.block_type, data["config"])
        except ConfigError as e:
            raise HTTPException(status_code=422, detail=e.reasons)
        obj.config = data["config"]
    if "title" in data:
        raw = data["title"]
        obj.title = raw.strip() if isinstance(raw, str) and raw.strip() else None
    if "width" in data and data["width"] is not None:
        obj.width = data["width"]
    if "accent" in data and data["accent"] is not None:
        obj.accent = data["accent"]
    db.commit()
    db.refresh(obj)
    return _to_block_payload(obj)


@router.delete(
    "/{view_id}/blocks/{block_id}", status_code=status.HTTP_204_NO_CONTENT
)
def remove_block(
    view_id: uuid.UUID,
    block_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    obj = _fetch_block(db, user.id, view_id, block_id)
    db.delete(obj)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{view_id}/blocks/{block_id}/duplicate",
    response_model=BlockOut,
    status_code=status.HTTP_201_CREATED,
)
def duplicate_block(
    view_id: uuid.UUID,
    block_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BlockOut:
    src = _fetch_block(db, user.id, view_id, block_id)
    _assert_block_capacity(db, view_id)
    obj = CustomViewBlock(
        view_id=view_id,
        block_type=src.block_type,
        title=src.title,
        order_index=_next_order_index(db, view_id),
        width=src.width,
        accent=src.accent,
        config=src.config,
    )
    db.add(obj)
    db.commit()
    db.refresh(obj)
    return _to_block_payload(obj)


@router.post("/{view_id}/blocks/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_blocks(
    view_id: uuid.UUID,
    payload: BlockReorderRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    _fetch_view(db, user.id, view_id)
    ordered_ids = payload.ordered_ids
    if len(set(ordered_ids)) != len(ordered_ids):
        raise HTTPException(status_code=422, detail="ordered_ids contains duplicates")
    live = {b.id: b for b in _view_blocks(db, view_id)}
    if set(ordered_ids) != set(live.keys()):
        raise HTTPException(
            status_code=422, detail="ordered_ids must match the view's blocks"
        )
    for pos, bid in enumerate(ordered_ids):
        live[bid].order_index = pos
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{view_id}/blocks/{block_id}/data", response_model=BlockDataResponse)
def block_data(
    view_id: uuid.UUID,
    block_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> BlockDataResponse:
    obj = _fetch_block_readable(db, user, view_id, block_id)
    if obj.config is None:
        raise HTTPException(status_code=422, detail="block has no evaluable data")
    try:
        if obj.block_type == "metric":
            cfg = MetricCardConfig.model_validate(obj.config)
            return MetricBlockData(value=evaluate_metric(db, user, cfg.metric))
        if obj.block_type == "chart":
            ccfg = ChartBlockConfig.model_validate(obj.config)
            rows = evaluate_grouped(
                db, user, ccfg.metric, ccfg.group_by, top_n=GROUP_TOP_N
            )
            return ChartBlockData(
                rows=[
                    GroupRowOut(
                        label=r.label, value=r.value,
                        is_null=r.is_null, is_other=r.is_other,
                    )
                    for r in rows
                ],
                money=ccfg.money,
                chart_kind=ccfg.kind,
            )
        if obj.block_type == "breakdown":
            bcfg = BreakdownBlockConfig.model_validate(obj.config)
            # Untruncated fetch (top_n=None): every column is joined on
            # ONE label set ranked by the first column, so a label in
            # one column's tail can't render as a false 0 in another,
            # and the single "Other" row sums the SAME hidden labels
            # for every column.
            per_col = [
                evaluate_grouped(db, user, col.metric, bcfg.group_by, top_n=None)
                for col in bcfg.columns
            ]
            zero_kinds = {"count", "count_distinct", "sum"}
            # Key on (is_null, label) tuples, not the display label: a
            # real select option literally named "—" must stay distinct
            # from the synthetic NULL (unset) bucket (open item 29).
            by_label = [
                {(r.is_null, r.label): r.value for r in rows} for rows in per_col
            ]
            # first column's order (value desc) ranks; labels seen only
            # in later columns rank below everything in the first
            labels: list[tuple[bool, str]] = [
                (r.is_null, r.label) for r in per_col[0]
            ]
            for rows in per_col[1:]:
                for r in rows:
                    if (r.is_null, r.label) not in labels:
                        labels.append((r.is_null, r.label))
            shown, hidden = labels[:GROUP_TOP_N], labels[GROUP_TOP_N:]

            def _cell(ci: int, key: tuple[bool, str]) -> Decimal | None:
                if key in by_label[ci]:
                    return by_label[ci][key]  # true value (may be None)
                agg = bcfg.columns[ci].metric.aggregation
                return Decimal(0) if agg in zero_kinds else None

            out_rows = [
                BreakdownRowOut(
                    label=lb,
                    is_null=isn,
                    cells=[_cell(ci, (isn, lb)) for ci in range(len(per_col))],
                )
                for isn, lb in shown
            ]
            if hidden:
                cells = []
                for ci, col in enumerate(bcfg.columns):
                    if col.metric.aggregation in zero_kinds:
                        cells.append(sum(
                            (by_label[ci].get(lb) or Decimal(0) for lb in hidden),
                            Decimal(0),
                        ))
                    else:
                        # summing per-group avg/min/max is meaningless
                        cells.append(None)
                out_rows.append(
                    BreakdownRowOut(label="Other", cells=cells, is_other=True)
                )
            return BreakdownBlockData(
                columns=[c.label for c in bcfg.columns],
                money=[c.money for c in bcfg.columns],
                rows=out_rows,
            )
    except ConfigError as e:
        raise HTTPException(status_code=422, detail=e.reasons)
    raise HTTPException(status_code=422, detail="block has no evaluable data")
