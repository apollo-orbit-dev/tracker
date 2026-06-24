import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes, useNavigate } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FormPage } from "./FormPage"
import { TopbarProvider } from "@/components/topbar/TopbarContext"
import { jsonResponse, stubFetchByRoute } from "@/test/test-utils"

const EDITOR = {
  id: "22222222-2222-2222-2222-222222222222",
  email: "editor@example.com",
  display_name: "Editor",
  roles: ["project_editor"],
  accessible_department_ids: ["aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa"],
}

const FORM = {
  id: "form1111-1111-1111-1111-111111111111",
  department_id: "aaaa1111-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
  name: "COR Request",
  description: null,
  target_entity: "cor",
  status: "active",
  created_by: EDITOR.id,
  created_at: "2026-06-01T10:00:00Z",
  updated_at: "2026-06-01T10:00:00Z",
  fields: [],
}

function stubsFor(status: "active" | "draft") {
  return stubFetchByRoute([
    { match: (u) => u.endsWith("/api/auth/me"), respond: () => jsonResponse(EDITOR) },
    { match: (u) => u.includes("/api/forms/targets"), respond: () => jsonResponse({ targets: { cor: { label: "Change order", requires_project: true, fields: [] } }, field_type_map: {} }) },
    { match: (u) => u.includes("/submissions"), respond: () => jsonResponse({ items: [], total: 0 }) },
    {
      match: (u) => u.includes(`/api/forms/${FORM.id}`),
      respond: () => jsonResponse({ ...FORM, status }),
    },
  ])
}

function setup() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/forms/${FORM.id}`]}>
        <TopbarProvider>
          <Routes>
            <Route path="/forms/:fid" element={<FormPage />} />
          </Routes>
        </TopbarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

// ── Cross-form navigation harness ───────────────────────────────────────────
// Navigating between forms changes the :fid param without remounting FormPage,
// so the default-tab logic must re-seed per form id (regression for the
// "swapping to a published form still lands me in Build" bug).

const F1 = "f1111111-1111-1111-1111-111111111111" // published/active
const F2 = "f2222222-2222-2222-2222-222222222222" // draft

function navStubs() {
  return stubFetchByRoute([
    { match: (u) => u.endsWith("/api/auth/me"), respond: () => jsonResponse(EDITOR) },
    { match: (u) => u.includes("/api/forms/targets"), respond: () => jsonResponse({ targets: { cor: { label: "Change order", requires_project: true, fields: [] } }, field_type_map: {} }) },
    { match: (u) => u.includes("/submissions"), respond: () => jsonResponse({ items: [], total: 0 }) },
    {
      match: (u) => u.endsWith(`/api/forms/${F1}`),
      respond: () => jsonResponse({ ...FORM, id: F1, name: "Published Form", status: "active" }),
    },
    {
      match: (u) => u.endsWith(`/api/forms/${F2}`),
      respond: () => jsonResponse({ ...FORM, id: F2, name: "Draft Form", status: "draft" }),
    },
    // BuildMode re-fetches the form by id with a query string; catch those too.
    {
      match: (u) => u.includes(`/api/forms/${F1}`),
      respond: () => jsonResponse({ ...FORM, id: F1, name: "Published Form", status: "active" }),
    },
    {
      match: (u) => u.includes(`/api/forms/${F2}`),
      respond: () => jsonResponse({ ...FORM, id: F2, name: "Draft Form", status: "draft" }),
    },
  ])
}

function GoButtons() {
  const nav = useNavigate()
  return (
    <>
      <button onClick={() => nav(`/forms/${F1}`)}>go-published</button>
      <button onClick={() => nav(`/forms/${F2}`)}>go-draft</button>
    </>
  )
}

function setupNav(start: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[`/forms/${start}`]}>
        <TopbarProvider>
          <Routes>
            <Route
              path="/forms/:fid"
              element={
                <>
                  <GoButtons />
                  <FormPage />
                </>
              }
            />
          </Routes>
        </TopbarProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("FormPage default tab", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it("defaults an editor to Fill out on a published (active) form", async () => {
    stubsFor("active")
    setup()
    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: /fill out/i }),
      ).toHaveAttribute("data-state", "active")
    })
  })

  it("defaults an editor to Build on a draft form", async () => {
    stubsFor("draft")
    setup()
    await waitFor(() => {
      expect(
        screen.getByRole("tab", { name: /build/i }),
      ).toHaveAttribute("data-state", "active")
    })
  })

  it("re-seeds to Build when navigating from a published to a draft form", async () => {
    navStubs()
    setupNav(F1)
    await waitFor(() =>
      expect(
        screen.getByRole("tab", { name: /fill out/i }),
      ).toHaveAttribute("data-state", "active"),
    )
    await userEvent.click(screen.getByRole("button", { name: "go-draft" }))
    await waitFor(() =>
      expect(
        screen.getByRole("tab", { name: /build/i }),
      ).toHaveAttribute("data-state", "active"),
    )
  })

  it("re-seeds to Fill on a published form even after a manual Build on it earlier", async () => {
    navStubs()
    setupNav(F1)
    // Published form defaults to Fill; user manually switches to Build.
    const buildTab = await screen.findByRole("tab", { name: /build/i })
    await waitFor(() =>
      expect(
        screen.getByRole("tab", { name: /fill out/i }),
      ).toHaveAttribute("data-state", "active"),
    )
    await userEvent.click(buildTab)
    expect(buildTab).toHaveAttribute("data-state", "active")
    // Navigate away to the draft, then back to the published form: the manual
    // Build must NOT persist — the published form re-seeds to Fill.
    await userEvent.click(screen.getByRole("button", { name: "go-draft" }))
    await waitFor(() =>
      expect(
        screen.getByRole("tab", { name: /build/i }),
      ).toHaveAttribute("data-state", "active"),
    )
    await userEvent.click(screen.getByRole("button", { name: "go-published" }))
    await waitFor(() =>
      expect(
        screen.getByRole("tab", { name: /fill out/i }),
      ).toHaveAttribute("data-state", "active"),
    )
  })

  it("does not override a manual tab switch on a re-render", async () => {
    stubsFor("active")
    setup()
    // Default lands on Fill out (active form); the user clicks Build.
    const buildTab = await screen.findByRole("tab", { name: /build/i })
    await waitFor(() =>
      expect(
        screen.getByRole("tab", { name: /fill out/i }),
      ).toHaveAttribute("data-state", "active"),
    )
    await userEvent.click(buildTab)
    expect(buildTab).toHaveAttribute("data-state", "active")
    // Force a re-render of the same instance (mimics a background refetch
    // settling). The seed effect must not reset the tab back to Fill out.
    await userEvent.tab()
    expect(
      screen.getByRole("tab", { name: /build/i }),
    ).toHaveAttribute("data-state", "active")
  })
})
