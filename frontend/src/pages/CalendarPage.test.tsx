import { describe, expect, it, afterEach, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"

import { CalendarPage } from "./CalendarPage"
import { renderWithProviders, stubFetchByRoute, jsonResponse } from "@/test/test-utils"

const TODAY = new Date()
const pad = (n: number) => String(n).padStart(2, "0")
const todayStr = `${TODAY.getFullYear()}-${pad(TODAY.getMonth() + 1)}-${pad(TODAY.getDate())}`

const MILESTONE_ITEM = {
  type: "milestone" as const,
  id: "m1",
  date: todayStr,
  name: "Submit",
  direction: "outbound",
  completed: false,
  actual_date: null,
  project_id: "p1",
  project_title: "Project Alpha",
}

const ASSIGNMENT_ITEM = {
  type: "assignment" as const,
  id: "a1",
  date: todayStr,
  description: "Wire panel",
  status: "open",
  assignee_name: "Alice",
  milestone_id: null,
  milestone_name: null,
  project_id: "p1",
  project_title: "Project Alpha",
}

describe("CalendarPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("hides assignment items when the assignment toggle is turned off", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.includes("/api/auth/me") && !u.includes("/departments"),
        respond: () => jsonResponse({ id: "u1", email: "a@b.com", display_name: "A", roles: ["project_editor"], accessible_department_ids: null }),
      },
      {
        match: (u) => u.includes("/api/auth/me/departments"),
        respond: () => jsonResponse([]),
      },
      {
        match: (u) => u.includes("/api/admin/clients"),
        respond: () => jsonResponse({ items: [], total: 0, limit: 200, offset: 0 }),
      },
      {
        match: (u) => u.includes("/api/admin/disciplines"),
        respond: () => jsonResponse({ items: [], total: 0, limit: 200, offset: 0 }),
      },
      {
        match: (u) => u.includes("/api/calendar/items"),
        respond: () => jsonResponse({ items: [MILESTONE_ITEM, ASSIGNMENT_ITEM] }),
      },
      {
        match: (u) => u.includes("/api/calendar/events"),
        respond: () => jsonResponse({ items: [] }),
      },
    ])

    renderWithProviders(<CalendarPage />)

    expect(await screen.findByText("Submit")).toBeInTheDocument()       // milestone
    expect(screen.getByText("Wire panel")).toBeInTheDocument()          // assignment

    await userEvent.click(screen.getByRole("button", { name: /assignments/i }))

    await waitFor(() =>
      expect(screen.queryByText("Wire panel")).not.toBeInTheDocument(),
    )
    expect(screen.getByText("Submit")).toBeInTheDocument()
  })
})
