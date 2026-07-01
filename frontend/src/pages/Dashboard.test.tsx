import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"
import type { DashboardWidget } from "@/api/dashboard_widgets"
import { applyDragEnd } from "@/pages/dashboardDragEnd"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const ADMIN_USER = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "admin@example.com",
  display_name: "Admin",
  roles: ["admin"],
}

// Dashboard fires 6 queries on mount in Phase 2.4: dashboards list,
// the active dashboard's widget list, plus the four widget data feeds.
// Stub them all with empty-ish responses so the page renders cleanly.
const FAKE_DID = "dddddddd-dddd-dddd-dddd-dddddddddddd"
type WidgetItem = {
  id: string
  dashboard_id: string
  widget_type: string
  order_index: number
  width: number
  column: 0 | 1
  title: string | null
  config: Record<string, unknown> | null
}
const DEFAULT_WIDGETS: WidgetItem[] = [
  { id: "w1", dashboard_id: FAKE_DID, widget_type: "lifecycle",
    order_index: 0, width: 2, column: 0, title: null, config: null },
  { id: "w2", dashboard_id: FAKE_DID, widget_type: "milestone_lookahead",
    order_index: 1, width: 1, column: 0, title: null, config: null },
  { id: "w3", dashboard_id: FAKE_DID, widget_type: "recent_activity",
    order_index: 2, width: 1, column: 1, title: null, config: null },
  { id: "w4", dashboard_id: FAKE_DID, widget_type: "cor_summary",
    order_index: 3, width: 2, column: 0, title: null, config: null },
]
function widgetStubsWith(items: WidgetItem[] = DEFAULT_WIDGETS) {
  return [
    {
      match: (u: string) => u.endsWith("/api/dashboards"),
      respond: () =>
        jsonResponse({
          items: [{ id: FAKE_DID, name: "Dashboard", order_index: 0 }],
        }),
    },
    {
      match: (u: string) =>
        u.includes(`/api/dashboards/${FAKE_DID}/widgets`) &&
        !u.endsWith("/reorder"),
      respond: () => jsonResponse({ items }),
    },
    {
      match: (u: string) => u.endsWith("/api/dashboard/projects/lifecycle"),
      respond: () =>
        jsonResponse({
          draft: 0,
          active: 0,
          on_hold: 0,
          complete: 0,
          cancelled: 0,
        }),
    },
    {
      match: (u: string) => u.includes("/api/dashboard/milestones/lookahead"),
      respond: () => jsonResponse({ items: [], total: 0 }),
    },
    {
      match: (u: string) => u.endsWith("/api/dashboard/cors/summary"),
      respond: () => jsonResponse({ by_status: [] }),
    },
    {
      match: (u: string) => u.includes("/api/dashboard/activity/recent"),
      respond: () => jsonResponse({ items: [] }),
    },
  ]
}
const widgetStubs = widgetStubsWith()

