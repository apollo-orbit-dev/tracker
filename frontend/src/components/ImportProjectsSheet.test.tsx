import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { ImportProjectsSheet } from "@/components/ImportProjectsSheet"
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
}

const TID = "tpl-1"

function templateStub() {
  return {
    match: (u: string) => u.endsWith("/api/admin/templates?limit=200"),
    respond: () =>
      jsonResponse({
        items: [
          {
            id: TID,
            name: "DIV1 / CON / Design",
            department_id: "d1",
            client_id: "c1",
            discipline_id: "di1",
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            deleted_at: null,
          },
        ],
        total: 1,
        limit: 200,
        offset: 0,
      }),
  }
}

function milestoneDefsStub() {
  return {
    match: (u: string) =>
      u.endsWith(`/api/admin/templates/${TID}/milestones`),
    respond: () =>
      jsonResponse({
        items: [
          {
            id: "md-ifc",
            template_id: TID,
            name: "IFC Submittal",
            direction: "outbound",
            date_model: "planned_actual",
            order_index: 0,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            deleted_at: null,
          },
          {
            id: "md-close",
            template_id: TID,
            name: "Closeout",
            direction: "internal",
            date_model: "single",
            order_index: 1,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            deleted_at: null,
          },
        ],
        total: 2,
      }),
  }
}

function fieldDefsStub() {
  return {
    match: (u: string) =>
      u.endsWith(`/api/admin/templates/${TID}/fields`),
    respond: () =>
      jsonResponse({
        items: [
          {
            id: "fd-budget",
            template_id: TID,
            name: "Budget",
            field_type: "currency",
            required: false,
            is_project_metric: false,
            order_index: 0,
            options: null,
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            deleted_at: null,
          },
        ],
        total: 1,
      }),
  }
}

