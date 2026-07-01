import { fireEvent, render, screen, waitFor } from "@testing-library/react"
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

const VIEWER = {
  id: "vvvv1111-vvvv-vvvv-vvvv-vvvvvvvvvvvv",
  email: "viewer@example.com",
  display_name: "Viewer",
  roles: ["viewer"],
  accessible_department_ids: null,
}

function commonStubs(user: typeof ADMIN) {
  stubFetchByRoute([
    {
      match: (u) => u.endsWith("/api/auth/me"),
      respond: () => jsonResponse(user),
    },
    {
      // The departments hook returns a bare array, not a paginated object.
      match: (u) => u.includes("/api/auth/me/departments"),
      respond: () => jsonResponse([]),
    },
    {
      match: () => true,
      respond: () =>
        jsonResponse({ items: [], total: 0, limit: 50, offset: 0 }),
    },
  ])
}

describe("useGShortcuts", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("g then p navigates to /projects", async () => {
    commonStubs(ADMIN)
    renderWithProviders(<App />, { route: "/" })

    // Wait for the shell to mount so the listener is bound.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /search or run a command/i }),
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: "g" })
    fireEvent.keyDown(window, { key: "p" })

    // Projects list page renders an h1 with "Projects".
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "Projects" }),
      ).toBeInTheDocument()
    })
  })

  it("g then c navigates to /calendar", async () => {
    commonStubs(ADMIN)
    renderWithProviders(<App />, { route: "/" })

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /search or run a command/i }),
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: "g" })
    fireEvent.keyDown(window, { key: "c" })

    // The calendar page renders a Month/Schedule view toggle (role="tab");
    // the Schedule tab is unique to that route and role-independent.
    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: "Schedule" }),
      ).toBeInTheDocument()
    })
  })

  it("g then a does nothing for non-DM users", async () => {
    commonStubs(VIEWER)
    renderWithProviders(<App />, { route: "/" })

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /search or run a command/i }),
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: "g" })
    fireEvent.keyDown(window, { key: "a" })

    // Still on dashboard route — no Admin page chrome rendered.
    expect(screen.queryByText(/taxonomy/i)).not.toBeInTheDocument()
  })

  it("lone g (no follow-up) does not navigate", async () => {
    commonStubs(ADMIN)
    renderWithProviders(<App />, { route: "/" })

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /search or run a command/i }),
      ).toBeInTheDocument()
    })

    fireEvent.keyDown(window, { key: "g" })
    // Don't follow up. Projects list h1 should never appear.
    await new Promise((r) => setTimeout(r, 50))
    expect(
      screen.queryByRole("heading", { level: 1, name: "Projects" }),
    ).not.toBeInTheDocument()
  })

  it("does not fire when an input is focused", async () => {
    // Render an isolated tree with a focused input + the app shell.
    commonStubs(ADMIN)
    const { container } = renderWithProviders(<App />, { route: "/" })

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /search or run a command/i }),
      ).toBeInTheDocument()
    })

    // Inject a focused input into the DOM and then dispatch the keydown.
    const input = document.createElement("input")
    container.appendChild(input)
    input.focus()
    expect(document.activeElement).toBe(input)

    fireEvent.keyDown(window, { key: "g" })
    fireEvent.keyDown(window, { key: "p" })

    await new Promise((r) => setTimeout(r, 50))
    expect(
      screen.queryByRole("heading", { level: 1, name: "Projects" }),
    ).not.toBeInTheDocument()
  })
})
