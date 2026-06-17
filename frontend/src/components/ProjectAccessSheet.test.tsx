import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ProjectAccessSheet } from "@/components/ProjectAccessSheet"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const PID = "ffff1111-ffff-ffff-ffff-ffffffffffff"
const USER_A = "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const USER_B = "bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb"

const accessListEmpty = {
  items: [],
  total: 0,
}

const accessListPopulated = {
  items: [
    {
      user_id: USER_A,
      email: "outside@example.com",
      display_name: "Outside Person",
      granted_at: "2026-06-07T12:00:00Z",
      granted_by: null,
    },
  ],
  total: 1,
}

const pickerResponse = {
  items: [
    { id: USER_A, email: "outside@example.com", display_name: "Outside Person" },
    { id: USER_B, email: "newuser@example.com", display_name: "New User" },
  ],
  total: 2,
}

describe("ProjectAccessSheet", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it("shows empty state when no grants exist", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith(`/api/projects/${PID}/access`),
        respond: () => jsonResponse(accessListEmpty),
      },
      {
        match: (u) => u.endsWith("/api/users/picker"),
        respond: () => jsonResponse(pickerResponse),
      },
    ])
    renderWithProviders(
      <ProjectAccessSheet
        pid={PID}
        projectTitle="Demo project"
        open
        onOpenChange={() => {}}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText(/no direct grants yet/i)).toBeInTheDocument()
    })
  })

  it("lists existing grants and supports revoke", async () => {
    const calls: string[] = []
    stubFetchByRoute([
      {
        match: (u, init) =>
          u.endsWith(`/api/projects/${PID}/access`) &&
          (!init?.method || init.method === "GET"),
        respond: () => jsonResponse(accessListPopulated),
      },
      {
        match: (u, init) =>
          u.endsWith(`/api/projects/${PID}/access/${USER_A}`) &&
          init?.method === "DELETE",
        respond: () => {
          calls.push("revoke")
          return new Response(null, { status: 204 })
        },
      },
      {
        match: (u) => u.endsWith("/api/users/picker"),
        respond: () => jsonResponse(pickerResponse),
      },
    ])
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderWithProviders(
      <ProjectAccessSheet
        pid={PID}
        projectTitle="Demo project"
        open
        onOpenChange={() => {}}
      />,
    )
    await waitFor(() => {
      expect(screen.getByText("Outside Person")).toBeInTheDocument()
    })
    const revokeBtn = screen.getByRole("button", {
      name: /revoke access for outside person/i,
    })
    await user.click(revokeBtn)
    await waitFor(() => {
      expect(calls).toContain("revoke")
    })
  })

  it("disables grant button when no user is selected", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith(`/api/projects/${PID}/access`),
        respond: () => jsonResponse(accessListEmpty),
      },
      {
        match: (u) => u.endsWith("/api/users/picker"),
        respond: () => jsonResponse(pickerResponse),
      },
    ])
    renderWithProviders(
      <ProjectAccessSheet
        pid={PID}
        projectTitle="Demo project"
        open
        onOpenChange={() => {}}
      />,
    )
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /grant access/i }),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByRole("button", { name: /grant access/i }),
    ).toBeDisabled()
  })
})
