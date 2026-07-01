import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { MilestoneTimeline } from "./MilestoneTimeline"
import type { Milestone } from "@/api/projects"

function ms(over: Partial<Milestone> & { id: string; name: string }): Milestone {
  return {
    project_id: "p1",
    template_milestone_def_id: null,
    direction: "outbound",
    date_model: "planned_actual",
    planned_date: null,
    actual_date: null,
    order_index: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...over,
  }
}

const MILESTONES: Milestone[] = [
  ms({ id: "m1", name: "Kickoff", planned_date: "2026-01-20", actual_date: "2026-01-22", order_index: 0 }),
  ms({ id: "m2", name: "Detailed Design", planned_date: "2999-01-01", actual_date: null, order_index: 1 }),
  ms({ id: "m3", name: "As-builts", planned_date: "2999-06-01", actual_date: null, order_index: 2 }),
]

describe("MilestoneTimeline", () => {
  it("renders nothing when there are no milestones", () => {
    const { container } = render(
      <MilestoneTimeline milestones={[]} onSelect={() => {}} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it("renders a node per milestone with the completed count and next label", () => {
    render(<MilestoneTimeline milestones={MILESTONES} onSelect={() => {}} />)
    expect(screen.getByText("Kickoff")).toBeInTheDocument()
    expect(screen.getByText("Detailed Design")).toBeInTheDocument()
    expect(screen.getByText("As-builts")).toBeInTheDocument()
    // 1 of 3 done; next = earliest not-yet-actual by planned date.
    expect(
      screen.getByText(/1 of 3 complete · next: Detailed Design/),
    ).toBeInTheDocument()
  })

  it("calls onSelect with the milestone id when a node is clicked", () => {
    const onSelect = vi.fn()
    render(<MilestoneTimeline milestones={MILESTONES} onSelect={onSelect} />)
    fireEvent.click(screen.getByTitle("Go to As-builts"))
    expect(onSelect).toHaveBeenCalledWith("m3")
  })
})