describe("ImportProjectsSheet", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("walks through pick → upload → map and posts a multipart form", async () => {
    const user = userEvent.setup()
    let importBody: FormData | null = null
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      templateStub(),
      fieldDefsStub(),
      {
        match: (u, init) =>
          u.endsWith("/api/projects/import") && init?.method === "POST",
        respond: (_u, init) => {
          importBody = init?.body as FormData
          return jsonResponse({
            created: 2,
            skipped: [],
            errors: [],
          })
        },
      },
    ])

    renderWithProviders(
      <ImportProjectsSheet open onOpenChange={() => {}} />,
    )

    // Step 1: pick template.
    await user.click(
      await screen.findByRole("combobox", { name: /import template/i }),
    )
    await user.click(
      await screen.findByRole("option", { name: /DIV1 \/ CON \/ Design/ }),
    )
    await user.click(screen.getByRole("button", { name: /^next/i }))

    // Step 2: upload a CSV.
    const csv = "Number,Title,Budget\nM-1,Endor RTU,12500\nM-2,Hawthorn,750\n"
    const file = new File([csv], "rows.csv", { type: "text/csv" })
    const fileInput = screen.getByLabelText(/csv file/i)
    await user.upload(fileInput, file)

    await waitFor(() => {
      expect(screen.getByText(/3 columns/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/2 data rows/i)).toBeInTheDocument()
    await user.click(screen.getByRole("button", { name: /^next/i }))

    // Step 3: auto-matched mapping. The "Number" column maps to
    // project_number (auto-match), "Title" → title, "Budget" → fd-budget.
    // The Import button should be enabled since the number column is mapped.
    const importBtn = await screen.findByRole("button", {
      name: /import 2 rows/i,
    })
    await waitFor(() => expect(importBtn).not.toBeDisabled())
    await user.click(importBtn)

    // Result step.
    await waitFor(() => {
      expect(screen.getByText(/2 projects created/i)).toBeInTheDocument()
    })

    // Multipart form had all three fields.
    expect(importBody).not.toBeNull()
    const form = importBody!
    expect(form.get("template_id")).toBe(TID)
    expect((form.get("file") as File).name).toBe("rows.csv")
    const mapping = JSON.parse(form.get("mapping") as string)
    expect(mapping["Number"]).toBe("project_number")
    expect(mapping["Title"]).toBe("title")
    expect(mapping["Budget"]).toBe("fd-budget")
  })

  it("blocks Import until Project # is mapped", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      templateStub(),
      fieldDefsStub(),
    ])
    renderWithProviders(
      <ImportProjectsSheet open onOpenChange={() => {}} />,
    )

    // Walk through pick + upload.
    await user.click(
      await screen.findByRole("combobox", { name: /import template/i }),
    )
    await user.click(
      await screen.findByRole("option", { name: /DIV1/ }),
    )
    await user.click(screen.getByRole("button", { name: /^next/i }))

    // Upload a CSV whose headers don't match any field names — the
    // auto-matcher won't map the number column.
    const csv = "Foo,Bar\nA,B\n"
    const file = new File([csv], "weird.csv", { type: "text/csv" })
    await user.upload(screen.getByLabelText(/csv file/i), file)
    await waitFor(() => {
      expect(screen.getByText(/2 columns/i)).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /^next/i }))

    // The map step shows the destructive Alert warning about Project #.
    // shadcn Alert renders the title text twice — once in the visible
    // title element, once as a sr-only mirror — so getAllByText is the
    // safer probe.
    expect(
      screen.getAllByText(/project # must be mapped/i).length,
    ).toBeGreaterThan(0)
    // Import button stays disabled until Project # has a non-Skip target.
    const importBtn = screen.getByRole("button", { name: /import 1 row/i })
    expect(importBtn).toBeDisabled()
  })

  it("renders skipped + error rows in the result step", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      templateStub(),
      fieldDefsStub(),
      {
        match: (u, init) =>
          u.endsWith("/api/projects/import") && init?.method === "POST",
        respond: () =>
          jsonResponse({
            created: 0,
            skipped: [
              { row: 2, project_number: "DUPE", reason: "Project # already exists" },
            ],
            errors: [
              { row: 3, error: "shape validation failed: bad currency" },
            ],
          }),
      },
    ])

    renderWithProviders(
      <ImportProjectsSheet open onOpenChange={() => {}} />,
    )

    // Speed-run through the steps.
    await user.click(
      await screen.findByRole("combobox", { name: /import template/i }),
    )
    await user.click(await screen.findByRole("option", { name: /DIV1/ }))
    await user.click(screen.getByRole("button", { name: /^next/i }))

    const csv = "Number\nDUPE\nBROKEN\n"
    const file = new File([csv], "rows.csv", { type: "text/csv" })
    await user.upload(screen.getByLabelText(/csv file/i), file)
    await waitFor(() => {
      expect(screen.getByText(/1 column/i)).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /^next/i }))
    await user.click(
      await screen.findByRole("button", { name: /import 2 rows/i }),
    )

    // Result step shows both lists.
    expect(await screen.findByText(/0 projects/i)).toBeInTheDocument()
    expect(screen.getByText(/skipped \(1\)/i)).toBeInTheDocument()
    expect(screen.getByText(/errors \(1\)/i)).toBeInTheDocument()
    expect(
      screen.getByText(/Row 2 \(DUPE\): Project # already exists/i),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Row 3: shape validation failed/i),
    ).toBeInTheDocument()
  })

  it("offers milestone targets in the mapping Select", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      templateStub(),
      fieldDefsStub(),
      milestoneDefsStub(),
    ])
    renderWithProviders(
      <ImportProjectsSheet open onOpenChange={() => {}} />,
    )

    // Walk to the map step.
    await user.click(
      await screen.findByRole("combobox", { name: /import template/i }),
    )
    await user.click(await screen.findByRole("option", { name: /DIV1/ }))
    await user.click(screen.getByRole("button", { name: /^next/i }))

    const csv = "Number,Notes\nM-1,Hello\n"
    const file = new File([csv], "rows.csv", { type: "text/csv" })
    await user.upload(screen.getByLabelText(/csv file/i), file)
    await waitFor(() => {
      expect(screen.getByText(/2 columns/i)).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /^next/i }))

    // Open the Select for the Notes column and confirm milestone slots
    // appear (planned_actual has two; single has one).
    await user.click(screen.getByRole("combobox", { name: /map notes/i }))
    expect(
      await screen.findByRole("option", { name: /IFC Submittal — Planned/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: /IFC Submittal — Actual/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: /Closeout \(milestone date\)/i }),
    ).toBeInTheDocument()
  })
})
