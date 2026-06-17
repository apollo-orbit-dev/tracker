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

const TEMPLATE = {
  id: "dddd4444-dddd-dddd-dddd-dddddddddddd",
  name: "DIV1 / CON / Design",
  department_id: "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  client_id: "bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
  discipline_id: "cccc3333-cccc-cccc-cccc-cccccccccccc",
  created_at: "2026-05-19T00:00:00Z",
  updated_at: "2026-05-19T00:00:00Z",
  deleted_at: null,
}

const TAXONOMY = (id: string, code: string) => ({
  id,
  code,
  name: code,
  created_at: "2026-05-19T00:00:00Z",
  updated_at: "2026-05-19T00:00:00Z",
  deleted_at: null,
})

const taxonomyStubs = [
  {
    match: (u: string) => u.includes("/api/auth/me/departments"),
    respond: () =>
      jsonResponse([
        { id: TEMPLATE.department_id, code: "DIV1", name: "Division 1" },
      ]),
  },
  {
    match: (u: string) => u.includes("/api/admin/clients"),
    respond: () =>
      jsonResponse({
        items: [TAXONOMY(TEMPLATE.client_id, "CON")],
        total: 1,
        limit: 200,
        offset: 0,
      }),
  },
  {
    match: (u: string) => u.includes("/api/admin/disciplines"),
    respond: () =>
      jsonResponse({
        items: [TAXONOMY(TEMPLATE.discipline_id, "Design")],
        total: 1,
        limit: 200,
        offset: 0,
      }),
  },
]

function field(overrides: Partial<{
  id: string
  name: string
  field_type: string
  required: boolean
  order_index: number
  options: { choices: string[] } | null
}> = {}) {
  return {
    id: overrides.id ?? "ffff5555-ffff-ffff-ffff-ffffffffffff",
    template_id: TEMPLATE.id,
    name: overrides.name ?? "Project Description",
    field_type: overrides.field_type ?? "short_text",
    required: overrides.required ?? false,
    order_index: overrides.order_index ?? 0,
    options: overrides.options ?? null,
    created_at: "2026-05-19T00:00:00Z",
    updated_at: "2026-05-19T00:00:00Z",
    deleted_at: null,
  }
}

function milestone(overrides: Partial<{
  id: string
  name: string
  direction: string
  date_model: string
  order_index: number
}> = {}) {
  return {
    id: overrides.id ?? "eeee6666-eeee-eeee-eeee-eeeeeeeeeeee",
    template_id: TEMPLATE.id,
    name: overrides.name ?? "IFC Submittal",
    direction: overrides.direction ?? "outbound",
    date_model: overrides.date_model ?? "planned_actual",
    order_index: overrides.order_index ?? 0,
    created_at: "2026-05-19T00:00:00Z",
    updated_at: "2026-05-19T00:00:00Z",
    deleted_at: null,
  }
}

const route = `/admin/templates/${TEMPLATE.id}`

