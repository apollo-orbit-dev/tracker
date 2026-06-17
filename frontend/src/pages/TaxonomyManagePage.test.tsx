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

function makeItem(overrides: Partial<{
  id: string
  code: string
  name: string
  deleted_at: string | null
}> = {}) {
  return {
    id: overrides.id ?? "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    code: overrides.code ?? "DIV1",
    name: overrides.name ?? "Division 1",
    created_at: "2026-05-19T00:00:00Z",
    updated_at: "2026-05-19T00:00:00Z",
    deleted_at: overrides.deleted_at ?? null,
  }
}

describe("TaxonomyManagePage (departments)", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("lists existing items", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/admin/departments"),
        respond: () =>
          jsonResponse({
            items: [makeItem({ code: "DIV1" }), makeItem({ id: "bbb", code: "DIV2", name: "Division 2" })],
            total: 2,
            limit: 200,
            offset: 0,
          }),
      },
    ])
    renderWithProviders(<App />, { route: "/admin/departments" })

    await waitFor(() => {
      expect(screen.getByText("DIV1")).toBeInTheDocument()
    })
    expect(screen.getByText("DIV2")).toBeInTheDocument()
  })

  it("renders an empty state when there are no items", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/admin/departments"),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 200, offset: 0 }),
      },
    ])
    renderWithProviders(<App />, { route: "/admin/departments" })
    await waitFor(() => {
      expect(screen.getByText(/no departments yet/i)).toBeInTheDocument()
    })
  })

  it("creates a new item", async () => {
    const user = userEvent.setup()
    let created = false
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u, init) =>
          u.includes("/api/admin/departments") && init?.method === "POST",
        respond: () => {
          created = true
          return jsonResponse(makeItem({ code: "NEW", name: "New Dept" }), 201)
        },
      },
      {
        match: (u) => u.includes("/api/admin/departments"),
        respond: () =>
          jsonResponse({
            items: created
              ? [makeItem({ code: "NEW", name: "New Dept" })]
              : [],
            total: created ? 1 : 0,
            limit: 200,
            offset: 0,
          }),
      },
    ])
    renderWithProviders(<App />, { route: "/admin/departments" })

    await waitFor(() => {
      expect(screen.getByText(/no departments yet/i)).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /new department/i }))

    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText(/code/i), "NEW")
    await user.type(within(dialog).getByLabelText(/name/i), "New Dept")
    await user.click(
      within(dialog).getByRole("button", { name: /create department/i }),
    )

    await waitFor(() => {
      expect(screen.getByText("NEW")).toBeInTheDocument()
    })
  })

  it("surfaces 409 from the server in the form", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u, init) =>
          u.includes("/api/admin/departments") && init?.method === "POST",
        respond: () => jsonResponse({ detail: "code already exists" }, 409),
      },
      {
        match: (u) => u.includes("/api/admin/departments"),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 200, offset: 0 }),
      },
    ])
    renderWithProviders(<App />, { route: "/admin/departments" })

    await waitFor(() => {
      expect(screen.getByText(/no departments yet/i)).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /new department/i }))

    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText(/code/i), "DIV1")
    await user.type(within(dialog).getByLabelText(/name/i), "Dup")
    await user.click(
      within(dialog).getByRole("button", { name: /create department/i }),
    )

    await waitFor(() => {
      expect(
        within(dialog).getByText(/code already exists/i),
      ).toBeInTheDocument()
    })
  })

  it("filters rows via the client-side search", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/admin/departments"),
        respond: () =>
          jsonResponse({
            items: [
              makeItem({ code: "DIV1", name: "Division 1" }),
              makeItem({
                id: "bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
                code: "DIV4",
                name: "Operations 4",
              }),
              makeItem({
                id: "cccc3333-cccc-cccc-cccc-cccccccccccc",
                code: "DIV2",
                name: "Division 2",
              }),
            ],
            total: 3,
            limit: 200,
            offset: 0,
          }),
      },
    ])
    renderWithProviders(<App />, { route: "/admin/departments" })

    await waitFor(() => {
      expect(screen.getByText("DIV1")).toBeInTheDocument()
    })
    expect(screen.getByText("DIV4")).toBeInTheDocument()

    await user.type(screen.getByLabelText(/search departments/i), "Division")
    await waitFor(() => {
      expect(screen.queryByText("DIV4")).not.toBeInTheDocument()
    })
    expect(screen.getByText("DIV1")).toBeInTheDocument()
    expect(screen.getByText("DIV2")).toBeInTheDocument()
  })

  it("blocks submit when code is empty", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/admin/departments"),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 200, offset: 0 }),
      },
    ])
    renderWithProviders(<App />, { route: "/admin/departments" })

    await waitFor(() => {
      expect(screen.getByText(/no departments yet/i)).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /new department/i }))

    const dialog = await screen.findByRole("dialog")
    await user.type(within(dialog).getByLabelText(/name/i), "No code")
    await user.click(
      within(dialog).getByRole("button", { name: /create department/i }),
    )

    await waitFor(() => {
      expect(within(dialog).getByText(/code is required/i)).toBeInTheDocument()
    })
    const postCalls = fetchMock.mock.calls.filter(
      (c) =>
        String(c[0]).includes("/api/admin/departments") &&
        (c[1] as RequestInit | undefined)?.method === "POST",
    )
    expect(postCalls).toHaveLength(0)
  })
})
