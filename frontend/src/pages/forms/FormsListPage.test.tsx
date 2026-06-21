import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FormsListPage } from "./FormsListPage"
import { TopbarProvider } from "@/components/topbar/TopbarContext"
import { jsonResponse, stubFetchByRoute } from "@/test/test-utils"

const EDITOR = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "editor@example.com",
  display_name: "Editor",
  roles: ["project_editor"],
  accessible_department_ids: ["aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
}

const VIEWER = {
  id: "33333333-3333-3333-3333-333333333333",
  email: "viewer@example.com",
  display_name: "Viewer",
  roles: ["viewer"],
  accessible_department_ids: ["aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
}

const DEPT_ID = "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa"

const ACTIVE_FORM = {
  id: "form1111-1111-1111-1111-111111111111",
  department_id: DEPT_ID,
  name: "Project Intake Form",
  target_entity: null,
  status: "active",
  updated_at: "2026-06-01T10:00:00Z",
}

const DRAFT_FORM = {
  id: "form2222-2222-2222-2222-222222222222",
  department_id: DEPT_ID,
  name: "COR Review Draft",
  target_entity: "cor",
  status: "draft",
  updated_at: "2026-06-10T08:00:00Z",
}

const FORMS_RESPONSE = {
  items: [ACTIVE_FORM, DRAFT_FORM],
  total: 2,
}

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <TopbarProvider>
          <FormsListPage />
        </TopbarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("FormsListPage", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders both forms (active + draft) for an editor", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(EDITOR),
      },
      {
        match: (u) => u.includes("/api/auth/me/departments"),
        respond: () =>
          jsonResponse([{ id: DEPT_ID, code: "DIV1", name: "Division 1" }]),
      },
      {
        match: (u) => u.includes("/api/forms"),
        respond: () => jsonResponse(FORMS_RESPONSE),
      },
    ])

    setup()

    await waitFor(() => {
      expect(screen.getByText("Project Intake Form")).toBeInTheDocument()
    })
    expect(screen.getByText("COR Review Draft")).toBeInTheDocument()
  })

  it("filters the list via the search box", async () => {
    const user = userEvent.setup()
    stubFetchByRoute([
      { match: (u) => u.endsWith("/api/auth/me"), respond: () => jsonResponse(EDITOR) },
      {
        match: (u) => u.includes("/api/auth/me/departments"),
        respond: () => jsonResponse([{ id: DEPT_ID, code: "DIV1", name: "Division 1" }]),
      },
      { match: (u) => u.includes("/api/forms"), respond: () => jsonResponse(FORMS_RESPONSE) },
    ])

    setup()
    await waitFor(() => expect(screen.getByText("Project Intake Form")).toBeInTheDocument())

    await user.type(screen.getByLabelText("Search forms"), "intake")
    expect(screen.getByText("Project Intake Form")).toBeInTheDocument()
    expect(screen.queryByText("COR Review Draft")).not.toBeInTheDocument()

    // A query matching nothing shows the empty-state message.
    await user.clear(screen.getByLabelText("Search forms"))
    await user.type(screen.getByLabelText("Search forms"), "zzz")
    expect(screen.getByText(/No forms match/i)).toBeInTheDocument()
  })

  it("shows status badges for each form", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(EDITOR),
      },
      {
        match: (u) => u.includes("/api/auth/me/departments"),
        respond: () =>
          jsonResponse([{ id: DEPT_ID, code: "DIV1", name: "Division 1" }]),
      },
      {
        match: (u) => u.includes("/api/forms"),
        respond: () => jsonResponse(FORMS_RESPONSE),
      },
    ])

    setup()

    await waitFor(() => {
      expect(screen.getByText("Active")).toBeInTheDocument()
    })
    expect(screen.getByText("Draft")).toBeInTheDocument()
  })

  it("shows the 'New form' button for a project_editor", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(EDITOR),
      },
      {
        match: (u) => u.includes("/api/auth/me/departments"),
        respond: () =>
          jsonResponse([{ id: DEPT_ID, code: "DIV1", name: "Division 1" }]),
      },
      {
        match: (u) => u.includes("/api/forms"),
        respond: () => jsonResponse(FORMS_RESPONSE),
      },
    ])

    setup()

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /new form/i })).toBeInTheDocument()
    })
  })

  it("hides the 'New form' button for a viewer", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(VIEWER),
      },
      {
        match: (u) => u.includes("/api/auth/me/departments"),
        respond: () =>
          jsonResponse([{ id: DEPT_ID, code: "DIV1", name: "Division 1" }]),
      },
      {
        match: (u) => u.includes("/api/forms"),
        respond: () => jsonResponse(FORMS_RESPONSE),
      },
    ])

    setup()

    await waitFor(() => {
      // Wait for auth to resolve (forms list rendered)
      expect(screen.getByText("Project Intake Form")).toBeInTheDocument()
    })
    expect(
      screen.queryByRole("button", { name: /new form/i }),
    ).not.toBeInTheDocument()
  })

  it("shows empty state when there are no forms", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.endsWith("/api/auth/me"),
        respond: () => jsonResponse(EDITOR),
      },
      {
        match: (u) => u.includes("/api/auth/me/departments"),
        respond: () =>
          jsonResponse([{ id: DEPT_ID, code: "DIV1", name: "Division 1" }]),
      },
      {
        match: (u) => u.includes("/api/forms"),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
    ])

    setup()

    await waitFor(() => {
      expect(screen.getByText(/no forms yet/i)).toBeInTheDocument()
    })
  })
})
