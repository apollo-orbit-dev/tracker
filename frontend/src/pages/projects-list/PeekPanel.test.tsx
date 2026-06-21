import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { PeekPanel } from "./PeekPanel"
import type { Project } from "@/api/projects"
import { jsonResponse, stubFetchByRoute } from "@/test/test-utils"

vi.mock("sonner", () => ({ toast: { success: vi.fn() } }))

const project: Project = {
  id: "p1",
  project_number: "PRJ-001",
  client_project_number: null,
  title: "Acme Substation",
  template_id: "t1",
  lifecycle_state: "active",
  custom_field_values: {},
  created_by: "u1",
  created_at: "2026-06-01T12:00:00Z",
  updated_at: "2026-06-01T12:00:00Z",
  deleted_at: null,
  template_name: "Default",
  template_intersection: "Eng · Acme · Civil",
}

// PeekPanel fires three GETs: project detail, CORs, notes. Detail must NOT
// swallow the /cors or /notes sub-routes, so it matches last and excludes them.
function stubGets(notesItems: unknown[] = []) {
  return stubFetchByRoute([
    {
      match: (u, init) =>
        u.includes("/notes") && (init?.method ?? "GET") === "GET",
      respond: () =>
        jsonResponse({
          items: notesItems,
          total: notesItems.length,
          limit: 3,
          offset: 0,
        }),
    },
    {
      match: (u, init) => u.includes("/notes") && init?.method === "POST",
      respond: () =>
        jsonResponse({
          id: "n1",
          project_id: "p1",
          body: "hello",
          created_by: { id: "u1", email: "a@b.c", display_name: "Ann" },
          created_at: "2026-06-20T12:00:00Z",
          updated_at: "2026-06-20T12:00:00Z",
        }),
    },
    {
      match: (u) => u.includes("/cors"),
      respond: () => jsonResponse({ items: [], total: 0, limit: 50, offset: 0 }),
    },
    {
      match: (u) => u.includes("/api/projects/"),
      respond: () =>
        jsonResponse({
          ...project,
          milestones: [],
          valid_next_states: [],
          can_edit: true,
          can_manage_access: true,
          template_field_defs: [],
        }),
    },
  ])
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <PeekPanel project={project} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("PeekPanel quick-add note", () => {
  beforeEach(() => vi.clearAllMocks())

  it("hides the composer until the Add note button is clicked", async () => {
    stubGets()
    setup()
    await screen.findByText("Recent notes")

    expect(screen.queryByLabelText("New note")).not.toBeInTheDocument()

    await userEvent.click(screen.getByLabelText("Add note"))
    expect(screen.getByLabelText("New note")).toBeInTheDocument()
  })

  it("posts a trimmed note body and closes the composer", async () => {
    const fetchFn = stubGets()
    setup()
    await screen.findByText("Recent notes")

    await userEvent.click(screen.getByLabelText("Add note"))
    await userEvent.type(screen.getByLabelText("New note"), "  needs review  ")
    await userEvent.click(screen.getByRole("button", { name: "Post note" }))

    await waitFor(() => {
      const post = fetchFn.mock.calls.find(
        ([u, init]) =>
          String(u).includes("/notes") && init?.method === "POST",
      )
      const init = post?.[1]
      expect(init?.body).toBeTruthy()
      expect(JSON.parse(init!.body as string)).toEqual({
        body: "needs review",
      })
    })

    // Composer collapses again after a successful post.
    await waitFor(() =>
      expect(screen.queryByLabelText("New note")).not.toBeInTheDocument(),
    )
  })

  it("disables Post for an empty or whitespace-only draft", async () => {
    stubGets()
    setup()
    await screen.findByText("Recent notes")

    await userEvent.click(screen.getByLabelText("Add note"))
    const postBtn = screen.getByRole("button", { name: "Post note" })
    expect(postBtn).toBeDisabled()

    await userEvent.type(screen.getByLabelText("New note"), "   ")
    expect(postBtn).toBeDisabled()
  })
})
