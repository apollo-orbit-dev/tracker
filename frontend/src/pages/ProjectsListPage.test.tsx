import { screen, waitFor, within } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const ADMIN = {
  id: "11111111-1111-1111-1111-111111111111",
  email: "admin@example.com",
  display_name: "Admin",
  roles: ["admin"],
}

const EDITOR = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "editor@example.com",
  display_name: "Editor",
  roles: ["project_editor"],
}

const VIEWER = {
  id: "33333333-3333-3333-3333-333333333333",
  email: "viewer@example.com",
  display_name: "Viewer",
  roles: ["viewer"],
}

const TEMPLATE_ID = "dddd4444-dddd-dddd-dddd-dddddddddddd"
const DEPT_ID = "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const CLIENT_ID = "bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
const DISCIPLINE_ID = "cccc3333-cccc-cccc-cccc-cccccccccccc"

function project(overrides: Partial<{
  id: string
  number: string
  title: string
  state: string
}> = {}) {
  return {
    id: overrides.id ?? "eeee5555-eeee-eeee-eeee-eeeeeeeeeeee",
    project_number: overrides.number ?? "25756601",
    client_project_number: null,
    title: overrides.title ?? "Demo project",
    template_id: TEMPLATE_ID,
    lifecycle_state: overrides.state ?? "draft",
    custom_field_values: {},
    created_by: ADMIN.id,
    created_at: "2026-05-19T00:00:00Z",
    updated_at: "2026-05-19T00:00:00Z",
    deleted_at: null,
    template_name: "DIV1 / CON / Design",
    template_intersection: "DIV1 · CON · Design",
  }
}

const supportStubs = [
  {
    match: (u: string) => u.includes("/api/admin/templates"),
    respond: () =>
      jsonResponse({
        items: [
          {
            id: TEMPLATE_ID,
            name: "DIV1 / CON / Design",
            department_id: DEPT_ID,
            client_id: CLIENT_ID,
            discipline_id: DISCIPLINE_ID,
            created_at: "2026-05-19T00:00:00Z",
            updated_at: "2026-05-19T00:00:00Z",
            deleted_at: null,
          },
        ],
        total: 1,
        limit: 200,
        offset: 0,
      }),
  },
  {
    match: (u: string) => u.includes("/api/auth/me/departments"),
    respond: () =>
      jsonResponse([
        { id: DEPT_ID, code: "DIV1", name: "Division 1" },
      ]),
  },
  {
    match: (u: string) => u.includes("/api/admin/clients"),
    respond: () =>
      jsonResponse({
        items: [
          {
            id: CLIENT_ID,
            code: "CON",
            name: "Contoso",
            created_at: "2026-05-19T00:00:00Z",
            updated_at: "2026-05-19T00:00:00Z",
            deleted_at: null,
          },
        ],
        total: 1,
        limit: 200,
        offset: 0,
      }),
  },
  {
    match: (u: string) => u.includes("/api/admin/disciplines"),
    respond: () =>
      jsonResponse({
        items: [
          {
            id: DISCIPLINE_ID,
            code: "Design",
            name: "Protection & Controls",
            created_at: "2026-05-19T00:00:00Z",
            updated_at: "2026-05-19T00:00:00Z",
            deleted_at: null,
          },
        ],
        total: 1,
        limit: 200,
        offset: 0,
      }),
  },
]

