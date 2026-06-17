import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ExportProjectsDialog } from "@/components/ExportProjectsDialog"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const FIELD_DEFS = [
  { id: "fd1", name: "Budget", field_type: "currency" },
]
const MILESTONE_DEFS = [
  {
    id: "md1",
    name: "IFC",
    date_model: "planned_actual" as const,
  },
]

describe("ExportProjectsDialog", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    // jsdom doesn't ship URL.createObjectURL / revokeObjectURL.
    URL.createObjectURL = vi.fn(() => "blob:mock")
    URL.revokeObjectURL = vi.fn()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("seeds checked state from visibleColumns and lists all columns", () => {
    stubFetchByRoute([])
    renderWithProviders(
      <ExportProjectsDialog
        open
        onOpenChange={() => {}}
        templateId="tpl-1"
        visibleColumns={["builtin:project_number", "builtin:title"]}
        fieldDefs={FIELD_DEFS}
        milestoneDefs={MILESTONE_DEFS}
        filters={{}}
      />,
    )
    // Visible-by-default columns checked.
    const number = screen.getByLabelText(/include project #/i) as HTMLInputElement
    const title = screen.getByLabelText(/include title/i) as HTMLInputElement
    expect(number.dataset.state).toBe("checked")
    expect(title.dataset.state).toBe("checked")
    // Other built-ins + custom + milestones present but unchecked.
    const budget = screen.getByLabelText(/include budget/i) as HTMLInputElement
    const ifcPlanned = screen.getByLabelText(
      /include ifc — planned/i,
    ) as HTMLInputElement
    expect(budget.dataset.state).toBe("unchecked")
    expect(ifcPlanned.dataset.state).toBe("unchecked")
  })

  it("toggles format from xlsx (default) to csv", async () => {
    const user = userEvent.setup()
    let lastUrl = ""
    stubFetchByRoute([
      {
        match: (u, init) =>
          u.includes("/api/projects/export") && init?.method === "GET",
        respond: (u) => {
          lastUrl = u
          return new Response(new Blob(["a,b\n1,2\n"]), {
            status: 200,
            headers: {
              "Content-Type": "text/csv",
              "Content-Disposition": 'attachment; filename="x.csv"',
            },
          })
        },
      },
    ])
    renderWithProviders(
      <ExportProjectsDialog
        open
        onOpenChange={() => {}}
        templateId="tpl-1"
        visibleColumns={["builtin:title"]}
        fieldDefs={FIELD_DEFS}
        milestoneDefs={MILESTONE_DEFS}
        filters={{}}
      />,
    )

    // Default = xlsx — click CSV.
    await user.click(screen.getByRole("radio", { name: /^csv$/i }))
    await user.click(screen.getByRole("button", { name: /^export$/i }))

    await waitFor(() => expect(lastUrl).toContain("/api/projects/export"))
    expect(lastUrl).toContain("format=csv")
    expect(lastUrl).toContain("template_id=tpl-1")
    expect(lastUrl).toContain("columns=builtin%3Atitle")
  })

  it("forwards filters to the request", async () => {
    const user = userEvent.setup()
    let lastUrl = ""
    stubFetchByRoute([
      {
        match: (u, init) =>
          u.includes("/api/projects/export") && init?.method === "GET",
        respond: (u) => {
          lastUrl = u
          return new Response(new Blob(["x"]), {
            status: 200,
            headers: {
              "Content-Type":
                "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
              "Content-Disposition": 'attachment; filename="x.xlsx"',
            },
          })
        },
      },
    ])

    renderWithProviders(
      <ExportProjectsDialog
        open
        onOpenChange={() => {}}
        templateId="tpl-1"
        visibleColumns={["builtin:project_number"]}
        fieldDefs={FIELD_DEFS}
        milestoneDefs={MILESTONE_DEFS}
        filters={{
          q: "alpha",
          lifecycle_state: "active",
          sort: "title",
          sort_direction: "asc",
        }}
      />,
    )

    // Filter summary line surfaces the values so the user sees what
    // they're exporting.
    expect(screen.getByText(/q="alpha"/i)).toBeInTheDocument()
    expect(screen.getByText(/status=active/i)).toBeInTheDocument()
    expect(screen.getByText(/sort=title asc/i)).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: /^export$/i }))

    await waitFor(() => expect(lastUrl).toContain("q=alpha"))
    expect(lastUrl).toContain("lifecycle_state=active")
    expect(lastUrl).toContain("sort=title")
    expect(lastUrl).toContain("sort_direction=asc")
    expect(lastUrl).toContain("format=xlsx")
  })
})
