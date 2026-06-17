"""FastAPI dependency factories for role-gated endpoints.

Usage:
    @router.get("/api/admin/users")
    def list_users(user: User = Depends(require_role("admin"))):
        ...

Behavior:
- `get_current_user` raises 401 when not authenticated.
- The factories below raise 403 when authenticated but missing the role.
"""
import logging
from collections.abc import Callable

from fastapi import Depends, HTTPException, Request, status

from backend.app.auth.dependencies import get_current_user
from backend.app.auth.roles import KNOWN_ROLES, effective_roles
from backend.app.db.models import User

logger = logging.getLogger("tracker.auth")


def _check_unknown(names: tuple[str, ...]) -> None:
    unknown = set(names) - KNOWN_ROLES
    if unknown:
        raise ValueError(f"unknown role(s): {sorted(unknown)}")


def require_role(name: str) -> Callable[..., User]:
    _check_unknown((name,))

    def _dep(
        request: Request, user: User = Depends(get_current_user)
    ) -> User:
        if name in effective_roles(user):
            return user
        logger.warning(
            "permission_denied user_id=%s required=%s path=%s",
            user.id,
            name,
            request.url.path,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden"
        )

    return _dep


def require_any_role(*names: str) -> Callable[..., User]:
    if not names:
        raise ValueError("require_any_role: at least one role required")
    _check_unknown(names)
    required = frozenset(names)

    def _dep(
        request: Request, user: User = Depends(get_current_user)
    ) -> User:
        if required & effective_roles(user):
            return user
        logger.warning(
            "permission_denied user_id=%s required_any=%s path=%s",
            user.id,
            sorted(required),
            request.url.path,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden"
        )

    return _dep
