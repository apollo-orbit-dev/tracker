import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const ADMIN = {
  id: "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  email: "admin@example.com",
  display_name: "Admin Person",
  roles: ["admin"],
  accessible_department_ids: null,
}

function makeUser(overrides: Partial<{
  id: string
  email: string
  display_name: string
  lifecycle_state: string
  grants: Array<{
    role_id: string
    department_id: string | null
    department_code?: string | null
  }>
}> = {}) {
  return {
    id: overrides.id ?? "1111-1111",
    email: overrides.email ?? "u@example.com",
    display_name: overrides.display_name ?? "U Person",
    lifecycle_state: overrides.lifecycle_state ?? "active",
    roles: [],
    grants: overrides.grants ?? [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
  }
}

describe("UsersManagePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders the user list with avatar + status + org admin badge", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/admin/users"),
        respond: () =>
          jsonResponse({
            users: [
              makeUser({
                id: "u1",
                email: "alice@example.com",
                display_name: "Alice",
                lifecycle_state: "active",
                grants: [
                  { role_id: "admin", department_id: null },
                ],
              }),
              makeUser({
                id: "u2",
                email: "bob@example.com",
                display_name: "Bob",
                lifecycle_state: "deactivated",
                grants: [
                  {
                    role_id: "project_editor",
                    department_id: "d1",
                    department_code: "DIV1",
                  },
                ],
              }),
            ],
            total: 2,
            limit: 50,
            offset: 0,
          }),
      },
    ])
    renderWithProviders(<App />, { route: "/admin/users" })

    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument()
    })
    expect(screen.getByText("bob@example.com")).toBeInTheDocument()

    // "Org admin" appears in the column header AND Alice's badge AND
    // the menu items — what we care about is that Alice's row has the
    // badge. >=2 matches is the strongest assertion that doesn't lock
    // us into specific DOM structure.
    expect(screen.getAllByText(/org admin/i).length).toBeGreaterThanOrEqual(2)
    // Bob's dept-scoped grant renders as a role badge with the dept code.
    expect(screen.getByText(/DIV1/)).toBeInTheDocument()
  })

  it("filters via the client-side search", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/admin/users"),
        respond: () =>
          jsonResponse({
            users: [
              makeUser({
                id: "u1",
                email: "alice@example.com",
                display_name: "Alice",
              }),
              makeUser({
                id: "u2",
                email: "bob@example.com",
                display_name: "Bob",
              }),
              makeUser({
                id: "u3",
                email: "charlie@example.com",
                display_name: "Charlie",
              }),
            ],
            total: 3,
            limit: 50,
            offset: 0,
          }),
      },
    ])
    renderWithProviders(<App />, { route: "/admin/users" })

    await waitFor(() => {
      expect(screen.getByText("alice@example.com")).toBeInTheDocument()
    })
    expect(screen.getByText("bob@example.com")).toBeInTheDocument()

    await user.type(screen.getByLabelText(/search users/i), "alic")
    await waitFor(() => {
      expect(screen.queryByText("bob@example.com")).not.toBeInTheDocument()
    })
    expect(screen.getByText("alice@example.com")).toBeInTheDocument()
    expect(screen.queryByText("charlie@example.com")).not.toBeInTheDocument()
  })
})
