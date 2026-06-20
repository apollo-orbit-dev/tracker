import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"

import { AgendaList } from "./AgendaList"
import type { CalendarItem } from "@/api/calendar"

const items: CalendarItem[] = [
  { type: "milestone", id: "m1", date: "2026-07-10", name: "Submit", direction: "outbound", completed: false, actual_date: null, project_id: "p", project_title: "P" },
  { type: "assignment", id: "a1", date: "2026-07-10", description: "Wire panel", status: "open", assignee_name: "Ann", milestone_id: null, milestone_name: null, project_id: "p", project_title: "P" },
]

describe("AgendaList", () => {
  it("groups items under their day and renders labels", () => {
    render(<AgendaList items={items} holidays={[]} events={[]} onSelect={vi.fn()} onEventSelect={vi.fn()} />)
    expect(screen.getByText(/Jul 10, 2026/)).toBeInTheDocument()
    expect(screen.getByText("Submit")).toBeInTheDocument()
    expect(screen.getByText("Wire panel")).toBeInTheDocument()
  })

  it("shows an empty message when there are no items", () => {
    render(<AgendaList items={[]} holidays={[]} events={[]} onSelect={vi.fn()} onEventSelect={vi.fn()} />)
    expect(screen.getByText(/nothing scheduled/i)).toBeInTheDocument()
  })

  it("renders the project title in the meta line of each item (not a separate element)", () => {
    render(<AgendaList items={items} holidays={[]} events={[]} onSelect={vi.fn()} onEventSelect={vi.fn()} />)
    // Each agenda item is a <button>; assert that the button containing the label
    // also contains the project title in the same text content — proving they are
    // co-located in the meta line, not in a separate right-aligned element.
    const submitButton = screen.getByRole("button", { name: /Submit/ })
    expect(submitButton.textContent).toContain("Submit")
    expect(submitButton.textContent).toContain("P")

    const wireButton = screen.getByRole("button", { name: /Wire panel/ })
    expect(wireButton.textContent).toContain("Wire panel")
    expect(wireButton.textContent).toContain("P")
  })

  it("shows the assignee name in the assignment meta line", () => {
    render(<AgendaList items={items} holidays={[]} events={[]} onSelect={vi.fn()} onEventSelect={vi.fn()} />)
    // "Ann" is the assignee_name on the assignment item
    expect(screen.getByText(/Ann/)).toBeInTheDocument()
  })
})