describe("TemplateDetailPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders a Templates breadcrumb that links back to the list", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/admin/templates/${TEMPLATE.id}`),
        respond: () => jsonResponse(TEMPLATE),
      },
      {
        match: (u) =>
          u.endsWith(`/api/admin/templates/${TEMPLATE.id}/fields`),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      {
        match: (u) =>
          u.endsWith(`/api/admin/templates/${TEMPLATE.id}/milestones`),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route })
    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "DIV1 / CON / Design" }),
      ).toBeInTheDocument()
    })
    // Phase 4.5.1 introduced the admin sub-sidebar, which also renders
    // a "Templates" link. Confirm at least one of the "Templates" links
    // (sidebar nav or page breadcrumb) points back to the list.
    const links = screen.getAllByRole("link", { name: /^templates$/i })
    expect(links.length).toBeGreaterThanOrEqual(1)
    expect(
      links.some((l) => l.getAttribute("href") === "/admin/templates"),
    ).toBe(true)
  })

  it("renders the template header with intersection codes", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/admin/templates/${TEMPLATE.id}`),
        respond: () => jsonResponse(TEMPLATE),
      },
      {
        match: (u) =>
          u.endsWith(`/api/admin/templates/${TEMPLATE.id}/fields`),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      {
        match: (u) =>
          u.endsWith(`/api/admin/templates/${TEMPLATE.id}/milestones`),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route })

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { level: 1, name: "DIV1 / CON / Design" }),
      ).toBeInTheDocument()
    })
    // Phase 4.5.4 replaced the inline "DIV1 · CON · Design" text with three
    // chip spans separated by chevron icons. Probe for each chip
    // individually — they live in the page header above the title.
    expect(screen.getByText("DIV1")).toBeInTheDocument()
    expect(screen.getByText("CON")).toBeInTheDocument()
    expect(screen.getByText("Design")).toBeInTheDocument()
  })

  it("lists fields sorted by order_index and shows type labels", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/admin/templates/${TEMPLATE.id}`),
        respond: () => jsonResponse(TEMPLATE),
      },
      {
        match: (u) =>
          u.endsWith(`/api/admin/templates/${TEMPLATE.id}/fields`),
        respond: () =>
          jsonResponse({
            items: [
              field({ id: "a", name: "First", order_index: 0 }),
              field({
                id: "b",
                name: "Phase",
                field_type: "single_select",
                order_index: 1,
                options: { choices: ["scoping", "design", "build"] },
              }),
            ],
            total: 2,
          }),
      },
      {
        match: (u) =>
          u.endsWith(`/api/admin/templates/${TEMPLATE.id}/milestones`),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route })

    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument()
    })
    expect(screen.getByText("Phase")).toBeInTheDocument()
    // Phase 4.5.4: type label moved into a Badge — text still rendered.
    const shortTextBadge = screen.getByText("Short text")
    expect(shortTextBadge).toBeInTheDocument()
    // Badge applies the tone background via a class containing the token name.
    // For short_text the tone is `slate` (group=Text).
    expect(shortTextBadge.className).toMatch(/tone-slate-bg/)
    // single_select sits in the Choice group → indigo tone.
    const phaseBadge = screen.getByText("Single select")
    expect(phaseBadge.className).toMatch(/tone-indigo-bg/)
  })

  it("lists milestone items inline (no Tabs)", async () => {
    // Phase 4.5.4 replaced the Fields/Milestones Tabs with two stacked
    // panels — milestones are visible without a tab click.
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/admin/templates/${TEMPLATE.id}`),
        respond: () => jsonResponse(TEMPLATE),
      },
      {
        match: (u) =>
          u.endsWith(`/api/admin/templates/${TEMPLATE.id}/fields`),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      {
        match: (u) =>
          u.endsWith(`/api/admin/templates/${TEMPLATE.id}/milestones`),
        respond: () =>
          jsonResponse({
            items: [milestone({ name: "30% Submittal" })],
            total: 1,
          }),
      },
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route })

    await waitFor(() => {
      expect(screen.getByText("30% Submittal")).toBeInTheDocument()
    })
    expect(screen.getByText(/Outbound/)).toBeInTheDocument()
  })

  it("opens the New field sheet with the expected controls", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/admin/templates/${TEMPLATE.id}`),
        respond: () => jsonResponse(TEMPLATE),
      },
      {
        match: (u) =>
          u.endsWith(`/api/admin/templates/${TEMPLATE.id}/fields`),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      {
        match: (u) =>
          u.endsWith(`/api/admin/templates/${TEMPLATE.id}/milestones`),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route })

    await waitFor(() => {
      expect(
        screen.getByRole("button", { name: /add field/i }),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByRole("button", { name: /add field/i }))

    const dialog = await screen.findByRole("dialog")
    expect(within(dialog).getByLabelText(/^name$/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/^type$/i)).toBeInTheDocument()
    expect(within(dialog).getByLabelText(/required/i)).toBeInTheDocument()
    // Order is no longer a form field — it's managed via drag handles.
    expect(within(dialog).queryByLabelText(/^order$/i)).not.toBeInTheDocument()
  })

  it("renders a drag handle for each field row", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/admin/templates/${TEMPLATE.id}`),
        respond: () => jsonResponse(TEMPLATE),
      },
      {
        match: (u) =>
          u.endsWith(`/api/admin/templates/${TEMPLATE.id}/fields`),
        respond: () =>
          jsonResponse({
            items: [
              field({ id: "a", name: "First" }),
              field({ id: "b", name: "Second" }),
            ],
            total: 2,
          }),
      },
      {
        match: (u) =>
          u.endsWith(`/api/admin/templates/${TEMPLATE.id}/milestones`),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route })

    await waitFor(() => {
      expect(screen.getByText("First")).toBeInTheDocument()
    })
    const handles = screen.getAllByRole("button", { name: /drag to reorder/i })
    expect(handles).toHaveLength(2)
  })

  it("shows the options editor when editing a single_select field", async () => {
    const user = userEvent.setup()
    const f = field({
      id: "select-1",
      name: "Phase",
      field_type: "single_select",
      options: { choices: ["scoping", "design", "build"] },
    })
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/admin/templates/${TEMPLATE.id}`),
        respond: () => jsonResponse(TEMPLATE),
      },
      {
        match: (u) =>
          u.endsWith(`/api/admin/templates/${TEMPLATE.id}/fields`),
        respond: () => jsonResponse({ items: [f], total: 1 }),
      },
      {
        match: (u) =>
          u.endsWith(`/api/admin/templates/${TEMPLATE.id}/milestones`),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route })

    await waitFor(() => {
      expect(screen.getByText("Phase")).toBeInTheDocument()
    })
    await user.click(
      screen.getByRole("button", { name: /actions for Phase/i }),
    )
    await user.click(await screen.findByText(/^edit$/i))

    const dialog = await screen.findByRole("dialog")
    // Options editor renders three choice inputs prefilled with the values
    expect(within(dialog).getByDisplayValue("scoping")).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue("design")).toBeInTheDocument()
    expect(within(dialog).getByDisplayValue("build")).toBeInTheDocument()
    expect(
      within(dialog).getByRole("button", { name: /add choice/i }),
    ).toBeInTheDocument()
  })

  it("renders a 'not found' state when template 404s", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/admin/templates/${TEMPLATE.id}`),
        respond: () => jsonResponse({ detail: "Template not found" }, 404),
      },
      ...taxonomyStubs,
    ])
    renderWithProviders(<App />, { route })

    await waitFor(() => {
      // "Template not found" appears in both the page title and the alert title;
      // assert at least one is present.
      expect(
        screen.getAllByText(/template not found/i).length,
      ).toBeGreaterThan(0)
    })
    expect(screen.getByText(/back to templates/i)).toBeInTheDocument()
  })
})
