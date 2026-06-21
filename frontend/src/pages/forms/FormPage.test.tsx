import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter, Route, Routes } from "react-router"
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

// Mount through the real route so the `:fid` param wiring is exercised —
// this is the regression guard for the "No form ID in URL." bug, where
// FormPage read `:id` while App.tsx defines the route as `:fid`.
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

describe("FormPage routing", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it("resolves the :fid route param and renders the form (no 'No form ID' error)", async () => {
    stubFetchByRoute([
      { match: (u) => u.endsWith("/api/auth/me"), respond: () => jsonResponse(EDITOR) },
      {
        match: (u) => u.includes(`/api/forms/${FORM.id}`),
        respond: () => jsonResponse(FORM),
      },
      { match: (u) => u.includes("/api/forms/targets"), respond: () => jsonResponse({ targets: { cor: { label: "Change order", requires_project: true, fields: [] } }, field_type_map: {} }) },
      { match: (u) => u.includes("/submissions"), respond: () => jsonResponse({ items: [], total: 0 }) },
    ])

    setup()

    // The tab switcher renders only when the form id resolved.
    await waitFor(() => {
      expect(screen.getByRole("tab", { name: /fill out/i })).toBeInTheDocument()
    })
    expect(screen.queryByText("No form ID in URL.")).not.toBeInTheDocument()
  })

  it("lets an editor activate a draft form (PATCHes status=active)", async () => {
    const draft = { ...FORM, status: "draft" }
    const fetchMock = stubFetchByRoute([
      { match: (u) => u.endsWith("/api/auth/me"), respond: () => jsonResponse(EDITOR) },
      {
        match: (u) => u.includes(`/api/forms/${FORM.id}`) && !u.includes("/fields") && !u.includes("/submissions") && !u.includes("/targets"),
        respond: () => jsonResponse(draft),
      },
      { match: (u) => u.includes("/api/forms/targets"), respond: () => jsonResponse({ targets: { cor: { label: "Change order", requires_project: true, fields: [] } }, field_type_map: {} }) },
      { match: (u) => u.includes("/submissions"), respond: () => jsonResponse({ items: [], total: 0 }) },
    ])

    setup()

    const activate = await screen.findByRole("button", { name: /activate/i })
    await userEvent.click(activate)

    await waitFor(() => {
      const patch = fetchMock.mock.calls.find(
        ([u, init]) =>
          String(u).includes(`/api/forms/${FORM.id}`) && init?.method === "PATCH",
      )
      const init = patch?.[1]
      expect(init?.body).toBeTruthy()
      expect(JSON.parse(init!.body as string)).toEqual({ status: "active" })
    })
  })

  it("lets an editor delete the form (confirmed) → DELETE request", async () => {
    const fetchMock = stubFetchByRoute([
      { match: (u) => u.endsWith("/api/auth/me"), respond: () => jsonResponse(EDITOR) },
      { match: (u) => u.includes("/api/forms/targets"), respond: () => jsonResponse({ targets: { cor: { label: "Change order", requires_project: true, fields: [] } }, field_type_map: {} }) },
      { match: (u) => u.includes("/submissions"), respond: () => jsonResponse({ items: [], total: 0 }) },
      {
        match: (u) => u.includes(`/api/forms/${FORM.id}`),
        respond: (_u, init) =>
          init?.method === "DELETE"
            ? new Response(null, { status: 204 })
            : jsonResponse(FORM),
      },
    ])

    setup()

    // Delete lives in the kebab menu — open it, click the item, then
    // confirm in the AlertDialog.
    await userEvent.click(
      await screen.findByRole("button", { name: /form actions/i }),
    )
    await userEvent.click(
      await screen.findByRole("menuitem", { name: /delete form/i }),
    )
    await userEvent.click(
      await screen.findByRole("button", { name: /^delete$/i }),
    )

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u, init]) =>
          String(u).includes(`/api/forms/${FORM.id}`) && init?.method === "DELETE",
      )
      expect(call).toBeTruthy()
    })
  })
})
