"""Department-scope helpers.

`is_org_role(user, role)` is the generalized NULL-dept sentinel: True
when the user holds `role` (or a hierarchy-superior role) with
`department_id IS NULL`. Today's allowed org-scope grants are
`(admin, NULL)` and `(viewer, NULL)` — Phase 3.0.2 added the latter.

`accessible_department_ids(user, minimum_role)` returns the set of
department UUIDs where the user has at least `minimum_role`, or `None`
when the user has an org-scope grant satisfying `minimum_role`
(interpreted by callers as 'no filter'). Org viewers query against
`minimum_role='viewer'` get `None`; against `'project_editor'` they
fall through to the per-dept aggregation and find nothing.

`has_role_in_dept(user, dept_id, required_role)` short-circuits on
`is_org_role(user, required_role)`, so an org viewer satisfies a viewer
check anywhere but not an editor/manager check anywhere — read-only by
construction.

`assert_can_manage_dept(user, dept_id)` raises 403 unless the caller
satisfies `department_manager+` in `dept_id`.

`directly_granted_project_ids(user)` (Phase 3.0.3) returns the set of
projects the user has been granted explicit read access to via
`project_role_assignments`. `assert_can_view_project` falls through to
this set when dept scope denies; edit/manage helpers do *not* consult
it (direct grants are read-only by construction).

All helpers go through the existing role hierarchy in
`backend/app/auth/roles.py`, so granting `admin` (NULL dept) trumps
everything and granting `department_manager` in dept A satisfies any
`project_editor` / `viewer` query against A.
"""
import uuid
from typing import TYPE_CHECKING

from fastapi import HTTPException, status

from backend.app.auth.roles import (
    ADMIN,
    DEPARTMENT_MANAGER,
    PROJECT_EDITOR,
    VIEWER,
    ROLE_HIERARCHY,
)
from backend.app.db.models import User

if TYPE_CHECKING:
    from backend.app.db.models import Project


def is_org_role(user: User, role: str) -> bool:
    """True when `user` satisfies `role` via a NULL-dept grant.

    Walks the role hierarchy: an org admin satisfies any role; an org
    viewer satisfies viewer only. Today's allowed org-scope grants are
    `(admin, NULL)` and `(viewer, NULL)`.
    """
    for ur in user.user_roles:
        if ur.department_id is not None:
            continue
        if role in ROLE_HIERARCHY.get(ur.role_id, frozenset()):
            return True
    return False


def is_org_admin(user: User) -> bool:
    """Backward-compat alias. Prefer `is_org_role(user, ADMIN)` in new code."""
    return is_org_role(user, ADMIN)


def accessible_department_ids(
    user: User, *, minimum_role: str = "viewer"
) -> set[uuid.UUID] | None:
    """Returns the set of department UUIDs where the user satisfies
    `minimum_role`, or None when the user has an org-scope grant
    satisfying `minimum_role`.

    Callers treat None as 'no filter'; a set (possibly empty) means
    'filter to these dept ids'.
    """
    if is_org_role(user, minimum_role):
        return None

    result: set[uuid.UUID] = set()
    for ur in user.user_roles:
        if ur.department_id is None:
            continue
        effective = ROLE_HIERARCHY.get(ur.role_id, frozenset())
        if minimum_role in effective:
            result.add(ur.department_id)
    return result


def has_role_in_dept(
    user: User, dept_id: uuid.UUID, required_role: str
) -> bool:
    """Cheap predicate: does `user` satisfy `required_role` in `dept_id`?

    Short-circuits on an org-scope grant of `required_role` (admin
    satisfies anything; org viewer satisfies viewer anywhere).
    """
    if is_org_role(user, required_role):
        return True
    for ur in user.user_roles:
        if ur.department_id != dept_id:
            continue
        effective = ROLE_HIERARCHY.get(ur.role_id, frozenset())
        if required_role in effective:
            return True
    return False


def assert_can_manage_dept(user: User, dept_id: uuid.UUID) -> None:
    """403 unless caller is org admin OR has department_manager+ in dept_id."""
    if not has_role_in_dept(user, dept_id, DEPARTMENT_MANAGER):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to manage this department",
        )


def assert_can_edit_dept(user: User, dept_id: uuid.UUID) -> None:
    """403 unless caller has project_editor+ in dept_id.

    Used by project create: gate the caller on the *template's* dept
    before the project itself exists.
    """
    if not has_role_in_dept(user, dept_id, PROJECT_EDITOR):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to edit projects in this department",
        )


def _project_dept_id(project: "Project") -> uuid.UUID:
    """Resolve a project's department via its template.

    Caller must have loaded `project.template` (via selectinload or a fresh
    query) before invoking. Raises AttributeError if template is missing —
    that's a programmer error, not a runtime auth check.
    """
    return project.template.department_id


def directly_granted_project_ids(user: User) -> set[uuid.UUID]:
    """Project IDs the user can read via `project_role_assignments`
    (Phase 3.0.3 — direct read-only grants).

    Independent of dept scope. Edit checks intentionally do not consult
    this set — direct grants are read-only by construction.
    """
    return {pra.project_id for pra in user.project_role_assignments}


def assert_can_view_project(user: User, project: "Project") -> None:
    """404 unless caller can read this project via either dept scope or
    a direct project-role assignment.

    Returns 404 (not 403) on out-of-scope reads so the project's existence
    doesn't leak to users without access — mirrors the dept-scoped GET
    behavior from 1.9.2.
    """
    if has_role_in_dept(user, _project_dept_id(project), VIEWER):
        return
    if project.id in directly_granted_project_ids(user):
        return
    raise HTTPException(status_code=404, detail="Project not found")


def assert_can_edit_project(user: User, project: "Project") -> None:
    """403 unless caller has project_editor+ in the project's dept."""
    if not has_role_in_dept(user, _project_dept_id(project), PROJECT_EDITOR):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to edit this project",
        )
