import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"
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

describe("Login page", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders email and password fields", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse({ detail: "Not authenticated" }, 401),
      },
    ])
    renderWithProviders(<App />, { route: "/login" })
    await waitFor(() => {
      expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    })
    expect(screen.getByLabelText(/password/i)).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /sign in/i })).toBeInTheDocument()
  })

  it("submits credentials and lands on the dashboard", async () => {
    const user = userEvent.setup()
    let authed = false
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () =>
          authed
            ? jsonResponse(ADMIN_USER)
            : jsonResponse({ detail: "Not authenticated" }, 401),
      },
      {
        match: (u) => u.endsWith("/api/auth/login"),
        respond: () => {
          authed = true
          return jsonResponse(ADMIN_USER)
        },
      },
      {
        match: (u) => u.endsWith("/api/health"),
        respond: () => jsonResponse({ status: "ok" }),
      },
    ])

    renderWithProviders(<App />, { route: "/login" })

    await user.type(await screen.findByLabelText(/email/i), "admin@example.com")
    await user.type(screen.getByLabelText(/password/i), "devpassword123")
    await user.click(screen.getByRole("button", { name: /sign in/i }))

    await waitFor(() => {
      // Phase 4.4.1: the dashboard's Welcome card is gone — use the
      // Customize button as the "landed on /" probe instead.
      expect(
        screen.getByRole("button", { name: /customize/i }),
      ).toBeInTheDocument()
    })
  })

  it("shows the server error message on 401", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse({ detail: "Not authenticated" }, 401),
      },
      {
        match: (u) => u.endsWith("/api/auth/login"),
        respond: () =>
          jsonResponse({ detail: "Invalid email or password" }, 401),
      },
    ])

    renderWithProviders(<App />, { route: "/login" })

    await user.type(await screen.findByLabelText(/email/i), "admin@example.com")
    await user.type(screen.getByLabelText(/password/i), "wrong")
    await user.click(screen.getByRole("button", { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/invalid email or password/i)).toBeInTheDocument()
    })
  })

  it("shows the rate-limit message on 429", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse({ detail: "Not authenticated" }, 401),
      },
      {
        match: (u) => u.endsWith("/api/auth/login"),
        respond: () =>
          jsonResponse(
            { detail: "Too many failed attempts. Try again later." },
            429,
          ),
      },
    ])

    renderWithProviders(<App />, { route: "/login" })

    await user.type(await screen.findByLabelText(/email/i), "admin@example.com")
    await user.type(screen.getByLabelText(/password/i), "x")
    await user.click(screen.getByRole("button", { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/too many failed attempts/i)).toBeInTheDocument()
    })
  })

  it("blocks submit without a valid email", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse({ detail: "Not authenticated" }, 401),
      },
    ])

    renderWithProviders(<App />, { route: "/login" })

    await user.type(await screen.findByLabelText(/email/i), "not-an-email")
    await user.type(screen.getByLabelText(/password/i), "anything")
    await user.click(screen.getByRole("button", { name: /sign in/i }))

    await waitFor(() => {
      expect(screen.getByText(/enter a valid email/i)).toBeInTheDocument()
    })
    // /api/auth/login should NOT have been called
    const loginCalls = fetchMock.mock.calls.filter((c) =>
      String(c[0]).endsWith("/api/auth/login"),
    )
    expect(loginCalls).toHaveLength(0)
  })
})
