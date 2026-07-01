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

const VIEWER = {
  id: "33333333-3333-3333-3333-333333333333",
  email: "viewer@example.com",
  display_name: "Viewer",
  roles: ["viewer"],
}

const TID = "dddd4444-dddd-dddd-dddd-dddddddddddd"
const DEPT_ID = "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const CLIENT_ID = "bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
const DISC_ID = "cccc3333-cccc-cccc-cccc-cccccccccccc"

const FIELD_TEXT = {
  id: "ffff5555-ffff-ffff-ffff-ffffffffffff",
  template_id: TID,
  name: "Project Description",
  field_type: "short_text",
  required: true,
  order_index: 0,
  options: null,
  created_at: "2026-05-19T00:00:00Z",
  updated_at: "2026-05-19T00:00:00Z",
  deleted_at: null,
}

const FIELD_SELECT = {
  id: "ffff6666-ffff-ffff-ffff-ffffffffffff",
  template_id: TID,
  name: "Phase",
  field_type: "single_select",
  required: false,
  order_index: 1,
  options: { choices: ["scoping", "design", "build"] },
  created_at: "2026-05-19T00:00:00Z",
  updated_at: "2026-05-19T00:00:00Z",
  deleted_at: null,
}

function project(overrides: Partial<{
  pid: string
  state: string
  valid: string[]
  cfv: Record<string, unknown>
  planned: string | null
  can_edit: boolean
  can_manage_access: boolean
}> = {}) {
  const pid = overrides.pid ?? "eeee7777-eeee-eeee-eeee-eeeeeeeeeeee"
  return {
    id: pid,
    project_number: "25756601",
    client_project_number: null,
    title: "Demo project",
    template_id: TID,
    lifecycle_state: overrides.state ?? "draft",
    custom_field_values: overrides.cfv ?? {},
    created_by: ADMIN.id,
    created_at: "2026-05-19T00:00:00Z",
    updated_at: "2026-05-19T00:00:00Z",
    deleted_at: null,
    milestones: [
      {
        id: "mmmm8888-mmmm-mmmm-mmmm-mmmmmmmmmmmm",
        project_id: pid,
        template_milestone_def_id:
          "gggg1111-gggg-gggg-gggg-gggggggggggg" as string | null,
        name: "IFC Submittal",
        direction: "outbound",
        date_model: "planned_actual",
        planned_date: overrides.planned ?? null,
        actual_date: null,
        order_index: 0,
        created_at: "2026-05-19T00:00:00Z",
        updated_at: "2026-05-19T00:00:00Z",
        deleted_at: null,
      },
    ],
    valid_next_states: overrides.valid ?? ["active", "cancelled"],
    can_edit: overrides.can_edit ?? true,
    can_manage_access: overrides.can_manage_access ?? true,
    template_name: "DIV1 / CON / Design",
    template_intersection: "DIV1 · CON · Design",
    template_field_defs: [FIELD_TEXT, FIELD_SELECT],
  }
}

const TEMPLATE = {
  id: TID,
  name: "DIV1 / CON / Design",
  department_id: DEPT_ID,
  client_id: CLIENT_ID,
  discipline_id: DISC_ID,
  created_at: "2026-05-19T00:00:00Z",
  updated_at: "2026-05-19T00:00:00Z",
  deleted_at: null,
}

