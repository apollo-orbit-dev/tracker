import { screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const ADMIN = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "admin@example.com",
  display_name: "Admin",
  roles: ["admin"],
}

const VIEWER = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "viewer@example.com",
  display_name: "Viewer",
  roles: ["viewer"],
}

describe("AdminRoute", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("redirects unauthenticated visitors to /login", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse({ detail: "Not authenticated" }, 401),
      },
    ])
    renderWithProviders(<App />, { route: "/admin" })
    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    })
  })

  it("redirects non-admin authenticated users to /", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(VIEWER),
      },
      {
        match: (u) => u.endsWith("/api/health"),
        respond: () => jsonResponse({ status: "ok" }),
      },
    ])
    renderWithProviders(<App />, { route: "/admin" })
    // Lands on the dashboard, not the admin page. Phase 4.4.1: the
    // dashboard's Welcome card is gone — use the Customize button as
    // the "landed on /" probe instead.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /customize/i }),
      ).toBeInTheDocument()
    })
    expect(screen.queryByRole("heading", { name: /^admin$/i })).not.toBeInTheDocument()
  })

  it("admits admin users into the admin section", async () => {
    // Phase 4.5.1: /admin no longer renders a standalone landing page —
    // it redirects to the first surface the user can reach (Departments
    // for admins). Probe for the admin sub-sidebar's group headings,
    // which only render inside the new AdminLayout shell.
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      // Departments page hits a list endpoint; default-200 anything else.
      {
        match: () => true,
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 50, offset: 0 }),
      },
    ])
    renderWithProviders(<App />, { route: "/admin" })
    await waitFor(() => {
      expect(screen.getByText(/taxonomy/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/accounts/i)).toBeInTheDocument()
    expect(
      screen.getByRole("link", { name: /audit log/i }),
    ).toBeInTheDocument()
  })
})
