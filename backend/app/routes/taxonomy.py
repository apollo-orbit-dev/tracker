"""CRUD for the three taxonomy entities.

Departments are org-wide and admin-only — `make_taxonomy_router` produces
that shape unchanged.

Clients and disciplines belong to a department (Phase 1.9.2). The
dept-scoped router enforces:
  - List/get: filtered to caller's accessible departments (admin: all).
  - POST/PATCH/DELETE: caller must be admin OR department_manager+ in
    the target row's department.
"""
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.permissions import require_role
from backend.app.auth.scope import accessible_department_ids, assert_can_manage_dept
from backend.app.db.models import Client, Department, Discipline, User
from backend.app.db.session import get_db
from backend.app.schemas.taxonomy import (
    DeptScopedTaxonomyCreate,
    DeptScopedTaxonomyListResponse,
    DeptScopedTaxonomyOut,
    TaxonomyCreate,
    TaxonomyListResponse,
    TaxonomyOut,
    TaxonomyUpdate,
)


def _fetch_alive(db: Session, model: type, item_id: uuid.UUID) -> Any:
    obj = db.get(model, item_id)
    if obj is None or obj.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Not found")
    return obj


def make_taxonomy_router(
    *,
    prefix: str,
    tag: str,
    model: type,
) -> APIRouter:
    """Org-wide, admin-only taxonomy CRUD. Used by departments."""
    router = APIRouter(prefix=prefix, tags=[tag])

    @router.get("", response_model=TaxonomyListResponse)
    def list_items(
        limit: int = Query(default=50, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
        include_deleted: bool = Query(default=False),
        db: Session = Depends(get_db),
        _admin: User = Depends(require_role("admin")),
    ) -> TaxonomyListResponse:
        base = select(model)
        if not include_deleted:
            base = base.where(model.deleted_at.is_(None))
        base = base.order_by(model.code.asc())

        total = db.execute(
            select(func.count()).select_from(base.subquery())
        ).scalar_one()
        rows = db.execute(base.limit(limit).offset(offset)).scalars().all()
        return TaxonomyListResponse(
            items=[TaxonomyOut.model_validate(r) for r in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    @router.post("", response_model=TaxonomyOut, status_code=status.HTTP_201_CREATED)
    def create_item(
        payload: TaxonomyCreate,
        db: Session = Depends(get_db),
        _admin: User = Depends(require_role("admin")),
    ) -> TaxonomyOut:
        obj = model(code=payload.code, name=payload.name)
        db.add(obj)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=409, detail="code already exists")
        db.commit()
        db.refresh(obj)
        return TaxonomyOut.model_validate(obj)

    @router.get("/{item_id}", response_model=TaxonomyOut)
    def get_item(
        item_id: uuid.UUID,
        db: Session = Depends(get_db),
        _admin: User = Depends(require_role("admin")),
    ) -> TaxonomyOut:
        obj = _fetch_alive(db, model, item_id)
        return TaxonomyOut.model_validate(obj)

    @router.patch("/{item_id}", response_model=TaxonomyOut)
    def update_item(
        item_id: uuid.UUID,
        payload: TaxonomyUpdate,
        db: Session = Depends(get_db),
        _admin: User = Depends(require_role("admin")),
    ) -> TaxonomyOut:
        if payload.code is None and payload.name is None:
            raise HTTPException(
                status_code=422, detail="At least one field is required"
            )
        obj = _fetch_alive(db, model, item_id)
        if payload.code is not None:
            obj.code = payload.code
        if payload.name is not None:
            obj.name = payload.name
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(status_code=409, detail="code already exists")
        db.commit()
        db.refresh(obj)
        return TaxonomyOut.model_validate(obj)

    @router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_item(
        item_id: uuid.UUID,
        db: Session = Depends(get_db),
        admin: User = Depends(require_role("admin")),
    ) -> Response:
        obj = _fetch_alive(db, model, item_id)
        obj.deleted_at = datetime.now(timezone.utc)
        obj.deleted_by = admin.id
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router


def make_dept_scoped_taxonomy_router(
    *,
    prefix: str,
    tag: str,
    model: type,
) -> APIRouter:
    """Dept-scoped taxonomy CRUD. Used by clients and disciplines."""
    router = APIRouter(prefix=prefix, tags=[tag])

    def _fetch_in_scope(
        db: Session, item_id: uuid.UUID, allowed: set[uuid.UUID] | None
    ) -> Any:
        obj = db.get(model, item_id)
        if obj is None or obj.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Not found")
        if allowed is not None and obj.department_id not in allowed:
            raise HTTPException(status_code=404, detail="Not found")
        return obj

    def _assert_dept_live(db: Session, dept_id: uuid.UUID) -> None:
        dept = db.get(Department, dept_id)
        if dept is None or dept.deleted_at is not None:
            raise HTTPException(
                status_code=422, detail="Department not found or deleted"
            )

    @router.get("", response_model=DeptScopedTaxonomyListResponse)
    def list_items(
        limit: int = Query(default=50, ge=1, le=200),
        offset: int = Query(default=0, ge=0),
        include_deleted: bool = Query(default=False),
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> DeptScopedTaxonomyListResponse:
        allowed = accessible_department_ids(user)
        base = select(model)
        if allowed is not None:
            if not allowed:
                return DeptScopedTaxonomyListResponse(
                    items=[], total=0, limit=limit, offset=offset
                )
            base = base.where(model.department_id.in_(allowed))
        if not include_deleted:
            base = base.where(model.deleted_at.is_(None))
        base = base.order_by(model.code.asc())

        total = db.execute(
            select(func.count()).select_from(base.subquery())
        ).scalar_one()
        rows = db.execute(base.limit(limit).offset(offset)).scalars().all()
        return DeptScopedTaxonomyListResponse(
            items=[DeptScopedTaxonomyOut.model_validate(r) for r in rows],
            total=total,
            limit=limit,
            offset=offset,
        )

    @router.post(
        "", response_model=DeptScopedTaxonomyOut, status_code=status.HTTP_201_CREATED
    )
    def create_item(
        payload: DeptScopedTaxonomyCreate,
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> DeptScopedTaxonomyOut:
        _assert_dept_live(db, payload.department_id)
        assert_can_manage_dept(user, payload.department_id)
        obj = model(
            department_id=payload.department_id,
            code=payload.code,
            name=payload.name,
        )
        db.add(obj)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=409, detail="code already exists in this department"
            )
        db.commit()
        db.refresh(obj)
        return DeptScopedTaxonomyOut.model_validate(obj)

    @router.get("/{item_id}", response_model=DeptScopedTaxonomyOut)
    def get_item(
        item_id: uuid.UUID,
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> DeptScopedTaxonomyOut:
        allowed = accessible_department_ids(user)
        return DeptScopedTaxonomyOut.model_validate(
            _fetch_in_scope(db, item_id, allowed)
        )

    @router.patch("/{item_id}", response_model=DeptScopedTaxonomyOut)
    def update_item(
        item_id: uuid.UUID,
        payload: TaxonomyUpdate,
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> DeptScopedTaxonomyOut:
        if payload.code is None and payload.name is None:
            raise HTTPException(
                status_code=422, detail="At least one field is required"
            )
        obj = db.get(model, item_id)
        if obj is None or obj.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Not found")
        assert_can_manage_dept(user, obj.department_id)
        if payload.code is not None:
            obj.code = payload.code
        if payload.name is not None:
            obj.name = payload.name
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            raise HTTPException(
                status_code=409, detail="code already exists in this department"
            )
        db.commit()
        db.refresh(obj)
        return DeptScopedTaxonomyOut.model_validate(obj)

    @router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
    def delete_item(
        item_id: uuid.UUID,
        db: Session = Depends(get_db),
        user: User = Depends(get_current_user),
    ) -> Response:
        obj = db.get(model, item_id)
        if obj is None or obj.deleted_at is not None:
            raise HTTPException(status_code=404, detail="Not found")
        assert_can_manage_dept(user, obj.department_id)
        obj.deleted_at = datetime.now(timezone.utc)
        obj.deleted_by = user.id
        db.commit()
        return Response(status_code=status.HTTP_204_NO_CONTENT)

    return router


departments_router = make_taxonomy_router(
    prefix="/api/admin/departments", tag="departments", model=Department
)
clients_router = make_dept_scoped_taxonomy_router(
    prefix="/api/admin/clients", tag="clients", model=Client
)
disciplines_router = make_dept_scoped_taxonomy_router(
    prefix="/api/admin/disciplines", tag="disciplines", model=Discipline
)