describe("ProjectsListPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders rows with status badges and template intersection", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: () =>
          jsonResponse({
            items: [
              project({ id: "p1", number: "25756601", title: "Demo", state: "draft" }),
              project({ id: "p2", number: "25756602", title: "Live", state: "active" }),
            ],
            total: 2,
            limit: 200,
            offset: 0,
          }),
      },
      ...supportStubs,
    ])
    renderWithProviders(<App />, { route: "/projects" })

    await waitFor(() => {
      expect(screen.getByText("25756601")).toBeInTheDocument()
    })
    expect(screen.getByText("25756602")).toBeInTheDocument()
    expect(screen.getByText("Demo")).toBeInTheDocument()
    expect(screen.getByText("Live")).toBeInTheDocument()
    expect(screen.getAllByText("DIV1 · CON · Design").length).toBe(2)
    expect(screen.getByText("Draft")).toBeInTheDocument()
    expect(screen.getByText("Active")).toBeInTheDocument()
  })

  it("renders the empty state when no projects", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 200, offset: 0 }),
      },
      ...supportStubs,
    ])
    renderWithProviders(<App />, { route: "/projects" })
    await waitFor(() => {
      expect(screen.getByText(/no projects yet/i)).toBeInTheDocument()
    })
  })

  it("shows the New project button for project_editor", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(EDITOR),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 200, offset: 0 }),
      },
      ...supportStubs,
    ])
    renderWithProviders(<App />, { route: "/projects" })
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new project/i }),
      ).toBeInTheDocument()
    })
  })

  it("hides the New project button for viewer", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(VIEWER),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 200, offset: 0 }),
      },
      ...supportStubs,
    ])
    renderWithProviders(<App />, { route: "/projects" })
    await waitFor(() => {
      expect(screen.getByText(/no projects yet/i)).toBeInTheDocument()
    })
    expect(
      screen.queryByRole("button", { name: /new project/i }),
    ).not.toBeInTheDocument()
  })

  it("opens the create sheet with the expected fields", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(EDITOR),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 200, offset: 0 }),
      },
      ...supportStubs,
    ])
    renderWithProviders(<App />, { route: "/projects" })
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new project/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /new project/i }))
    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByLabelText(/^project number$/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/client project number/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/title/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/template/i)).toBeInTheDocument()
  })

  it("renders the topbar breadcrumb with 'Projects'", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 200, offset: 0 }),
      },
      ...supportStubs,
    ])
    renderWithProviders(<App />, { route: "/projects" })
    await waitFor(() => {
      expect(screen.getByText(/no projects yet/i)).toBeInTheDocument()
    })
    const breadcrumb = screen.getByRole("navigation", { name: /breadcrumb/i })
    expect(within(breadcrumb).getByText("Projects")).toBeInTheDocument()
  })

  it("renders status badges with the tone-aware Badge tokens", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: () =>
          jsonResponse({
            items: [
              project({ id: "p1", number: "M1", title: "Demo", state: "draft" }),
              project({ id: "p2", number: "M2", title: "Live", state: "active" }),
            ],
            total: 2,
            limit: 200,
            offset: 0,
          }),
      },
      ...supportStubs,
    ])
    renderWithProviders(<App />, { route: "/projects" })
    await waitFor(() => {
      expect(screen.getByText("Draft")).toBeInTheDocument()
    })
    // Slate tone for draft, emerald tone for active — proves the
    // lifecycleTone() mapping flows through.
    expect(screen.getByText("Draft")).toHaveClass(
      "bg-[hsl(var(--tone-slate-bg))]",
    )
    expect(screen.getByText("Active")).toHaveClass(
      "bg-[hsl(var(--tone-emerald-bg))]",
    )
  })

  it("cycles sort direction when a header is clicked: asc → desc → off", async () => {
    const seen: string[] = []
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: (url) => {
          seen.push(url)
          return jsonResponse({
            items: [],
            total: 0,
            limit: 200,
            offset: 0,
          })
        },
      },
      ...supportStubs,
    ])
    renderWithProviders(<App />, { route: "/projects" })
    await waitFor(() => {
      expect(screen.getByText(/no projects yet/i)).toBeInTheDocument()
    })
    const titleHeader = screen.getByRole("button", { name: /sort by title/i })
    seen.length = 0
    await user.click(titleHeader) // → asc
    await waitFor(() =>
      expect(
        seen.some((u) => u.includes("sort=title") && u.includes("sort_direction=asc")),
      ).toBe(true),
    )
    seen.length = 0
    await user.click(titleHeader) // → desc
    await waitFor(() =>
      expect(
        seen.some((u) => u.includes("sort=title") && u.includes("sort_direction=desc")),
      ).toBe(true),
    )
    seen.length = 0
    await user.click(titleHeader) // → off (no sort param)
    await waitFor(() =>
      expect(seen.some((u) => !u.includes("sort="))).toBe(true),
    )
  })

  it("renders table headers with the 4.8.3 design-ref styling", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: () =>
          jsonResponse({
            items: [project()],
            total: 1,
            limit: 15,
            offset: 0,
            page: 1,
            page_size: 15,
          }),
      },
      ...supportStubs,
    ])
    renderWithProviders(<App />, { route: "/projects" })
    await waitFor(() => {
      expect(screen.getByText("Demo project")).toBeInTheDocument()
    })
    // Probe one header cell (the Template header is a plain TableHead,
    // no SortableHead wrapper, so it carries the default styling
    // without any per-header overrides).
    const templateHeader = screen.getByRole("columnheader", { name: /template/i })
    expect(templateHeader.className).toContain("bg-[hsl(var(--card-2))]")
    expect(templateHeader.className).toContain("text-[11.5px]")
    expect(templateHeader.className).toContain("text-muted-foreground")
  })

  it("Split layout shows peek panel for the selected project", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      // PeekPanel's own fetches — match these BEFORE the generic
      // /api/projects list stub so they take priority.
      {
        match: (u) => /\/api\/projects\/p1\/cors/.test(u),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      {
        match: (u) => /\/api\/projects\/p1\/notes/.test(u),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 3, offset: 0 }),
      },
      {
        match: (u) => /\/api\/projects\/p1(\?|$)/.test(u),
        respond: () =>
          jsonResponse({
            ...project({ id: "p1", number: "M1", title: "Hawthorn", state: "active" }),
            milestones: [
              {
                id: "m1",
                project_id: "p1",
                template_milestone_def_id: null,
                name: "IFC Submittal",
                direction: "outbound",
                date_model: "single",
                planned_date: "2026-12-31",
                actual_date: null,
                order_index: 0,
                created_at: "2026-05-19T00:00:00Z",
                updated_at: "2026-05-19T00:00:00Z",
                deleted_at: null,
              },
            ],
            valid_next_states: [],
            can_edit: true,
            can_manage_access: false,
            template_field_defs: [],
          }),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: () =>
          jsonResponse({
            items: [
              project({ id: "p1", number: "M1", title: "Hawthorn", state: "active" }),
              project({ id: "p2", number: "M2", title: "Greenfield", state: "draft" }),
            ],
            total: 2,
            limit: 15,
            offset: 0,
            page: 1,
            page_size: 15,
          }),
      },
      ...supportStubs,
    ])
    renderWithProviders(<App />, { route: "/projects" })

    await waitFor(() => {
      expect(screen.getByText("Hawthorn")).toBeInTheDocument()
    })
    await user.click(screen.getByRole("tab", { name: /split/i }))

    // Click on Hawthorn in the left rail.
    await user.click(screen.getByRole("button", { name: /Hawthorn/i }))

    // 4.8.12: Split mode embeds the full project detail page in the
    // right column. Confirm the detail content rendered — the
    // "Custom fields" panel is a stable section header.
    await waitFor(() => {
      expect(screen.getByText("Custom fields")).toBeInTheDocument()
    })
    // Milestone name from the seeded detail data shows up. Phase 25.2: it
    // now appears in both the timeline card and the table, so assert
    // presence rather than uniqueness.
    expect(screen.getAllByText("IFC Submittal").length).toBeGreaterThan(0)
  })

  it("Peek panel renders an Open change orders section when there are draft/submitted CORs", async () => {
    // 4.8.12: peek panel is rendered in Table mode (not Split).
    window.localStorage.removeItem("tracker.projectsListLayout")
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => /\/api\/projects\/p1\/cors/.test(u),
        respond: () =>
          jsonResponse({
            items: [
              {
                id: "cor1",
                project_id: "p1",
                number: "COR-001",
                description: "Add lightning protection",
                amount: "12500",
                submitted_date: "2026-06-01",
                approved_date: null,
                status: "submitted",
                created_at: "2026-06-01T00:00:00Z",
                updated_at: "2026-06-01T00:00:00Z",
                deleted_at: null,
              },
            ],
            total: 1,
          }),
      },
      {
        match: (u) => /\/api\/projects\/p1\/notes/.test(u),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 3, offset: 0 }),
      },
      {
        match: (u) => /\/api\/projects\/p1(\?|$)/.test(u),
        respond: () =>
          jsonResponse({
            ...project({ id: "p1", number: "M1", title: "Hawthorn", state: "active" }),
            milestones: [],
            valid_next_states: [],
            can_edit: true,
            can_manage_access: false,
            template_field_defs: [],
          }),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: () =>
          jsonResponse({
            items: [
              project({ id: "p1", number: "M1", title: "Hawthorn", state: "active" }),
            ],
            total: 1,
            limit: 15,
            offset: 0,
            page: 1,
            page_size: 15,
          }),
      },
      ...supportStubs,
    ])
    renderWithProviders(<App />, { route: "/projects" })

    await waitFor(() => {
      expect(screen.getByText("Hawthorn")).toBeInTheDocument()
    })
    // Default Table layout — click the data row to dock the peek rail.
    const rows = screen.getAllByRole("row")
    await user.click(rows[1])

    // CORs section appears with the seeded COR's number visible.
    await waitFor(() => {
      expect(screen.getByText("COR-001")).toBeInTheDocument()
    })
    expect(screen.getByText(/open change orders/i)).toBeInTheDocument()
  })

  it("Department filter passes department_id to the project list", async () => {
    window.localStorage.removeItem("tracker.projectsListLayout")
    const user = userEvent.setup()
    const seen: string[] = []
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) =>
          u.includes("/api/projects") && !u.includes("/api/admin/"),
        respond: (url) => {
          seen.push(url)
          return jsonResponse({
            items: [],
            total: 0,
            limit: 15,
            offset: 0,
            page: 1,
            page_size: 15,
          })
        },
      },
      ...supportStubs,
    ])
    renderWithProviders(<App />, { route: "/projects" })

    await waitFor(() => {
      expect(screen.getByText(/no projects yet/i)).toBeInTheDocument()
    })
    seen.length = 0

    // Open the Department filter (multi-select popover) and check the
    // seeded department in the checklist.
    await user.click(screen.getByRole("button", { name: /department filter/i }))
    await user.click(await screen.findByText(/^DIV1$/))
    await waitFor(() => {
      expect(
        seen.some((u) => u.includes(`department_id=${DEPT_ID}`)),
      ).toBe(true)
    })
  })

  it("Table layout opens the peek overlay when a row is clicked", async () => {
    // Prior tests may leave `tracker.projectsListLayout` as "split";
    // explicitly reset so this test starts in the default Table mode.
    window.localStorage.removeItem("tracker.projectsListLayout")
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => /\/api\/projects\/p1\/cors/.test(u),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      {
        match: (u) => /\/api\/projects\/p1\/notes/.test(u),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 3, offset: 0 }),
      },
      {
        match: (u) => /\/api\/projects\/p1(\?|$)/.test(u),
        respond: () =>
          jsonResponse({
            ...project({ id: "p1", number: "M1", title: "Hawthorn", state: "active" }),
            milestones: [],
            valid_next_states: [],
            can_edit: true,
            can_manage_access: false,
            template_field_defs: [],
          }),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: () =>
          jsonResponse({
            items: [
              project({ id: "p1", number: "M1", title: "Hawthorn", state: "active" }),
            ],
            total: 1,
            limit: 15,
            offset: 0,
            page: 1,
            page_size: 15,
          }),
      },
      ...supportStubs,
    ])
    renderWithProviders(<App />, { route: "/projects" })

    await waitFor(() => {
      expect(screen.getByText("Hawthorn")).toBeInTheDocument()
    })

    // Default layout is Table. Clicking the data row opens the docked
    // peek rail (no modal overlay). The first row [0] is the header;
    // data rows start at [1].
    const rows = screen.getAllByRole("row")
    await user.click(rows[1])
    // The peek renders an "Open full project" link — that's a reliable
    // tell the docked rail mounted with our selected project.
    await waitFor(() => {
      const openFull = screen.getByRole("link", { name: /open full project/i })
      expect(openFull.getAttribute("href")).toBe("/projects/p1")
    })
    // 4.8.15: the clicked row picks up the selected styling.
    expect(rows[1].getAttribute("data-selected")).toBe("true")
    expect(rows[1].className).toContain("bg-[hsl(var(--row-sel))]")
  })

  it("Peek panel renders Metric fields when the template flags any", async () => {
    window.localStorage.removeItem("tracker.projectsListLayout")
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => /\/api\/projects\/p1\/cors/.test(u),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      {
        match: (u) => /\/api\/projects\/p1\/notes/.test(u),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 3, offset: 0 }),
      },
      {
        match: (u) => /\/api\/projects\/p1(\?|$)/.test(u),
        respond: () =>
          jsonResponse({
            ...project({ id: "p1", number: "M1", title: "Hawthorn", state: "active" }),
            // Project carries a custom_field_values map keyed by field def id.
            custom_field_values: {
              "fd-budget": "12500",
              "fd-progress": 65,
            },
            milestones: [],
            valid_next_states: [],
            can_edit: true,
            can_manage_access: false,
            // Two metric-flagged fields + one non-metric field that must
            // NOT show up in the Metrics grid.
            template_field_defs: [
              {
                id: "fd-budget",
                template_id: "tpl-1",
                name: "Design Budget",
                field_type: "currency",
                required: false,
                is_project_metric: true,
                order_index: 0,
                options: null,
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
                deleted_at: null,
              },
              {
                id: "fd-progress",
                template_id: "tpl-1",
                name: "Progress",
                field_type: "percent",
                required: false,
                is_project_metric: true,
                order_index: 1,
                options: null,
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
                deleted_at: null,
              },
              {
                id: "fd-notes",
                template_id: "tpl-1",
                name: "Notes",
                field_type: "long_text",
                required: false,
                is_project_metric: false,
                order_index: 2,
                options: null,
                created_at: "2026-01-01T00:00:00Z",
                updated_at: "2026-01-01T00:00:00Z",
                deleted_at: null,
              },
            ],
          }),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: () =>
          jsonResponse({
            items: [
              project({ id: "p1", number: "M1", title: "Hawthorn", state: "active" }),
            ],
            total: 1,
            limit: 15,
            offset: 0,
            page: 1,
            page_size: 15,
          }),
      },
      ...supportStubs,
    ])
    renderWithProviders(<App />, { route: "/projects" })

    await waitFor(() => {
      expect(screen.getByText("Hawthorn")).toBeInTheDocument()
    })
    const rows = screen.getAllByRole("row")
    await user.click(rows[1])

    // Metric field labels + formatted values appear in the peek.
    await waitFor(() => {
      expect(screen.getByText("Design Budget")).toBeInTheDocument()
    })
    expect(screen.getByText("$12,500")).toBeInTheDocument()
    expect(screen.getByText("Progress")).toBeInTheDocument()
    expect(screen.getByText("65%")).toBeInTheDocument()
    // Non-metric field's label must not surface in the peek.
    expect(screen.queryByText("Notes")).not.toBeInTheDocument()
  })

  it("Split layout deep-links via ?selected= on initial load", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      // PeekPanel fetches — match before the generic /api/projects stub.
      {
        match: (u) => /\/api\/projects\/p1\/cors/.test(u),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      {
        match: (u) => /\/api\/projects\/p1\/notes/.test(u),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 3, offset: 0 }),
      },
      {
        match: (u) => /\/api\/projects\/p1(\?|$)/.test(u),
        respond: () =>
          jsonResponse({
            ...project({ id: "p1", number: "M1", title: "Hawthorn", state: "active" }),
            milestones: [],
            valid_next_states: [],
            can_edit: true,
            can_manage_access: false,
            template_field_defs: [],
          }),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: () =>
          jsonResponse({
            items: [
              project({ id: "p1", number: "M1", title: "Hawthorn", state: "active" }),
            ],
            total: 1,
            limit: 15,
            offset: 0,
            page: 1,
            page_size: 15,
          }),
      },
      ...supportStubs,
    ])
    // localStorage layout = "split" so the page lands in split mode.
    window.localStorage.setItem(
      "tracker.projectsListLayout",
      JSON.stringify("split"),
    )
    renderWithProviders(<App />, { route: "/projects?selected=p1" })

    // 4.8.12: Split embeds the detail page; assert a stable section
    // header from the detail render appears in the right column.
    await waitFor(() => {
      expect(screen.getByText("Custom fields")).toBeInTheDocument()
    })
    window.localStorage.removeItem("tracker.projectsListLayout")
  })

  it("auto-opens the create sheet when navigated to with ?new=1", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: () =>
          jsonResponse({
            items: [],
            total: 0,
            limit: 15,
            offset: 0,
            page: 1,
            page_size: 15,
          }),
      },
      ...supportStubs,
    ])
    renderWithProviders(<App />, { route: "/projects?new=1" })

    // ProjectSheet renders a dialog; its open state is the only visible
    // proof we need here.
    await waitFor(() => {
      expect(screen.getByRole("dialog")).toBeInTheDocument()
    })
  })
})
