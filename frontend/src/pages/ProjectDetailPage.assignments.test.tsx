import { screen, waitFor } from "@testing-library/react"
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

const TID = "dddd4444-dddd-dddd-dddd-dddddddddddd"
const DEPT_ID = "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const CLIENT_ID = "bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
const DISC_ID = "cccc3333-cccc-cccc-cccc-cccccccccccc"
const PID = "eeee7777-eeee-eeee-eeee-eeeeeeeeeeee"
const MID = "mmmm8888-mmmm-mmmm-mmmm-mmmmmmmmmmmm"
const ROUTE = `/projects/${PID}`

const ASSIGNMENT = {
  id: "aaaa9999-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  project_id: PID,
  milestone_id: MID,
  milestone_name: "IFC Submittal",
  assignee_user_id: ADMIN.id,
  assignee_name: "Admin",
  assignee_email: "admin@example.com",
  description: "Wire the relay panel",
  status: "open",
  due_date: null,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
  deleted_at: null,
}

function makeProject() {
  return {
    id: PID,
    project_number: "25756601",
    client_project_number: null,
    title: "Demo project",
    template_id: TID,
    lifecycle_state: "draft",
    custom_field_values: {},
    created_by: ADMIN.id,
    created_at: "2026-05-19T00:00:00Z",
    updated_at: "2026-05-19T00:00:00Z",
    deleted_at: null,
    milestones: [
      {
        id: MID,
        project_id: PID,
        template_milestone_def_id: "gggg1111-gggg-gggg-gggg-gggggggggggg",
        name: "IFC Submittal",
        direction: "outbound",
        date_model: "planned_actual",
        planned_date: null,
        actual_date: null,
        order_index: 0,
        created_at: "2026-05-19T00:00:00Z",
        updated_at: "2026-05-19T00:00:00Z",
        deleted_at: null,
      },
    ],
    valid_next_states: ["active", "cancelled"],
    can_edit: true,
    can_manage_access: true,
    template_name: "DIV1 / CON / Design",
    template_intersection: "DIV1 · CON · Design",
    template_field_defs: [],
  }
}

const taxonomyStubs = [
  {
    match: (u: string) => u.includes("/api/auth/me/departments"),
    respond: () =>
      jsonResponse([{ id: DEPT_ID, code: "DIV1", name: "Division 1" }]),
  },
  {
    match: (u: string) => u.includes("/api/admin/clients"),
    respond: () =>
      jsonResponse({ items: [{ id: CLIENT_ID, code: "CON", name: "Fabrikam", created_at: "2026-05-19T00:00:00Z", updated_at: "2026-05-19T00:00:00Z", deleted_at: null }], total: 1, limit: 200, offset: 0 }),
  },
  {
    match: (u: string) => u.includes("/api/admin/disciplines"),
    respond: () =>
      jsonResponse({ items: [{ id: DISC_ID, code: "Design", name: "Design", created_at: "2026-05-19T00:00:00Z", updated_at: "2026-05-19T00:00:00Z", deleted_at: null }], total: 1, limit: 200, offset: 0 }),
  },
]

const templateStubs = [
  {
    match: (u: string) => u.endsWith(`/api/admin/templates/${TID}/fields`),
    respond: () => jsonResponse({ items: [], total: 0 }),
  },
  {
    match: (u: string) => u.endsWith(`/api/admin/templates/${TID}`),
    respond: () =>
      jsonResponse({
        id: TID,
        name: "DIV1 / CON / Design",
        department_id: DEPT_ID,
        client_id: CLIENT_ID,
        discipline_id: DISC_ID,
        created_at: "2026-05-19T00:00:00Z",
        updated_at: "2026-05-19T00:00:00Z",
        deleted_at: null,
      }),
  },
]

describe("Assignments card", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders the Assignments heading and an assignment row", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(ADMIN),
      },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () => jsonResponse(makeProject()),
      },
      {
        match: (u) => u.includes(`/api/projects/${PID}/assignments/eligible-users`),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      {
        match: (u) => u.includes(`/api/projects/${PID}/assignments`),
        respond: () => jsonResponse({ items: [ASSIGNMENT], total: 1 }),
      },
      ...templateStubs,
      ...taxonomyStubs,
    ])

    renderWithProviders(<App />, { route: ROUTE })

    expect(await screen.findByText("Assignments")).toBeInTheDocument()
    expect(await screen.findByText("Wire the relay panel")).toBeInTheDocument()
  })

  it("lets the assignee (a viewer) change status inline", async () => {
    const VIEWER = {
      id: "vvvv1111-vvvv-vvvv-vvvv-vvvvvvvvvvvv",
      email: "viewer@example.com",
      display_name: "Viewer",
      roles: ["viewer"],
    }
    const project = { ...makeProject(), can_edit: false }
    const assignment = { ...ASSIGNMENT, assignee_user_id: VIEWER.id }
    const user = userEvent.setup()
    const fetchMock = stubFetchByRoute([
      { match: (u) => u.endsWith("/api/auth/me"), respond: () => jsonResponse(VIEWER) },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () => jsonResponse(project),
      },
      {
        match: (u) => u.includes(`/api/projects/${PID}/assignments/eligible-users`),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      {
        match: (u, init) =>
          u.includes(`/api/projects/${PID}/assignments/`) &&
          init?.method === "PATCH",
        respond: () => jsonResponse({ ...assignment, status: "done" }),
      },
      {
        match: (u) => u.includes(`/api/projects/${PID}/assignments`),
        respond: () => jsonResponse({ items: [assignment], total: 1 }),
      },
      ...templateStubs,
      ...taxonomyStubs,
    ])

    renderWithProviders(<App />, { route: ROUTE })

    const control = await screen.findByRole("combobox", {
      name: /status for Wire the relay panel/i,
    })
    await user.click(control)
    await user.click(await screen.findByRole("option", { name: "Done" }))

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([u, init]: [string, RequestInit?]) =>
          String(u).includes(`/api/projects/${PID}/assignments/`) &&
          init?.method === "PATCH",
      )
      expect(patch).toBeTruthy()
      expect(JSON.parse(patch![1]!.body as string)).toEqual({ status: "done" })
    })
  })

  it("shows a static badge (no control) for a viewer who is not the assignee", async () => {
    const VIEWER = {
      id: "vvvv2222-vvvv-vvvv-vvvv-vvvvvvvvvvvv",
      email: "viewer2@example.com",
      display_name: "Viewer Two",
      roles: ["viewer"],
    }
    const project = { ...makeProject(), can_edit: false }
    // assignee is ADMIN, not this viewer.
    stubFetchByRoute([
      { match: (u) => u.endsWith("/api/auth/me"), respond: () => jsonResponse(VIEWER) },
      {
        match: (u) => u.endsWith(`/api/projects/${PID}`),
        respond: () => jsonResponse(project),
      },
      {
        match: (u) => u.includes(`/api/projects/${PID}/assignments/eligible-users`),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
      {
        match: (u) => u.includes(`/api/projects/${PID}/assignments`),
        respond: () => jsonResponse({ items: [ASSIGNMENT], total: 1 }),
      },
      ...templateStubs,
      ...taxonomyStubs,
    ])

    renderWithProviders(<App />, { route: ROUTE })

    expect(await screen.findByText("Wire the relay panel")).toBeInTheDocument()
    // The status badge renders, but not an editable control.
    expect(screen.getByText("Open")).toBeInTheDocument()
    expect(
      screen.queryByRole("combobox", {
        name: /status for Wire the relay panel/i,
      }),
    ).not.toBeInTheDocument()
  })
})
