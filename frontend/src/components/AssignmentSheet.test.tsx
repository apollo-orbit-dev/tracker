import { describe, expect, it } from "vitest"
import { screen } from "@testing-library/react"

import { AssignmentSheet } from "./AssignmentSheet"
import { jsonResponse, renderWithProviders, stubFetchByRoute } from "@/test/test-utils"

const PID = "00000000-0000-0000-0000-000000000000"

describe("AssignmentSheet", () => {
  it("renders the New assignment title and a description field", () => {
    stubFetchByRoute([
      {
        match: (u) => u.includes(`/api/projects/${PID}/assignments/eligible-users`),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
    ])
    renderWithProviders(
      <AssignmentSheet
        pid={PID}
        open
        onOpenChange={() => {}}
        milestones={[{ id: "m1", name: "Submit drawings" }]}
      />,
    )
    expect(screen.getByText("New assignment")).toBeInTheDocument()
    expect(screen.getByLabelText("Description")).toBeInTheDocument()
  })
})
