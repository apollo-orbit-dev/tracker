import { describe, expect, it } from "vitest"

import { isOrgRole } from "./roles"

const g = (role_id: string, department_id: string | null = null) => ({
  role_id,
  department_id,
})

describe("isOrgRole", () => {
  it("org admin satisfies any role", () => {
    const grants = [g("admin")]
    expect(isOrgRole(grants, "admin")).toBe(true)
    expect(isOrgRole(grants, "department_manager")).toBe(true)
    expect(isOrgRole(grants, "project_editor")).toBe(true)
    expect(isOrgRole(grants, "viewer")).toBe(true)
  })

  it("org viewer satisfies viewer only", () => {
    const grants = [g("viewer")]
    expect(isOrgRole(grants, "viewer")).toBe(true)
    expect(isOrgRole(grants, "project_editor")).toBe(false)
    expect(isOrgRole(grants, "department_manager")).toBe(false)
    expect(isOrgRole(grants, "admin")).toBe(false)
  })

  it("dept-only viewer is not org-scope", () => {
    const grants = [g("viewer", "dept-uuid-1")]
    expect(isOrgRole(grants, "viewer")).toBe(false)
  })

  it("empty grant list yields false", () => {
    expect(isOrgRole([], "viewer")).toBe(false)
    expect(isOrgRole([], "admin")).toBe(false)
  })

  it("ignores dept-bound grants when checking org scope", () => {
    const grants = [
      g("department_manager", "dept-uuid-1"),
      g("project_editor", "dept-uuid-2"),
    ]
    expect(isOrgRole(grants, "viewer")).toBe(false)
    expect(isOrgRole(grants, "project_editor")).toBe(false)
  })

  it("mixed org-viewer plus dept grants still surfaces org viewer", () => {
    const grants = [g("project_editor", "dept-uuid-1"), g("viewer")]
    expect(isOrgRole(grants, "viewer")).toBe(true)
    expect(isOrgRole(grants, "project_editor")).toBe(false)
  })

  it("unknown role_id is ignored", () => {
    const grants = [g("synthetic_role")]
    expect(isOrgRole(grants, "viewer")).toBe(false)
  })
})
