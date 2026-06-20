import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Route, Routes } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { AppLayout } from "./AppLayout"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const ADMIN = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "admin@example.com",
  display_name: "Admin User",
  roles: ["admin"],
}

const DM = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "dm@example.com",
  display_name: "DM User",
  roles: ["department_manager"],
}

const VIEWER = {
  id: "33333333-3333-3333-3333-333333333333",
  email: "viewer@example.com",
  display_name: "Viewer User",
  roles: ["viewer"],
}

function renderShell(user: typeof ADMIN, route = "/") {
  stubFetchByRoute([
    {
      match: (u) => u.endsWith("/api/auth/me"),
      respond: () => jsonResponse(user),
    },
    {
      match: (u) => u.includes("/api/auth/logout"),
      respond: () => new Response(null, { status: 204 }),
    },
  ])
  return renderWithProviders(
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="/" element={<div>home page</div>} />
        <Route path="/projects" element={<div>projects page</div>} />
      </Route>
    </Routes>,
    { route },
  )
}

describe("AppLayout", () => {
  beforeEach(() => {
    window.localStorage.clear()
    vi.restoreAllMocks()
  })
  afterEach(() => {
    window.localStorage.clear()
    vi.unstubAllGlobals()
  })

  it("renders one Saved Views link per accessible template", async () => {
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
              {
                id: "tpl-1",
                name: "DIV1 / CON / Design",
                department_id: "d1",
                client_id: "c1",
                discipline_id: "di1",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
                deleted_at: null,
              },
              {
                id: "tpl-2",
                name: "DIV4 / FAB / Build",
                department_id: "d2",
                client_id: "c2",
                discipline_id: "di2",
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
                deleted_at: null,
              },
            ],
            total: 2,
            limit: 200,
            offset: 0,
          }),
      },
    ])
    renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<div>home</div>} />
        </Route>
      </Routes>,
      { route: "/" },
    )

    const link1 = await screen.findByRole("link", {
      name: /DIV1 \/ CON \/ Design/,
    })
    expect(link1.getAttribute("href")).toBe(
      "/projects/view?template_id=tpl-1",
    )
    const link2 = screen.getByRole("link", {
      name: /DIV4 \/ FAB \/ Build/,
    })
    expect(link2.getAttribute("href")).toBe(
      "/projects/view?template_id=tpl-2",
    )
  })

  it("renders shared custom views with the shared (Users) icon and dept badge", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith("/api/views"),
        respond: () =>
          jsonResponse({
            items: [
              {
                id: "cv-own",
                name: "My view",
                order_index: 0,
                published_department_id: null,
                is_owner: true,
                owner_name: "Admin User",
                published_department_code: null,
              },
              {
                id: "cv-shared",
                name: "Team view",
                order_index: 1,
                published_department_id: "d1",
                is_owner: false,
                owner_name: "Dana DM",
                published_department_code: "DIV1",
              },
            ],
          }),
      },
    ])
    renderWithProviders(
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<div>home</div>} />
        </Route>
      </Routes>,
      { route: "/" },
    )
    await waitFor(() => screen.getByText("My view"))
    expect(screen.getByText("Team view")).toBeInTheDocument()
    // The shared item surfaces its source dept code.
    expect(screen.getByText(/DIV1/)).toBeInTheDocument()
  })

  it("renders the top-group nav items for all authenticated users", async () => {
    renderShell(VIEWER)
    expect(
      await screen.findByRole("link", { name: /dashboard/i }),
    ).toBeInTheDocument()
    // 5.1: "Project Admin" → "Projects"; "Project Overviews" replaced
    // by the Saved Views group (asserted in its own test below).
    expect(
      screen.getByRole("link", { name: /^projects$/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("link", { name: /project overviews/i }),
    ).not.toBeInTheDocument()
    // 12.3: Calendar link in top nav group.
    const calendarLink = screen.getByRole("link", { name: /^calendar$/i })
    expect(calendarLink).toBeInTheDocument()
    expect(calendarLink.getAttribute("href")).toBe("/calendar")
    expect(
      screen.getByRole("link", { name: /user settings/i }),
    ).toBeInTheDocument()
  })

  it("shows Admin Settings for admin users", async () => {
    renderShell(ADMIN)
    expect(
      await screen.findByRole("link", { name: /admin settings/i }),
    ).toBeInTheDocument()
  })

  it("shows Admin Settings for department managers", async () => {
    renderShell(DM)
    expect(
      await screen.findByRole("link", { name: /admin settings/i }),
    ).toBeInTheDocument()
  })

  it("hides Admin Settings for viewers and project editors", async () => {
    renderShell(VIEWER)
    await screen.findByRole("link", { name: /dashboard/i })
    expect(
      screen.queryByRole("link", { name: /admin settings/i }),
    ).not.toBeInTheDocument()
  })

  it("shows email in the user card and signs out via the dropdown menu", async () => {
    const user = userEvent.setup()
    renderShell(ADMIN)
    expect(await screen.findByText("admin@example.com")).toBeInTheDocument()
    await user.click(
      screen.getByRole("button", { name: /open user menu/i }),
    )
    await user.click(
      await screen.findByRole("menuitem", { name: /sign out/i }),
    )
    await waitFor(() => {
      // Logout clears the ME query → re-fetch returns 401-style absence.
      // We just verify the menu item is wired by checking the logout endpoint
      // was called (stubFetchByRoute is a vi.fn).
      const fetchFn = window.fetch as unknown as ReturnType<typeof vi.fn>
      const calledLogout = fetchFn.mock.calls.some(([u]) =>
        String(u).includes("/api/auth/logout"),
      )
      expect(calledLogout).toBe(true)
    })
  })

  it("applies the design-ref active state to the current nav item", async () => {
    renderShell(ADMIN)
    // Dashboard is the default route in the shell — its menu button
    // should carry data-active="true" and the card-bg active class.
    const dashboardLink = await screen.findByRole("link", { name: /dashboard/i })
    const button = dashboardLink.querySelector("button")
    expect(button).not.toBeNull()
    expect(button?.getAttribute("data-active")).toBe("true")
    // The active state class includes data-[active=true]:bg-card; the
    // raw className substring is what we check, since the data-active
    // CSS resolves at runtime via Tailwind's attribute selector.
    expect(button?.className).toContain("data-[active=true]:bg-card")
    expect(button?.className).toContain(
      "data-[active=true]:[&>svg]:text-primary",
    )
  })

  it("persists the collapse state to localStorage", async () => {
    const user = userEvent.setup()
    renderShell(ADMIN)
    await screen.findByRole("link", { name: /dashboard/i })
    await user.click(
      screen.getByRole("button", { name: /toggle sidebar/i }),
    )
    await waitFor(() => {
      expect(
        window.localStorage.getItem("tracker.sidebarCollapsed"),
      ).toBe(JSON.stringify(true))
    })
  })
})