const taxonomyStubs = [
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
            name: "Fabrikam",
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
            id: DISC_ID,
            code: "Design",
            name: "Design",
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

function templateStubs(includeFields = true) {
  return [
    {
      match: (u: string) => u.endsWith(`/api/admin/templates/${TID}/fields`),
      respond: () =>
        jsonResponse({
          items: includeFields ? [FIELD_TEXT, FIELD_SELECT] : [],
          total: includeFields ? 2 : 0,
        }),
    },
    {
      match: (u: string) => u.endsWith(`/api/admin/templates/${TID}`),
      respond: () => jsonResponse(TEMPLATE),
    },
  ]
}

const PID = "eeee7777-eeee-eeee-eeee-eeeeeeeeeeee"
const ROUTE = `/projects/${PID}`

describe("ProjectDetailPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders header, custom fields card, milestones table, lifecycle card", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () => jsonResponse(project()),
      },
      ...templateStubs(),
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route: ROUTE })

    await waitFor(() => {
      // Title shows up in the topbar breadcrumb + the in-body <h1>. Use
      // the h1 to disambiguate.
      expect(
        screen.getByRole("heading", { level: 1, name: "Demo project" }),
      ).toBeInTheDocument()
    })
    // "25756601" appears in both breadcrumb and subtitle — assert at least one.
    expect(screen.getAllByText("25756601").length).toBeGreaterThan(0)
    // Intersection populates after the template fetch completes — wait for it.
    await waitFor(() => {
      // Appears in the hero meta line + the sidebar Properties block.
      expect(screen.getAllByText(/DIV1 · CON · Design/).length).toBeGreaterThan(0)
    })
    // Custom field labels (also async)
    await waitFor(() => {
      expect(screen.getByText("Project Description")).toBeInTheDocument()
    })
    expect(screen.getByText("Phase")).toBeInTheDocument()
    // Milestones row. Phase 25.2: the name also appears in the timeline
    // card, so it's no longer unique — assert presence, not uniqueness.
    expect(screen.getAllByText("IFC Submittal").length).toBeGreaterThan(0)
    // Phase 4.3: the Lifecycle card is gone; status + Change state dropdown
    // live in the hero instead. Status badge is sufficient evidence.
    expect(screen.getByText("Draft")).toBeInTheDocument()
  })

  it("renders read-only (no edit controls) for viewer", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(VIEWER),
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () => jsonResponse(project({ can_edit: false })),
      },
      ...templateStubs(),
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route: ROUTE })

    await waitFor(() => {
      // Title shows up in the topbar breadcrumb + the in-body <h1>. Use
      // the h1 to disambiguate.
      expect(
        screen.getByRole("heading", { level: 1, name: "Demo project" }),
      ).toBeInTheDocument()
    })
    // Phase 25.4: viewers see milestone dates as plain text, not a
    // (disabled) date input — no editable planned-date control exists.
    expect(
      screen.queryByLabelText(/Planned date for IFC Submittal/i),
    ).not.toBeInTheDocument()
    // No Save changes button (no editor)
    expect(
      screen.queryByRole("button", { name: /save changes/i }),
    ).not.toBeInTheDocument()
    // No lifecycle move buttons
    expect(
      screen.queryByRole("button", { name: /move to/i }),
    ).not.toBeInTheDocument()
  })

  it("renders 404 state for missing project", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () => jsonResponse({ detail: "Project not found" }, 404),
      },
    ])
    renderWithProviders(<App />, { route: ROUTE })
    await waitFor(() => {
      expect(
        screen.getAllByText(/project not found/i).length,
      ).toBeGreaterThan(0)
    })
    expect(screen.getByText(/back to projects/i)).toBeInTheDocument()
  })

  it("shows lifecycle blocker reasons when active transition is rejected", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () => jsonResponse(project()),
      },
      {
        match: (u, init) =>
          u.endsWith(`/api/projects/${PID}/transition`) &&
          init?.method === "POST",
        respond: () =>
          jsonResponse(
            {
              detail: [
                "required field <fid> is not set",
                "milestone #1 has no planned date",
              ],
            },
            422,
          ),
      },
      ...templateStubs(),
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route: ROUTE })

    // Phase 4.3: "Move to {state}" is now a dropdown menuitem inside the
    // Change state dropdown in the hero, not a stand-alone button.
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /change state/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /change state/i }))
    await user.click(
      await screen.findByRole("menuitem", { name: /move to active/i }),
    )
    await waitFor(() => {
      expect(screen.getByText(/transition blocked/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/required field/i)).toBeInTheDocument()
    expect(screen.getByText(/no planned date/i)).toBeInTheDocument()
  })

  it("transitions to active successfully when ready", async () => {
    const user = userEvent.setup()
    const ready = project({
      cfv: { [FIELD_TEXT.id]: "filled" },
      planned: "2026-06-01",
    })
    const after = { ...ready, lifecycle_state: "active", valid_next_states: ["on_hold", "complete", "cancelled"] }
    let state = "draft"
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u, init) =>
          u.endsWith(`/api/projects/${PID}/transition`) &&
          init?.method === "POST",
        respond: () => {
          state = "active"
          return jsonResponse(after)
        },
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () =>
          jsonResponse(state === "active" ? after : ready),
      },
      ...templateStubs(),
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route: ROUTE })
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /change state/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /change state/i }))
    await user.click(
      await screen.findByRole("menuitem", { name: /move to active/i }),
    )
    await waitFor(() => {
      // Status badge in the hero swaps from Draft → Active after the
      // transition mutation resolves.
      expect(screen.getByText("Active")).toBeInTheDocument()
    })
  })

  it("renders New milestone button for editor", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () => jsonResponse(project()),
      },
      ...templateStubs(),
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route: ROUTE })
    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /new milestone/i }),
      ).toBeInTheDocument()
    })
  })

  it("does not render New milestone for viewer", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(VIEWER),
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () => jsonResponse(project({ can_edit: false })),
      },
      ...templateStubs(),
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route: ROUTE })
    await waitFor(() => {
      // 25.2: name appears in both the timeline and the table.
      expect(screen.getAllByText("IFC Submittal").length).toBeGreaterThan(0)
    })
    expect(
      screen.queryByRole("button", { name: /new milestone/i }),
    ).not.toBeInTheDocument()
  })

  it("renders ad-hoc badge for milestones with null template_milestone_def_id", async () => {
    const p = project()
    p.milestones[0] = {
      ...p.milestones[0],
      name: "Ad-hoc thing",
      template_milestone_def_id: null,
    }
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () => jsonResponse(p),
      },
      ...templateStubs(),
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route: ROUTE })
    await waitFor(() => {
      // 25.2: name appears in both the timeline and the table.
      expect(screen.getAllByText("Ad-hoc thing").length).toBeGreaterThan(0)
    })
    // The ad-hoc badge itself is table-only, so it stays unique.
    expect(screen.getByText(/^ad-hoc$/i)).toBeInTheDocument()
  })

  it("PATCH milestone planned_date on blur", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u, init) =>
          u.includes(`/api/projects/${PID}/milestones/`) &&
          init?.method === "PATCH",
        respond: () =>
          jsonResponse({
            id: "mmmm8888-mmmm-mmmm-mmmm-mmmmmmmmmmmm",
            project_id: PID,
            template_milestone_def_id: null,
            name: "IFC Submittal",
            direction: "outbound",
            date_model: "planned_actual",
            planned_date: "2026-06-01",
            actual_date: null,
            order_index: 0,
            created_at: "2026-05-19T00:00:00Z",
            updated_at: "2026-05-19T00:00:00Z",
            deleted_at: null,
          }),
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () => jsonResponse(project()),
      },
      ...templateStubs(),
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route: ROUTE })
    const plannedInput = await screen.findByLabelText(
      /Planned date for IFC Submittal/i,
    )
    await user.type(plannedInput, "2026-06-01")
    plannedInput.blur()
    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (c) =>
          String(c[0]).includes(`/api/projects/${PID}/milestones/`) &&
          (c[1] as RequestInit | undefined)?.method === "PATCH",
      )
      expect(patchCalls.length).toBeGreaterThan(0)
    })
  })

  // ---- Phase 4.3 redress ------------------------------------------------

  it("renders the topbar breadcrumb trail: Projects > Project # > Title", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () => jsonResponse(project()),
      },
      ...templateStubs(),
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route: ROUTE })
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "Demo project" }),
      ).toBeInTheDocument()
    })
    const crumbs = screen.getByRole("navigation", { name: /breadcrumb/i })
    expect(within(crumbs).getByText("Projects")).toBeInTheDocument()
    expect(within(crumbs).getByText("25756601")).toBeInTheDocument()
    expect(within(crumbs).getByText("Demo project")).toBeInTheDocument()
  })

  it("renders the right sidebar Properties + Activity blocks", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () => jsonResponse(project()),
      },
      ...templateStubs(),
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route: ROUTE })
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /properties/i }),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByRole("heading", { name: /activity/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/^Created$/)).toBeInTheDocument()
    expect(screen.getByText(/^Last updated$/)).toBeInTheDocument()
    // Budget panel is intentionally NOT rendered in 4.3 (those values
    // are project custom fields, not first-class properties).
    expect(
      screen.queryByRole("heading", { name: /^budget$/i }),
    ).not.toBeInTheDocument()

    // Phase 4.8.6: aside is viewport-fixed on lg+ so the rail stays
    // pinned to the right edge of the window with its own scroll.
    // Pin the class strings so the next refactor doesn't silently
    // regress to sticky or bg-card.
    const aside = screen
      .getByRole("heading", { name: /properties/i })
      .closest("aside")
    expect(aside).not.toBeNull()
    expect(aside?.className).toContain("bg-[hsl(var(--card-2))]")
    expect(aside?.className).toContain("lg:fixed")
    expect(aside?.className).toContain("lg:right-0")
  })

  it("renders the status badge with the lifecycle tone in the hero", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () =>
          jsonResponse(project({ state: "active" })),
      },
      ...templateStubs(),
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route: ROUTE })
    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument()
    })
    expect(screen.getByText("Active")).toHaveClass(
      "bg-[hsl(var(--tone-emerald-bg))]",
    )
  })

  // ---- Phase 4.7.1 InlineText title -------------------------------------

  it("inline-edits the project title and PATCHes the new value", async () => {
    const user = userEvent.setup()
    const fetchMock = stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u, init) =>
          u.endsWith(`/api/projects/${PID}`) && init?.method === "PATCH",
        respond: () =>
          jsonResponse(project({ title: "Updated title" })),
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () => jsonResponse(project()),
      },
      ...templateStubs(),
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route: ROUTE })

    // Display state: title is a clickable button inside the h1.
    const titleButton = await screen.findByRole("button", {
      name: /project title/i,
    })
    await user.click(titleButton)

    const input = (await screen.findByRole("textbox", {
      name: /project title/i,
    })) as HTMLInputElement
    await user.clear(input)
    await user.type(input, "Updated title{Enter}")

    await waitFor(() => {
      const patchCalls = fetchMock.mock.calls.filter(
        (c) =>
          String(c[0]).endsWith(`/api/projects/${PID}`) &&
          (c[1] as RequestInit | undefined)?.method === "PATCH",
      )
      expect(patchCalls.length).toBeGreaterThan(0)
      const body = JSON.parse(
        (patchCalls[0][1] as RequestInit).body as string,
      )
      expect(body).toEqual({ title: "Updated title" })
    })
  })

  it("keeps the title static (no button) for users without can_edit", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(VIEWER),
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () => jsonResponse(project({ can_edit: false })),
      },
      ...templateStubs(),
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route: ROUTE })
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "Demo project" }),
      ).toBeInTheDocument()
    })
    // The "project title" button only renders for editors.
    expect(
      screen.queryByRole("button", { name: /project title/i }),
    ).not.toBeInTheDocument()
  })

  // ---- Phase 4.8.4 Panel collapsibility --------------------------------

  it("Custom fields panel head toggles body visibility", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () => jsonResponse(project()),
      },
      ...templateStubs(),
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route: ROUTE })

    // Panel head is a button with aria-expanded that toggles.
    const toggle = await screen.findByRole("button", {
      name: /toggle custom fields/i,
    })
    expect(toggle.getAttribute("aria-expanded")).toBe("true")

    // The panel subtitle (rendered in the head) stays visible regardless;
    // the body's "Save changes" button / "No custom fields" copy is what
    // disappears on collapse.
    await user.click(toggle)
    await waitFor(() => {
      expect(toggle.getAttribute("aria-expanded")).toBe("false")
    })

    // Click again — re-expands.
    await user.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
  })

  // ---- Phase 5.2 Metrics block -----------------------------------------

  it("renders a Metrics block in the right sidebar when the template has any flagged fields", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () =>
          jsonResponse({
            ...project({ cfv: { "fd-budget": "30000" } }),
            template_field_defs: [
              {
                id: "fd-budget",
                template_id: TID,
                name: "Design Budget",
                field_type: "currency",
                required: false,
                is_project_metric: true,
                order_index: 0,
                options: null,
                created_at: "2026-05-19T00:00:00Z",
                updated_at: "2026-05-19T00:00:00Z",
                deleted_at: null,
              },
              { ...FIELD_TEXT, is_project_metric: false },
            ],
          }),
      },
      ...templateStubs(),
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route: ROUTE })
    const metricsHeading = await screen.findByRole("heading", {
      name: /metrics/i,
    })
    // The metric field's label also appears in the Custom fields panel,
    // so scope to the SideBlock's <section> (heading sits inside
    // section > header).
    const metricsSection = metricsHeading.closest("section")!
    expect(within(metricsSection).getByText("Design Budget")).toBeInTheDocument()
    expect(within(metricsSection).getByText("$30,000")).toBeInTheDocument()
  })
})
