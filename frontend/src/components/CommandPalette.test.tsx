import { fireEvent, screen, waitFor, within } from "@testing-library/react"
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

const PROJECT = {
  id: "proj-1",
  project_number: "MES-2025-001",
  client_project_number: null,
  title: "Hawthorn Rollout",
  template_id: "tpl-1",
  lifecycle_state: "active",
  custom_field_values: {},
  created_by: "u",
  created_at: "2026-05-19T00:00:00Z",
  updated_at: "2026-05-19T00:00:00Z",
  deleted_at: null,
  template_name: "DIV1 / CON / Design",
  template_intersection: "DIV1 · CON · Design",
}

function commonStubs(extra: Parameters<typeof stubFetchByRoute>[0] = []) {
  stubFetchByRoute([
    {
      match: (u) => u.endsWith("/api/auth/me"),
      respond: () => jsonResponse(ADMIN),
    },
    ...extra,
    {
      match: () => true,
      respond: () =>
        jsonResponse({ items: [], total: 0, limit: 50, offset: 0 }),
    },
  ])
}

describe("CommandPalette", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("opens on cmd+K and closes on Esc", async () => {
    const user = userEvent.setup()
    commonStubs()
    renderWithProviders(<App />, { route: "/" })

    // Wait for the app shell to mount.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /search or run a command/i }),
      ).toBeInTheDocument()
    })

    // Trigger the global cmd+K handler.
    fireEvent.keyDown(window, { key: "k", metaKey: true })
    const dialog = await screen.findByRole("dialog")
    expect(
      within(dialog).getByPlaceholderText(
        /search projects or type a command/i,
      ),
    ).toBeInTheDocument()
    // Scope to the dialog — the sidebar also has Dashboard/Projects links.
    expect(within(dialog).getByText("Dashboard")).toBeInTheDocument()
    expect(within(dialog).getByText("Projects")).toBeInTheDocument()

    // Esc closes.
    await user.keyboard("{Escape}")
    await waitFor(() => {
      expect(
        screen.queryByPlaceholderText(/search projects or type a command/i),
      ).not.toBeInTheDocument()
    })
  })

  it("opens when the topbar trigger is clicked", async () => {
    const user = userEvent.setup()
    commonStubs()
    renderWithProviders(<App />, { route: "/" })

    const trigger = await screen.findByRole("button", {
      name: /search or run a command/i,
    })
    await user.click(trigger)
    await waitFor(() => {
      expect(
        screen.getByPlaceholderText(/search projects or type a command/i),
      ).toBeInTheDocument()
    })
  })

  it("renders a New project action in an Actions group for editors", async () => {
    commonStubs()
    renderWithProviders(<App />, { route: "/" })

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /search or run a command/i }),
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: "k", metaKey: true })
    const dialog = await screen.findByRole("dialog")
    // Admin → has project_editor by hierarchy → Actions group shows.
    expect(within(dialog).getByText("Actions")).toBeInTheDocument()
    expect(within(dialog).getByText("New project")).toBeInTheDocument()
  })

  it("lists saved views and a New view action", async () => {
    commonStubs([
      {
        match: (u) => u.endsWith("/api/views"),
        respond: () =>
          jsonResponse({
            items: [
              {
                id: "v1",
                name: "Budget health",
                order_index: 0,
                published_department_id: null,
                is_owner: true,
                owner_name: "Admin",
                published_department_code: null,
              },
            ],
          }),
      },
    ])
    renderWithProviders(<App />, { route: "/" })

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /search or run a command/i }),
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: "k", metaKey: true })
    const dialog = await screen.findByRole("dialog")
    await waitFor(() => {
      expect(within(dialog).getByText("Budget health")).toBeInTheDocument()
    })
    expect(within(dialog).getByText(/new view/i)).toBeInTheDocument()
  })

  it("selecting a saved view navigates to it", async () => {
    const user = userEvent.setup()
    commonStubs([
      {
        match: (u) => u.endsWith("/api/views"),
        respond: () =>
          jsonResponse({
            items: [
              {
                id: "v1",
                name: "Budget health",
                order_index: 0,
                published_department_id: null,
                is_owner: true,
                owner_name: "Admin",
                published_department_code: null,
              },
            ],
          }),
      },
    ])
    renderWithProviders(<App />, { route: "/" })

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /search or run a command/i }),
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: "k", metaKey: true })
    const dialog = await screen.findByRole("dialog")
    await within(dialog).findByText("Budget health")
    await user.click(within(dialog).getByText("Budget health"))
    // Navigating to /views/v1 unmounts the palette dialog.
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    })
    // The ViewPage route mounts (it will show its own loading/not-found
    // state, but the URL change is the assertion that the nav fired).
    await waitFor(() => {
      const fetchFn = window.fetch as unknown as ReturnType<typeof vi.fn>
      const hitBlocks = fetchFn.mock.calls.some(([u]) =>
        String(u).includes("/api/views/v1/blocks"),
      )
      expect(hitBlocks).toBe(true)
    })
  })

  it("renders matching projects after typing a query", async () => {
    const user = userEvent.setup()
    let lastUrl = ""
    commonStubs([
      {
        match: (u) => u.startsWith("/api/projects") || u.includes("/api/projects?"),
        respond: (u) => {
          lastUrl = u
          return jsonResponse({
            items: [PROJECT],
            total: 1,
            limit: 8,
            offset: 0,
            page: 1,
            page_size: 8,
          })
        },
      },
    ])
    renderWithProviders(<App />, { route: "/" })

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /search or run a command/i }),
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: "k", metaKey: true })
    const input = await screen.findByPlaceholderText(
      /search projects or type a command/i,
    )
    await user.type(input, "hawthorn")

    await waitFor(() => {
      expect(screen.getByText("Hawthorn Rollout")).toBeInTheDocument()
    })
    expect(lastUrl).toContain("q=hawthorn")
  })
})
