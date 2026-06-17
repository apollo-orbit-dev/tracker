// Phase 7.11 — embedded Saved View table block. Data comes from the
// existing GET /api/projects (stubbed here); cells render through the
// shared cellRender module (same code path as ProjectsViewPage).
import { fireEvent, screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { Route, Routes } from "react-router"

import { TableBlock } from "./TableBlock"
import type { ViewBlock } from "@/api/views"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const block = (config: ViewBlock["config"]): ViewBlock => ({
  id: "b1",
  view_id: "v1",
  block_type: "table",
  title: "Active DIV1",
  order_index: 0,
  width: 4,
  accent: "indigo",
  config,
})

// Column keys use the view_columns grammar; synthetic test ids must be
// hyphen-free (parseColumnKey's test-id escape hatch).
const CFG = {
  template_id: "t1",
  columns: ["builtin:title", "custom_field:f1", "milestone:m1:planned"],
  lifecycle_state: null,
  q: null,
  limit: 6,
  sort: "builtin:title",
  sort_direction: "asc" as const,
}

const FIELDS = {
  items: [
    { id: "f1", name: "PM", field_type: "user_picker_single", options: null },
  ],
}
const MILESTONES = {
  items: [
    {
      id: "m1",
      name: "Kickoff",
      direction: "internal",
      date_model: "planned_actual",
    },
  ],
}

const project = (n: number) => ({
  id: `p${n}`,
  project_number: `M-00${n}`,
  client_project_number: null,
  title: `Project ${n}`,
  lifecycle_state: "active",
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  custom_field_values: { f1: "u1" },
  milestones: [
    {
      template_milestone_def_id: "m1",
      planned_date: `2026-07-0${n}`,
      actual_date: null,
    },
  ],
})

function stubs(projects: { items: unknown[]; total: number }) {
  return stubFetchByRoute([
    {
      match: (u) => u.includes("/api/projects"),
      respond: () =>
        jsonResponse({
          ...projects,
          limit: 6,
          offset: 0,
          ref_labels: {
            users: { u1: "Dana Q" },
            contacts: {},
            projects: {},
            clients: {},
          },
        }),
    },
    {
      match: (u) => u.includes("/fields"),
      respond: () => jsonResponse(FIELDS),
    },
    {
      match: (u) => u.includes("/milestones"),
      respond: () => jsonResponse(MILESTONES),
    },
  ])
}

describe("TableBlock", () => {
  it("unconfigured: shows the configure prompt and fetches nothing", () => {
    const fetchMock = stubs({ items: [], total: 0 })
    renderWithProviders(<TableBlock block={block(null)} onConfigure={() => {}} />)
    expect(
      screen.getByRole("button", { name: /configure/i }),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("configured: headers from config, cells incl. ref label + milestone planned date; request carries the block's filters", async () => {
    const fetchMock = stubs({
      items: [project(1), project(2)],
      total: 2,
    })
    renderWithProviders(<TableBlock block={block(CFG)} onConfigure={() => {}} />)

    // Headers: builtin label / field name / milestone name + (planned).
    expect(await screen.findByText("Title")).toBeInTheDocument()
    expect(await screen.findByText("PM")).toBeInTheDocument()
    expect(await screen.findByText("Kickoff")).toBeInTheDocument()
    expect(screen.getByText("(planned)")).toBeInTheDocument()

    // Cells: title, user ref label, planned date.
    expect(await screen.findByText("Project 1")).toBeInTheDocument()
    expect(screen.getAllByText("Dana Q")).toHaveLength(2)
    expect(screen.getByText("2026-07-01")).toBeInTheDocument()

    // The /api/projects request maps the stored config: page_size →
    // limit, sort builtin:title → title (the page's existing mapping),
    // expand flags on.
    const projectsUrl = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes("/api/projects"))!
    const params = new URL(projectsUrl, "http://x").searchParams
    expect(params.get("template_id")).toBe("t1")
    expect(params.get("limit")).toBe("6")
    expect(params.get("sort")).toBe("title")
    expect(params.get("sort_direction")).toBe("asc")
    expect(params.get("expand_refs")).toBe("true")
    expect(params.get("expand_milestones")).toBe("true")

    // Row count respects the payload (server applies the limit).
    expect(screen.getAllByText(/Project \d/)).toHaveLength(2)
    // No "View all" when total fits in the limit.
    expect(screen.queryByText(/view all/i)).not.toBeInTheDocument()
  })

  it("threads cfg.conditions into the /api/projects request as a JSON param (Phase 7.18)", async () => {
    const fetchMock = stubs({ items: [project(1)], total: 1 })
    const cfgWithConds = {
      ...CFG,
      conditions: {
        combinator: "and" as const,
        items: [{ field: "f1", op: "is_false" }],
      },
    }
    renderWithProviders(
      <TableBlock block={block(cfgWithConds)} onConfigure={() => {}} />,
    )
    await screen.findByText("Project 1")
    const projectsUrl = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes("/api/projects"))!
    const params = new URL(projectsUrl, "http://x").searchParams
    const raw = params.get("conditions")
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw!)).toEqual(cfgWithConds.conditions)
  })

  it("sends no conditions param when cfg has none", async () => {
    const fetchMock = stubs({ items: [project(1)], total: 1 })
    renderWithProviders(<TableBlock block={block(CFG)} onConfigure={() => {}} />)
    await screen.findByText("Project 1")
    const projectsUrl = fetchMock.mock.calls
      .map((c) => String(c[0]))
      .find((u) => u.includes("/api/projects"))!
    const params = new URL(projectsUrl, "http://x").searchParams
    expect(params.get("conditions")).toBeNull()
  })

  it("rows link to /projects/{id}", async () => {
    stubs({ items: [project(1)], total: 1 })
    renderWithProviders(<TableBlock block={block(CFG)} onConfigure={() => {}} />)
    const link = await screen.findByRole("link", { name: /Project 1/ })
    expect(link).toHaveAttribute("href", "/projects/p1")
  })

  // 7.12 carry-over (b): a malformed stored config (present but
  // missing template_id) must render the configure prompt, not fetch.
  it("malformed config (no template_id) is treated as unconfigured", () => {
    const fetchMock = stubs({ items: [], total: 0 })
    renderWithProviders(
      <TableBlock block={block({ columns: ["builtin:title"] })} onConfigure={() => {}} />,
    )
    expect(
      screen.getByRole("button", { name: /configure/i }),
    ).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  // 7.12 carry-over (b): modifier clicks (new tab / select) must not
  // be hijacked by the row's onClick navigate; plain clicks navigate.
  it("row onClick navigates on plain click but not on ctrl-click", async () => {
    stubs({ items: [project(1)], total: 1 })
    renderWithProviders(
      <Routes>
        <Route
          path="/"
          element={<TableBlock block={block(CFG)} onConfigure={() => {}} />}
        />
        <Route path="/projects/:pid" element={<p>PROJECT PAGE</p>} />
      </Routes>,
    )
    // Click a non-link cell (the milestone date) with ctrl held — stay put.
    const cell = await screen.findByText("2026-07-01")
    fireEvent.click(cell, { ctrlKey: true })
    expect(screen.queryByText("PROJECT PAGE")).not.toBeInTheDocument()
    fireEvent.click(cell, { metaKey: true })
    expect(screen.queryByText("PROJECT PAGE")).not.toBeInTheDocument()
    // Plain click navigates.
    fireEvent.click(cell)
    expect(await screen.findByText("PROJECT PAGE")).toBeInTheDocument()
  })

  it("'View all {total} →' links to the Saved View page when total > limit", async () => {
    stubs({
      items: [1, 2, 3, 4, 5, 6].map(project),
      total: 9,
    })
    renderWithProviders(<TableBlock block={block(CFG)} onConfigure={() => {}} />)
    await waitFor(() =>
      expect(screen.getByText(/view all 9/i)).toBeInTheDocument(),
    )
    expect(screen.getByRole("link", { name: /view all 9/i })).toHaveAttribute(
      "href",
      "/projects/view?template_id=t1",
    )
  })
})
