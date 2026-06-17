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

const TEMPLATE_ID = "dddd4444-dddd-dddd-dddd-dddddddddddd"
const TEMPLATE_ID_2 = "eeee5555-eeee-eeee-eeee-eeeeeeeeeeee"
const DEPT_ID = "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
const CLIENT_ID = "bbbb2222-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
const DISCIPLINE_ID = "cccc3333-cccc-cccc-cccc-cccccccccccc"

// Common support stubs reused across most tests.
const baseSupportStubs = [
  {
    match: (u: string) => u.endsWith("/api/auth/me"),
    respond: () => jsonResponse(ADMIN),
  },
  {
    match: (u: string) => u.includes("/api/auth/me/departments"),
    respond: () =>
      jsonResponse([{ id: DEPT_ID, code: "DIV1", name: "Division 1" }]),
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

function templateListStub(items: { id: string }[]) {
  return {
    match: (u: string) =>
      u.includes("/api/admin/templates") &&
      !u.includes("/fields") &&
      !u.includes("/milestones") &&
      !u.match(/\/api\/admin\/templates\/[^/?]+(?:\?|$)/),
    respond: () =>
      jsonResponse({
        items: items.map((t) => ({
          id: t.id,
          name: "T",
          department_id: DEPT_ID,
          client_id: CLIENT_ID,
          discipline_id: DISCIPLINE_ID,
          created_at: "2026-05-19T00:00:00Z",
          updated_at: "2026-05-19T00:00:00Z",
          deleted_at: null,
        })),
        total: items.length,
        limit: 200,
        offset: 0,
      }),
  }
}

function templateChildStubs(tid: string) {
  return [
    {
      match: (u: string) => u.includes(`/api/admin/templates/${tid}/fields`),
      respond: () => jsonResponse({ items: [], total: 0 }),
    },
    {
      match: (u: string) =>
        u.includes(`/api/admin/templates/${tid}/milestones`),
      respond: () => jsonResponse({ items: [], total: 0 }),
    },
  ]
}

describe("ProjectsViewPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("shows the empty state when no template_id is in the URL", async () => {
    stubFetchByRoute([
      ...baseSupportStubs,
      templateListStub([]),
    ])
    renderWithProviders(<App />, { route: "/projects/view" })

    await waitFor(() => {
      expect(
        screen.getByText(/Pick a template from the dropdown/i),
      ).toBeInTheDocument()
    })
  })

  it("renders the default starter columns when prefs are absent", async () => {
    stubFetchByRoute([
      ...baseSupportStubs,
      templateListStub([{ id: TEMPLATE_ID }]),
      ...templateChildStubs(TEMPLATE_ID),
      {
        match: (u: string) =>
          u.includes(`/api/projects/view/${TEMPLATE_ID}/columns`),
        respond: () => new Response("", { status: 404 }),
      },
      {
        match: (u: string) =>
          u.includes("/api/projects") &&
          !u.includes("/view/") &&
          !u.includes("/dashboard"),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 15, offset: 0 }),
      },
    ])
    renderWithProviders(<App />, {
      route: `/projects/view?template_id=${TEMPLATE_ID}`,
    })

    await waitFor(() => {
      expect(screen.getByText("Project #")).toBeInTheDocument()
    })
    expect(screen.getByText("Title")).toBeInTheDocument()
    expect(screen.getByText("Status")).toBeInTheDocument()
  })

  it("opens the column picker when 'Columns' is clicked", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      ...baseSupportStubs,
      templateListStub([{ id: TEMPLATE_ID }]),
      ...templateChildStubs(TEMPLATE_ID),
      {
        match: (u: string) =>
          u.includes(`/api/projects/view/${TEMPLATE_ID}/columns`),
        respond: () => new Response("", { status: 404 }),
      },
      {
        match: (u: string) =>
          u.includes("/api/projects") &&
          !u.includes("/view/") &&
          !u.includes("/dashboard"),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 15, offset: 0 }),
      },
    ])
    renderWithProviders(<App />, {
      route: `/projects/view?template_id=${TEMPLATE_ID}`,
    })

    const btn = await screen.findByRole("button", {
      name: /open column picker/i,
    })
    await user.click(btn)
    await waitFor(() => {
      expect(
        screen.getByText(/Pick which columns to show/i),
      ).toBeInTheDocument()
    })
  })

  it("clicking the Title header triggers a PUT to /columns", async () => {
    const user = userEvent.setup()
    const putSpy = vi.fn(() =>
      jsonResponse({
        columns: ["builtin:project_number", "builtin:title", "builtin:lifecycle"],
        sort_key: "builtin:title",
        sort_direction: "asc",
      }),
    )
    stubFetchByRoute([
      ...baseSupportStubs,
      templateListStub([{ id: TEMPLATE_ID }]),
      ...templateChildStubs(TEMPLATE_ID),
      {
        match: (u: string, init?: RequestInit) =>
          u.includes(`/api/projects/view/${TEMPLATE_ID}/columns`) &&
          init?.method === "PUT",
        respond: () => putSpy(),
      },
      {
        match: (u: string) =>
          u.includes(`/api/projects/view/${TEMPLATE_ID}/columns`),
        respond: () => new Response("", { status: 404 }),
      },
      {
        match: (u: string) =>
          u.includes("/api/projects") &&
          !u.includes("/view/") &&
          !u.includes("/dashboard"),
        respond: () =>
          jsonResponse({ items: [], total: 0, limit: 15, offset: 0 }),
      },
    ])
    renderWithProviders(<App />, {
      route: `/projects/view?template_id=${TEMPLATE_ID}`,
    })

    const titleHeader = await screen.findByText("Title")
    await user.click(titleHeader)
    await waitFor(() => {
      expect(putSpy).toHaveBeenCalled()
    })
  })

  it("shows the template select on the empty state with multiple templates", async () => {
    stubFetchByRoute([
      ...baseSupportStubs,
      templateListStub([{ id: TEMPLATE_ID }, { id: TEMPLATE_ID_2 }]),
    ])
    renderWithProviders(<App />, { route: "/projects/view" })

    expect(
      await screen.findByText(/Pick a template from the dropdown/i),
    ).toBeInTheDocument()
    // The TemplateSelect trigger is rendered with the "Template" aria label.
    expect(
      await screen.findByRole("combobox", { name: /template/i }),
    ).toBeInTheDocument()
  })
})
