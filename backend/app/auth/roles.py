"""Role hierarchy and helpers.

A grant of a higher role implicitly satisfies any lower-role permission
check. `effective_roles(user)` returns the full set of roles a user
satisfies based on their explicit grants.

If this hierarchy changes, mirror the change in `frontend/src/lib/roles.ts`.
"""
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from backend.app.db.models import User

ADMIN = "admin"
DEPARTMENT_MANAGER = "department_manager"
PROJECT_EDITOR = "project_editor"
VIEWER = "viewer"

# Each key maps to the set of roles that key implicitly satisfies.
ROLE_HIERARCHY: dict[str, frozenset[str]] = {
    ADMIN: frozenset({ADMIN, DEPARTMENT_MANAGER, PROJECT_EDITOR, VIEWER}),
    DEPARTMENT_MANAGER: frozenset({DEPARTMENT_MANAGER, PROJECT_EDITOR, VIEWER}),
    PROJECT_EDITOR: frozenset({PROJECT_EDITOR, VIEWER}),
    VIEWER: frozenset({VIEWER}),
}

KNOWN_ROLES: frozenset[str] = frozenset(ROLE_HIERARCHY.keys())


def effective_roles_for(granted: list[str] | set[str] | frozenset[str]) -> frozenset[str]:
    """Expand explicit role grants into the full effective role set."""
    result: set[str] = set()
    for role in granted:
        result.update(ROLE_HIERARCHY.get(role, frozenset()))
    return frozenset(result)


def effective_roles(user: "User") -> frozenset[str]:
    """Return the effective role set for a user based on their user_roles rows."""
    return effective_roles_for([ur.role_id for ur in user.user_roles])
