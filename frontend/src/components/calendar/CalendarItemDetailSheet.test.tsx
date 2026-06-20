import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"

import { CalendarItemDetailSheet } from "./CalendarItemDetailSheet"
import { jsonResponse, renderWithProviders, stubFetchByRoute } from "@/test/test-utils"
import type { CalendarItem } from "@/api/calendar"
// Stub GET /api/projects/:pid/assignments -> { items: [ { id, milestone_id: "m1",
//   description: "Wire panel", assignee_name: "Ann", status: "open", due_date: null, ... } ], total: 1 }

const milestone: CalendarItem = {
  type: "milestone", id: "m1", date: "2026-07-10", name: "Submit drawings",
  direction: "outbound", completed: false, actual_date: null,
  project_id: "p1", project_title: "Proj",
}

describe("CalendarItemDetailSheet", () => {
  it("shows a milestone's name and its associated assignments", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.includes("/api/projects/p1/assignments"),
        respond: () => jsonResponse({
          items: [
            {
              id: "a1",
              project_id: "p1",
              milestone_id: "m1",
              milestone_name: "Submit drawings",
              assignee_user_id: "u1",
              assignee_name: "Ann",
              assignee_email: "ann@example.com",
              description: "Wire panel",
              status: "open",
              due_date: null,
              created_at: "2026-06-01T00:00:00Z",
              updated_at: "2026-06-01T00:00:00Z",
              deleted_at: null,
            },
          ],
          total: 1,
        }),
      },
    ])
    renderWithProviders(
      <CalendarItemDetailSheet item={milestone} open onOpenChange={() => {}} />,
    )
    expect(screen.getByText("Submit drawings")).toBeInTheDocument()
    expect(await screen.findByText("Wire panel")).toBeInTheDocument() // its assignment
  })
})
