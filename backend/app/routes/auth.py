import logging

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.passwords import hash_password, needs_rehash, verify_password
from backend.app.auth.rate_limit import login_rate_limiter
from backend.app.auth.scope import accessible_department_ids
from backend.app.auth.sessions import (
    clear_session_cookie,
    set_session_cookie,
    sign_session,
)
from backend.app.config import settings
from backend.app.db.models import AuthProvider, Department, User
from backend.app.db.session import get_db
from backend.app.schemas.auth import LoginRequest
from backend.app.schemas.user import UserOut


class DepartmentBrief(BaseModel):
    id: str
    code: str
    name: str

router = APIRouter(prefix="/api/auth", tags=["auth"])
logger = logging.getLogger("tracker.auth")

_INVALID_CREDENTIALS_DETAIL = "Invalid email or password"


def _user_out(user: User) -> UserOut:
    allowed = accessible_department_ids(user)
    return UserOut(
        id=user.id,
        email=user.email,
        display_name=user.display_name,
        roles=sorted(ur.role_id for ur in user.user_roles),
        accessible_department_ids=(
            None if allowed is None else sorted(allowed)
        ),
    )


def _client_ip(request: Request) -> str:
    return request.client.host if request.client else "unknown"


@router.post("/login", response_model=UserOut)
def login(
    payload: LoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> UserOut:
    ip = _client_ip(request)
    email = payload.email.lower().strip()

    if login_rate_limiter.is_blocked(ip, email):
        logger.warning("login_rate_limited email=%s ip=%s", email, ip)
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed attempts. Try again later.",
        )

    user = db.execute(
        select(User).where(User.email == email, User.deleted_at.is_(None))
    ).scalar_one_or_none()

    provider: AuthProvider | None = None
    if user is not None:
        provider = db.execute(
            select(AuthProvider).where(
                AuthProvider.user_id == user.id,
                AuthProvider.provider == "local",
            )
        ).scalar_one_or_none()

    if (
        user is None
        or provider is None
        or provider.password_hash is None
        or not verify_password(provider.password_hash, payload.password)
    ):
        login_rate_limiter.record_failure(ip, email)
        if user is None:
            reason = "unknown_email"
        elif provider is None:
            reason = "no_local_provider"
        else:
            reason = "bad_password"
        logger.warning("login_failed email=%s ip=%s reason=%s", email, ip, reason)
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_INVALID_CREDENTIALS_DETAIL,
        )

    if user.lifecycle_state != "active":
        login_rate_limiter.record_failure(ip, email)
        logger.warning(
            "login_failed email=%s ip=%s reason=not_active state=%s",
            email,
            ip,
            user.lifecycle_state,
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=_INVALID_CREDENTIALS_DETAIL,
        )

    if provider.password_hash and needs_rehash(provider.password_hash):
        provider.password_hash = hash_password(payload.password)
        db.commit()

    login_rate_limiter.reset(ip, email)

    token = sign_session(user.id, settings.session_secret)
    set_session_cookie(response, token, secure=settings.is_production)

    logger.info(
        "login_success user_id=%s ip=%s ua=%s",
        user.id,
        ip,
        request.headers.get("user-agent", ""),
    )

    return _user_out(user)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response, user: User = Depends(get_current_user)
) -> Response:
    clear_session_cookie(response, secure=settings.is_production)
    logger.info("logout user_id=%s", user.id)
    response.status_code = status.HTTP_204_NO_CONTENT
    return response


@router.get("/me", response_model=UserOut)
def me(user: User = Depends(get_current_user)) -> UserOut:
    return _user_out(user)


@router.get("/me/departments", response_model=list[DepartmentBrief])
def my_departments(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DepartmentBrief]:
    """List the caller's accessible departments with metadata.

    Used by the frontend to populate department-select inputs in the
    contact / client / discipline sheets without needing the admin-only
    /api/admin/departments endpoint. Admins get all live departments;
    non-admins get just the depts in their accessible set.
    """
    allowed = accessible_department_ids(user)
    q = select(Department).where(Department.deleted_at.is_(None))
    if allowed is not None:
        if not allowed:
            return []
        q = q.where(Department.id.in_(allowed))
    q = q.order_by(Department.code.asc())
    rows = db.execute(q).scalars().all()
    return [
        DepartmentBrief(id=str(r.id), code=r.code, name=r.name) for r in rows
    ]


@router.get("/me/manageable-departments", response_model=list[DepartmentBrief])
def my_manageable_departments(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[DepartmentBrief]:
    """Departments the caller can publish a custom view to — those where
    they are a department manager (admins get all live departments)."""
    allowed = accessible_department_ids(user, minimum_role="department_manager")
    q = select(Department).where(Department.deleted_at.is_(None))
    if allowed is not None:
        if not allowed:
            return []
        q = q.where(Department.id.in_(allowed))
    q = q.order_by(Department.code.asc())
    rows = db.execute(q).scalars().all()
    return [
        DepartmentBrief(id=str(r.id), code=r.code, name=r.name) for r in rows
    ]
