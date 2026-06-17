import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"
import { renderChanges } from "@/pages/AuditLogPage"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const ADMIN = {
  id: "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  email: "admin@example.com",
  display_name: "Admin",
  roles: ["admin"],
  accessible_department_ids: null,
}

// ---- pure renderer tests (no DOM) --------------------------------------


describe("renderChanges", () => {
  it("renders create as 'Created'", () => {
    expect(
      renderChanges({
        id: 1,
        entity_type: "project",
        entity_id: "x",
        project_id: null,
        operation: "create",
        changes: { initial: { title: "X" } },
        changed_by: null,
        changed_by_email: "u",
        changed_at: "2026-06-08T00:00:00Z",
      }),
    ).toBe("Created")
  })

  it("renders delete as 'Deleted'", () => {
    expect(
      renderChanges({
        id: 1,
        entity_type: "project",
        entity_id: "x",
        project_id: null,
        operation: "delete",
        changes: {},
        changed_by: null,
        changed_by_email: "u",
        changed_at: "2026-06-08T00:00:00Z",
      }),
    ).toBe("Deleted")
  })

  it("renders transition as 'from → to'", () => {
    expect(
      renderChanges({
        id: 1,
        entity_type: "project",
        entity_id: "x",
        project_id: null,
        operation: "transition",
        changes: { from: "draft", to: "active" },
        changed_by: null,
        changed_by_email: "u",
        changed_at: "2026-06-08T00:00:00Z",
      }),
    ).toBe("draft → active")
  })

  it("renders update with per-field diff", () => {
    const out = renderChanges({
      id: 1,
      entity_type: "project",
      entity_id: "x",
      project_id: null,
      operation: "update",
      changes: { title: ["Old", "New"], lifecycle_state: ["draft", "active"] },
      changed_by: null,
      changed_by_email: "u",
      changed_at: "2026-06-08T00:00:00Z",
    })
    expect(out).toContain("title")
    expect(out).toContain("\"Old\" → \"New\"")
    expect(out).toContain("lifecycle_state")
  })

  it("renders user_role grant org-wide", () => {
    expect(
      renderChanges({
        id: 1,
        entity_type: "user_role",
        entity_id: "x",
        project_id: null,
        operation: "grant",
        changes: {
          role_id: "viewer",
          department_id: null,
          user_id: "abc",
        },
        changed_by: null,
        changed_by_email: "u",
        changed_at: "2026-06-08T00:00:00Z",
      }),
    ).toMatch(/Granted viewer \(org-wide\)/)
  })

  it("renders user_role grant in dept", () => {
    expect(
      renderChanges({
        id: 1,
        entity_type: "user_role",
        entity_id: "x",
        project_id: null,
        operation: "grant",
        changes: {
          role_id: "project_editor",
          department_id: "deadbeef-aaaa-bbbb-cccc-deadbeefdead",
          user_id: "abc",
        },
        changed_by: null,
        changed_by_email: "u",
        changed_at: "2026-06-08T00:00:00Z",
      }),
    ).toContain("Granted project_editor in dept")
  })

  it("renders project_role_assignment revoke", () => {
    expect(
      renderChanges({
        id: 1,
        entity_type: "project_role_assignment",
        entity_id: "x",
        project_id: "p",
        operation: "revoke",
        changes: { granted_user_id: "deadbeefaaaabbbb" },
        changed_by: null,
        changed_by_email: "u",
        changed_at: "2026-06-08T00:00:00Z",
      }),
    ).toMatch(/Revoked project access for/)
  })

  it("renders custom_field_values sub-diff", () => {
    const out = renderChanges({
      id: 1,
      entity_type: "project",
      entity_id: "x",
      project_id: "x",
      operation: "update",
      changes: {
        custom_field_values: {
          "deadbeef-aaaa-bbbb-cccc-deadbeefdead": ["500", "650"],
        },
      },
      changed_by: null,
      changed_by_email: "u",
      changed_at: "2026-06-08T00:00:00Z",
    })
    expect(out).toContain("custom_field_values")
    expect(out).toContain("\"500\" → \"650\"")
  })
})


// ---- page smoke tests --------------------------------------------------


describe("AuditLogPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const auditResponse = {
    items: [
      {
        id: 42,
        entity_type: "project",
        entity_id: "eeee7777-eeee-eeee-eeee-eeeeeeeeeeee",
        project_id: "eeee7777-eeee-eeee-eeee-eeeeeeeeeeee",
        operation: "update",
        changes: { title: ["Old", "New"] },
        changed_by: ADMIN.id,
        changed_by_email: ADMIN.email,
        changed_at: "2026-06-08T12:00:00Z",
      },
    ],
    total: 1,
    limit: 50,
    offset: 0,
  }

  it("renders rows from the API", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/admin/audit-log"),
        respond: () => jsonResponse(auditResponse),
      },
    ])
    renderWithProviders(<App />, { route: "/admin/audit-log" })
    await waitFor(() => {
      expect(screen.getByText(/update/i)).toBeInTheDocument()
    })
    // The sidebar also shows the actor's email, so the table cell isn't unique.
    expect(screen.getAllByText(ADMIN.email).length).toBeGreaterThanOrEqual(1)
  })

  it("applies a filter when Apply is clicked", async () => {
    const seen: string[] = []
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/admin/audit-log"),
        respond: (u) => {
          seen.push(u)
          return jsonResponse(auditResponse)
        },
      },
    ])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(<App />, { route: "/admin/audit-log" })
    await waitFor(() => {
      expect(screen.getByText(/update/i)).toBeInTheDocument()
    })
    seen.length = 0
    const userIdInput = screen.getByPlaceholderText(/any user/i)
    await user.type(userIdInput, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    await user.click(screen.getByRole("button", { name: /apply/i }))
    await waitFor(() => {
      expect(
        seen.some((u) => u.includes("user_id=aaaaaaaa")),
      ).toBe(true)
    })
  })

  it("renders empty state when no rows match", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/admin/audit-log"),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 50, offset: 0 }),
      },
    ])
    renderWithProviders(<App />, { route: "/admin/audit-log" })
    await waitFor(() => {
      expect(screen.getByText(/no matching audit entries/i)).toBeInTheDocument()
    })
  })
})
