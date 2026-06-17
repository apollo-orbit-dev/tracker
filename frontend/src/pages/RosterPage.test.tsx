import { screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const DM = {
  id: "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  email: "dm@example.com",
  display_name: "Dept Manager",
  roles: ["department_manager"],
  accessible_department_ids: ["dept-1"],
}

describe("RosterPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders the dept name, role badge, and granted date", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(DM),
      },
      {
        match: (u) => u.endsWith("/api/auth/me/departments"),
        respond: () =>
          jsonResponse([
            { id: "dept-1", code: "DIV1", name: "Division 1" },
          ]),
      },
      {
        match: (u) => u.includes("/api/departments/dept-1/roster"),
        respond: () =>
          jsonResponse({
            items: [
              {
                user_role_id: "ur1",
                user_id: "u1",
                email: "alice@example.com",
                display_name: "Alice",
                role_id: "department_manager",
                created_at: "2026-05-19T00:00:00Z",
              },
            ],
            total: 1,
          }),
      },
    ])
    renderWithProviders(<App />, { route: "/admin/departments/dept-1/roster" })

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: /Division 1/i }),
      ).toBeInTheDocument()
    })
    // Wait for the roster row's role badge ("Department Manager") to appear
    // — that proves the roster query landed too.
    await waitFor(() => {
      expect(screen.getByText(/department manager/i)).toBeInTheDocument()
    })
    // Granted date — locale-formatted; just probe for the year.
    expect(screen.getByText(/2026/)).toBeInTheDocument()
  })
})
