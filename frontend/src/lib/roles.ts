import type { BadgeTone } from "@/components/Badge"

// Mirror of backend `backend/app/auth/roles.py`. Keep these two in sync.
// Permission ladder (highest → lowest):
//   admin > department_manager > project_editor > viewer
// A grant of a higher role implicitly satisfies any lower-role check.

export const ROLE_HIERARCHY: Record<string, ReadonlyArray<string>> = {
  admin: ["admin", "department_manager", "project_editor", "viewer"],
  department_manager: ["department_manager", "project_editor", "viewer"],
  project_editor: ["project_editor", "viewer"],
  viewer: ["viewer"],
}

export function effectiveRoles(roles: ReadonlyArray<string>): Set<string> {
  const out = new Set<string>()
  for (const r of roles) {
    for (const e of ROLE_HIERARCHY[r] ?? []) {
      out.add(e)
    }
  }
  return out
}

export function hasRole(
  granted: ReadonlyArray<string>,
  required: string,
): boolean {
  return effectiveRoles(granted).has(required)
}

// True when the user holds `role` (or a hierarchy-superior role) via a
// NULL-dept grant. Mirrors backend `is_org_role(user, role)`. Today's
// allowed org-scope grants: (admin, NULL) and (viewer, NULL).
export function isOrgRole(
  grants: ReadonlyArray<{ role_id: string; department_id: string | null }>,
  role: string,
): boolean {
  return grants.some(
    (g) =>
      g.department_id === null &&
      (ROLE_HIERARCHY[g.role_id] ?? []).includes(role),
  )
}

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  department_manager: "Department Manager",
  project_editor: "Project Editor",
  viewer: "Viewer",
}

export function roleLabel(roleId: string): string {
  return ROLE_LABELS[roleId] ?? roleId
}

const ROLE_TONES: Record<string, BadgeTone> = {
  admin: "indigo",
  department_manager: "blue",
  project_editor: "emerald",
  viewer: "slate",
}

export function roleTone(roleId: string): BadgeTone {
  return ROLE_TONES[roleId] ?? "slate"
}
