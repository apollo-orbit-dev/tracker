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
  display_name: "Admin",
  roles: ["admin"],
  accessible_department_ids: null,
}

const DEPT = {
  id: "dept-1",
  code: "DIV1",
  name: "Division 1",
}

function makeContact(overrides: Partial<{
  id: string
  name: string
  email: string | null
  phone: string | null
  organization: string | null
  department_id: string
}> = {}) {
  return {
    id: overrides.id ?? "c1",
    department_id: overrides.department_id ?? DEPT.id,
    name: overrides.name ?? "Alice Smith",
    email: overrides.email === undefined ? "alice@example.com" : overrides.email,
    phone: overrides.phone === undefined ? "555-0100" : overrides.phone,
    organization: overrides.organization === undefined ? "Contoso" : overrides.organization,
    created_at: "2026-05-19T00:00:00Z",
    updated_at: "2026-05-19T00:00:00Z",
    deleted_at: null,
  }
}

describe("ContactsManagePage", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders the contact list with dept chip + mailto/tel links", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith("/api/auth/me/departments"),
        respond: () => jsonResponse([DEPT]),
      },
      {
        match: (u) => u.includes("/api/admin/contacts"),
        respond: () =>
          jsonResponse({
            items: [makeContact()],
            total: 1,
            limit: 200,
            offset: 0,
          }),
      },
    ])
    renderWithProviders(<App />, { route: "/admin/contacts" })

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument()
    })
    // Dept chip renders the dept code (not the id).
    expect(screen.getByText("DIV1")).toBeInTheDocument()
    // Email cell is a real <a href="mailto:…"> link, not plain text.
    const mailto = screen.getByRole("link", { name: "alice@example.com" })
    expect(mailto.getAttribute("href")).toBe("mailto:alice@example.com")
    // Same for phone.
    const tel = screen.getByRole("link", { name: "555-0100" })
    expect(tel.getAttribute("href")).toBe("tel:555-0100")
    // Organization rendered as plain text.
    expect(screen.getByText("Contoso")).toBeInTheDocument()
  })

  it("filters rows via the client-side search", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith("/api/auth/me/departments"),
        respond: () => jsonResponse([DEPT]),
      },
      {
        match: (u) => u.includes("/api/admin/contacts"),
        respond: () =>
          jsonResponse({
            items: [
              makeContact({ id: "c1", name: "Alice Smith" }),
              makeContact({ id: "c2", name: "Bob Jones", email: "bob@example.com" }),
              makeContact({ id: "c3", name: "Charlie Wong", email: "c@example.com" }),
            ],
            total: 3,
            limit: 200,
            offset: 0,
          }),
      },
    ])
    renderWithProviders(<App />, { route: "/admin/contacts" })

    await waitFor(() => {
      expect(screen.getByText("Alice Smith")).toBeInTheDocument()
    })
    expect(screen.getByText("Bob Jones")).toBeInTheDocument()

    await user.type(screen.getByLabelText(/search contacts/i), "bob")
    await waitFor(() => {
      expect(screen.queryByText("Alice Smith")).not.toBeInTheDocument()
    })
    expect(screen.getByText("Bob Jones")).toBeInTheDocument()
    expect(screen.queryByText("Charlie Wong")).not.toBeInTheDocument()
  })
})
