import { screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import App from "@/App"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const EDITOR = {
  id: "eeee1111-eeee-eeee-eeee-eeeeeeeeeeee",
  email: "editor@example.com",
  display_name: "Editor",
  roles: ["project_editor"],
  accessible_department_ids: null,
}

const DEPTS = [
  { id: "d1", code: "ENG", name: "Engineering" },
  { id: "d2", code: "OPS", name: "Operations" },
]

const FORMS = [
  {
    id: "f1",
    department_id: "d1",
    name: "Intake form",
    target_entity: "intake",
    status: "active",
    updated_at: "2026-06-01T00:00:00Z",
    pending_count: 0,
  },
  {
    id: "f2",
    department_id: "d2",
    name: "Ops checklist",
    target_entity: "cor",
    status: "draft",
    updated_at: "2026-06-02T00:00:00Z",
    pending_count: 0,
  },
]

function stubs() {
  stubFetchByRoute([
    {
      match: (u) => u.endsWith("/api/auth/me"),
      respond: () => jsonResponse(EDITOR),
    },
    {
      match: (u) => u.includes("/api/auth/me/departments"),
      respond: () => jsonResponse(DEPTS),
    },
    {
      match: (u) => /\/api\/forms(\?|$)/.test(u),
      respond: () => jsonResponse({ items: FORMS, total: FORMS.length }),
    },
    {
      match: () => true,
      respond: () =>
        jsonResponse({ items: [], total: 0, limit: 50, offset: 0 }),
    },
  ])
}

describe("AppLayout forms nav grouping", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("groups forms under their department code", async () => {
    stubs()
    renderWithProviders(<App />, { route: "/" })

    await waitFor(() => {
      expect(screen.getByText("Intake form")).toBeInTheDocument()
    })
    // Each department renders a code sub-header.
    expect(screen.getByText("ENG")).toBeInTheDocument()
    expect(screen.getByText("OPS")).toBeInTheDocument()
    // Both forms render under their groups.
    expect(screen.getByText("Ops checklist")).toBeInTheDocument()
  })
})
