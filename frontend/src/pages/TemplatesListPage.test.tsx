import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
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

const DEPT = {
  id: "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  code: "DIV1",
  name: "Division 1",
  created_at: "2026-05-19T00:00:00Z",
  updated_at: "2026-05-19T00:00:00Z",
  deleted_at: null,
}
const CLIENT = {
  id: "bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  code: "CON",
  name: "Contoso",
  created_at: "2026-05-19T00:00:00Z",
  updated_at: "2026-05-19T00:00:00Z",
  deleted_at: null,
}
const DISC = {
  id: "cccc3333-cccc-cccc-cccc-cccccccccccc",
  code: "Design",
  name: "Protection & Controls",
  created_at: "2026-05-19T00:00:00Z",
  updated_at: "2026-05-19T00:00:00Z",
  deleted_at: null,
}

function template(overrides: Partial<{ id: string; name: string }> = {}) {
  return {
    id: overrides.id ?? "dddd4444-dddd-dddd-dddd-dddddddddddd",
    name: overrides.name ?? "DIV1 / CON / Design",
    department_id: DEPT.id,
    client_id: CLIENT.id,
    discipline_id: DISC.id,
    created_at: "2026-05-19T00:00:00Z",
    updated_at: "2026-05-19T00:00:00Z",
    deleted_at: null,
  }
}

const taxonomyStubs = (_forCreateForm = true) => [
  {
    match: (u: string) => u.includes("/api/auth/me/departments"),
    respond: () => jsonResponse([DEPT]),
  },
  {
    match: (u: string) => u.includes("/api/admin/clients"),
    respond: () =>
      jsonResponse({ items: [CLIENT], total: 1, limit: 200, offset: 0 }),
  },
  {
    match: (u: string) => u.includes("/api/admin/disciplines"),
    respond: () =>
      jsonResponse({ items: [DISC], total: 1, limit: 200, offset: 0 }),
  },
]

describe("TemplatesListPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("lists templates with joined taxonomy codes", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u, init) =>
          u.includes("/api/admin/templates") &&
          (!init || init.method === undefined || init.method === "GET"),
        respond: () =>
          jsonResponse({
            items: [template()],
            total: 1,
            limit: 200,
            offset: 0,
          }),
      },
      ...taxonomyStubs(),
    ])
    renderWithProviders(<App />, { route: "/admin/templates" })

    await waitFor(() => {
      expect(screen.getByText("DIV1 / CON / Design")).toBeInTheDocument()
    })
    // Joined codes appear in the row's monospaced cells (DIV1, CON, Design).
    expect(screen.getAllByText("DIV1").length).toBeGreaterThan(0)
    expect(screen.getAllByText("CON").length).toBeGreaterThan(0)
    expect(screen.getAllByText("Design").length).toBeGreaterThan(0)
  })

  it("renders an empty state when there are no templates", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/admin/templates"),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 200, offset: 0 }),
      },
      ...taxonomyStubs(),
    ])
    renderWithProviders(<App />, { route: "/admin/templates" })
    await waitFor(() => {
      expect(screen.getByText(/no templates yet/i)).toBeInTheDocument()
    })
  })

  it("opens the create sheet with name + three taxonomy selects", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/admin/templates"),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 200, offset: 0 }),
      },
      ...taxonomyStubs(),
    ])
    renderWithProviders(<App />, { route: "/admin/templates" })

    await waitFor(() => {
      expect(screen.getByText(/no templates yet/i)).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /new template/i }))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByLabelText(/^name$/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/department/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/client/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/discipline/i)).toBeInTheDocument()
  })

  it("filters templates via the client-side search", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/admin/templates"),
        respond: () =>
          jsonResponse({
            items: [
              template({
                id: "tpl-1",
                name: "DIV1 / CON / Design",
              }),
              template({
                id: "tpl-2",
                name: "DIV4 / FAB / Build",
              }),
            ],
            total: 2,
            limit: 200,
            offset: 0,
          }),
      },
      ...taxonomyStubs(),
    ])
    renderWithProviders(<App />, { route: "/admin/templates" })

    // 5.1: the same template list also feeds the sidebar's Saved Views
    // group, so the names appear in two places. Scope assertions to
    // the page's table body (rowgroup) to disambiguate.
    await waitFor(() => {
      expect(screen.getByText("DIV1 / CON / Design")).toBeInTheDocument()
    })
    const tableBody = screen.getAllByRole("rowgroup")[1]
    expect(
      within(tableBody).getByText("DIV4 / FAB / Build"),
    ).toBeInTheDocument()

    await user.type(screen.getByLabelText(/search templates/i), "FAB")
    await waitFor(() => {
      expect(
        within(tableBody).queryByText("DIV1 / CON / Design"),
      ).not.toBeInTheDocument()
    })
    expect(
      within(tableBody).getByText("DIV4 / FAB / Build"),
    ).toBeInTheDocument()
  })

  it("shows the Templates tile on the admin landing", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
    ])
    renderWithProviders(<App />, { route: "/admin" })
    await waitFor(() => {
      expect(
        screen.getByRole("link", { name: /templates/i }),
      ).toBeInTheDocument()
    })
  })
})
