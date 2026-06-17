// Department-scope helpers (mirrors `backend/app/auth/scope.py`).
//
// `accessible_department_ids` semantics on the User object:
//   - null      → org admin; can see/manage every department
//   - string[]  → explicit list of department UUIDs the user can see
//                 (empty list = no department access)

import type { User } from "@/api/auth"
import { hasRole } from "@/lib/roles"

export function isOrgAdmin(user: User | null | undefined): boolean {
  return !!user && user.accessible_department_ids === null
}

export function canViewDept(
  user: User | null | undefined,
  deptId: string,
): boolean {
  if (!user) return false
  if (user.accessible_department_ids === null) return true
  return user.accessible_department_ids.includes(deptId)
}

// Mutations on dept-scoped resources require `department_manager+` in the
// resource's dept. Server is authoritative — this is for hiding UI.
// We can't tell from the User object alone which role the user has in
// each dept, so we approximate: org-admin OR a non-admin user whose grant
// set includes `department_manager` AND deptId is in their accessible
// list. The hierarchy check is performed in two halves:
//   1. role-level: any of the user's roles satisfies `department_manager`?
//   2. dept-level: is deptId in the user's accessible list?
// The server enforces the real rule; this just hides the obvious cases.
export function canManageDept(
  user: User | null | undefined,
  deptId: string,
): boolean {
  if (!user) return false
  if (user.accessible_department_ids === null) return true
  if (!user.accessible_department_ids.includes(deptId)) return false
  return hasRole(user.roles, "department_manager")
}

// "Can manage *any* department" — useful for showing "create new" buttons
// on dept-scoped resources. Org admin OR a DM in at least one dept.
export function canManageAnyDept(user: User | null | undefined): boolean {
  if (!user) return false
  if (user.accessible_department_ids === null) return true
  return (
    user.accessible_department_ids.length > 0 &&
    hasRole(user.roles, "department_manager")
  )
}