describe("Dashboard", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("redirects to /login when unauthenticated", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse({ detail: "Not authenticated" }, 401),
      },
    ])
    renderWithProviders(<App />, { route: "/" })

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    })
  })

  // Phase 4.4.1: Welcome card + roles list removed. The user's identity +
  // roles are visible from the sidebar user-menu in 4.1.

  it("renders the topbar breadcrumb 'Dashboard'", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN_USER),
      },
      ...widgetStubs,
    ])
    renderWithProviders(<App />, { route: "/" })
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /customize/i }),
      ).toBeInTheDocument()
    })
    const breadcrumb = screen.getByRole("navigation", {
      name: /breadcrumb/i,
    })
    expect(breadcrumb).toHaveTextContent("Dashboard")
  })

  it("renders the lifecycle widget with zero counts", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN_USER),
      },
      ...widgetStubs,
    ])
    renderWithProviders(<App />, { route: "/" })
    await waitFor(() => {
      expect(screen.getByText(/projects by lifecycle/i)).toBeInTheDocument()
    })
  })

  it("logs out and redirects to /login", async () => {
    const user = userEvent.setup()
    let authed = true
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () =>
          authed
            ? jsonResponse(ADMIN_USER)
            : jsonResponse({ detail: "Not authenticated" }, 401),
      },
      ...widgetStubs,
      {
        match: (u) => u.endsWith("/api/auth/logout"),
        respond: () => {
          authed = false
          return new Response(null, { status: 204 })
        },
      },
    ])
    renderWithProviders(<App />, { route: "/" })

    await waitFor(() => {
      // Phase 4.4.1: Welcome card is gone; use the Customize button as the
      // "page rendered" probe.
      expect(
        screen.getByRole("button", { name: /customize/i }),
      ).toBeInTheDocument()
    })
    await user.click(
      screen.getByRole("button", { name: /open user menu/i }),
    )
    await user.click(
      await screen.findByRole("menuitem", { name: /sign out/i }),
    )

    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    })
  })

  // ---- Phase 2.11.2 — DashboardLayout integration -----------------------

  it("renders two columns for a run of half-width widgets", async () => {
    // 4 half-width widgets split column 0/1/0/1 → one run with two
    // populated columns. Each row container carries `md:flex-row` so we
    // can find it in the DOM.
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN_USER),
      },
      ...widgetStubsWith([
        { id: "h1", dashboard_id: FAKE_DID, widget_type: "milestone_lookahead",
          order_index: 0, width: 1, column: 0, title: null, config: null },
        { id: "h2", dashboard_id: FAKE_DID, widget_type: "recent_activity",
          order_index: 1, width: 1, column: 1, title: null, config: null },
        { id: "h3", dashboard_id: FAKE_DID, widget_type: "milestone_lookahead",
          order_index: 2, width: 1, column: 0, title: null, config: null },
        { id: "h4", dashboard_id: FAKE_DID, widget_type: "recent_activity",
          order_index: 3, width: 1, column: 1, title: null, config: null },
      ]),
    ])
    const { container } = renderWithProviders(<App />, { route: "/" })

    await waitFor(() => {
      // Both widgets in the run must have rendered before we assert on
      // the layout — otherwise the SortableContext might not have fully
      // mounted yet.
      expect(
        container.querySelectorAll(".md\\:flex-row").length,
      ).toBeGreaterThanOrEqual(1)
    })

    const rows = container.querySelectorAll(".md\\:flex-row")
    expect(rows.length).toBeGreaterThanOrEqual(1)
    // Inside the row, the two inner flex-col columns should both render.
    const row = rows[0]
    const innerCols = row.querySelectorAll(":scope > .flex.min-w-0.flex-1")
    expect(innerCols).toHaveLength(2)
  })

  it("renders both columns at half-width even when one column is empty (view mode)", async () => {
    // Auto-collapsing the empty column made widgets unexpectedly grow
    // when their counterpart slot happened to be empty (especially right
    // after a width=2 widget reset the column-pos run). Both columns now
    // always render, regardless of whether they're populated, so widget
    // widths stay consistent.
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN_USER),
      },
      ...widgetStubsWith([
        { id: "h1", dashboard_id: FAKE_DID, widget_type: "milestone_lookahead",
          order_index: 0, width: 1, column: 0, title: null, config: null },
        { id: "h2", dashboard_id: FAKE_DID, widget_type: "recent_activity",
          order_index: 1, width: 1, column: 0, title: null, config: null },
      ]),
    ])
    const { container } = renderWithProviders(<App />, { route: "/" })

    await waitFor(() => {
      expect(container.querySelectorAll(".md\\:flex-row")).toHaveLength(1)
    })

    // No "Drop here" placeholder in view mode.
    expect(screen.queryByText(/drop here/i)).not.toBeInTheDocument()
    // Both inner columns render even though the right column is empty.
    const rows = container.querySelectorAll(".md\\:flex-row")
    expect(rows).toHaveLength(1)
    const innerCols = rows[0].querySelectorAll(
      ":scope > .flex.min-w-0.flex-1",
    )
    expect(innerCols).toHaveLength(2)
  })

  it("renders the empty-column placeholder in customize mode", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN_USER),
      },
      ...widgetStubsWith([
        { id: "h1", dashboard_id: FAKE_DID, widget_type: "milestone_lookahead",
          order_index: 0, width: 1, column: 0, title: null, config: null },
        { id: "h2", dashboard_id: FAKE_DID, widget_type: "recent_activity",
          order_index: 1, width: 1, column: 0, title: null, config: null },
      ]),
    ])
    renderWithProviders(<App />, { route: "/" })

    await waitFor(() => {
      // Phase 4.4.1: Welcome card is gone; use the Customize button as the
      // "page rendered" probe.
      expect(
        screen.getByRole("button", { name: /customize/i }),
      ).toBeInTheDocument()
    })

    // Toggle customize mode on.
    await user.click(screen.getByRole("button", { name: /customize/i }))

    expect(await screen.findByText(/drop here/i)).toBeInTheDocument()
  })

  it("applyDragEnd updates the dragged widget's column when dropped on a column-1 widget", () => {
    // The reducer encodes the cross-column drag rule. Unit-testing it
    // directly is more reliable than driving dnd-kit through jsdom (see
    // Phase 2.7 caveat).
    const widgets: DashboardWidget[] = [
      { id: "a", dashboard_id: FAKE_DID, widget_type: "x",
        order_index: 0, width: 1, column: 0, title: null, config: null },
      { id: "b", dashboard_id: FAKE_DID, widget_type: "x",
        order_index: 1, width: 1, column: 1, title: null, config: null },
    ]
    const next = applyDragEnd(widgets, {
      active: { id: "a" },
      over: { id: "b" },
    })
    // The dragged widget should now be in column 1; would-be PATCH payload
    // contains the new column.
    const draggedAfter = next.find((w) => w.id === "a")!
    expect(draggedAfter.column).toBe(1)
    const items = next.map((w) => ({ id: w.id, column: w.column }))
    expect(items.find((i) => i.id === "a")?.column).toBe(1)
  })

  it("renders a flat single column on mobile viewports regardless of column_pos", async () => {
    // Force the mobile breakpoint. useIsMobile reads window.matchMedia
    // and window.innerWidth.
    Object.defineProperty(window, "innerWidth", {
      writable: true,
      configurable: true,
      value: 500,
    })
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockImplementation((q: string) => ({
        matches: true,
        media: q,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
        onchange: null,
      })),
    )

    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN_USER),
      },
      ...widgetStubsWith([
        { id: "h1", dashboard_id: FAKE_DID, widget_type: "milestone_lookahead",
          order_index: 0, width: 1, column: 0, title: null, config: null },
        { id: "h2", dashboard_id: FAKE_DID, widget_type: "recent_activity",
          order_index: 1, width: 1, column: 1, title: null, config: null },
      ]),
    ])
    const { container } = renderWithProviders(<App />, { route: "/" })

    await waitFor(() => {
      // Phase 4.4.1: Welcome card is gone; use the Customize button as the
      // "page rendered" probe.
      expect(
        screen.getByRole("button", { name: /customize/i }),
      ).toBeInTheDocument()
    })

    // Mobile path bypasses the run/column layout. No md:flex-row row
    // container should render.
    const rows = container.querySelectorAll(".md\\:flex-row")
    expect(rows).toHaveLength(0)
  })

  // ---- Phase 4.8.2 underline tab strip ----------------------------------

  it("active dashboard tab has aria-selected + the design ref border", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN_USER),
      },
      ...widgetStubs,
    ])
    renderWithProviders(<App />, { route: "/" })

    // Only one dashboard seeded in widgetStubs → it'll be the active tab.
    const tab = await screen.findByRole("tab", { name: "Dashboard" })
    expect(tab.getAttribute("aria-selected")).toBe("true")
    expect(tab.className).toContain("border-primary")
    expect(tab.className).toContain("font-semibold")
  })
})
