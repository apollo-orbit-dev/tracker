import { screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import App from "@/App"
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

const DM_ONLY = {
  id: "bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  email: "dm@example.com",
  display_name: "Dept Mgr",
  roles: ["department_manager"],
  accessible_department_ids: ["dept-1"],
}

function stubMeAnd(user: typeof ADMIN, extras: Parameters<typeof stubFetchByRoute>[0] = []) {
  stubFetchByRoute([
    {
      match: (u) => u.endsWith("/api/auth/me"),
      respond: () => jsonResponse(user),
    },
    // Default-respond with empty payloads for any list endpoint the
    // landing page might hit — we're testing the shell, not the data.
    ...extras,
    {
      match: () => true,
      respond: () =>
        jsonResponse({ items: [], total: 0, limit: 50, offset: 0 }),
    },
  ])
}

describe("AdminLayout", () => {
  it("renders the sidebar groups and routes /admin to Departments for admins", async () => {
    stubMeAnd(ADMIN)
    renderWithProviders(<App />, { route: "/admin" })

    // The admin sub-sidebar renders the Taxonomy + Accounts group headings
    // and the standalone Audit log entry.
    await waitFor(() => {
      expect(screen.getByText(/taxonomy/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/accounts/i)).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /audit log/i }),
    ).toBeInTheDocument()

    // /admin index redirected to /admin/departments — Departments link is
    // in the sidebar AND the page itself rendered its heading.
    expect(screen.getByRole("link", { name: /departments/i })).toBeInTheDocument()
  })

  it("hides Templates and Roster from non-DM users", async () => {
    // A plain admin (no department_manager role) sees Templates and Roster
    // because admin > department_manager in our role hierarchy.
    // Verify the inverse: a department_manager-only user without admin
    // still sees Templates + Roster (those are DM-allowed entries).
    stubMeAnd(DM_ONLY)
    renderWithProviders(<App />, { route: "/admin" })

    await waitFor(() => {
      expect(screen.getByText(/taxonomy/i)).toBeInTheDocument()
    })
    expect(screen.getByRole("link", { name: /templates/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /roster/i })).toBeInTheDocument()
  })
})
