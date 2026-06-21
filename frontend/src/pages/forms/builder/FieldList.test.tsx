/**
 * FieldList — the mapped-field "binding chip" shows the target's human label,
 * not the raw target_key. For intake forms the key is a template custom-field
 * def id (a UUID), which must resolve to the def name (#21.4 regression).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { FieldList } from "./FieldList"
import { jsonResponse, stubFetchByRoute } from "@/test/test-utils"
import type { Form, FormField } from "@/api/forms"

const TEMPLATE_ID = "tmpl-0001-0001-0001-000000000001"
const DEF_ID = "def-0001-0001-0001-000000000001"

const COR_TARGETS = {
  targets: {
    cor: {
      label: "Change order",
      requires_project: true,
      fields: [{ key: "description", label: "Description", type: "long_text" }],
    },
  },
  field_type_map: { long_text: "text", short_text: "text" },
}

const INTAKE_TARGETS = {
  targets: {
    intake: {
      label: "Project intake",
      requires_project: false,
      requires_template: true,
      fields: [{ key: "title", label: "Project title", type: "short_text" }],
    },
  },
  field_type_map: { long_text: "text", short_text: "text" },
}

function field(overrides: Partial<FormField>): FormField {
  return {
    id: "f1", form_id: "form1", label: "Field", field_type: "short_text",
    required: false, help_text: null, placeholder: null, options: null,
    order_index: 0, target_key: null, created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function makeForm(overrides: Partial<Form>): Form {
  return {
    id: "form1", department_id: "d1", name: "F", description: null,
    target_entity: "cor", target_template_id: null, status: "draft",
    created_by: "u1", created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z", fields: [], ...overrides,
  }
}

function renderList(form: Form, targets: unknown, defs?: unknown) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  stubFetchByRoute([
    { match: (u) => u.includes("/fields"), respond: () => jsonResponse(defs ?? { items: [], total: 0 }) },
    { match: (u) => u.includes("/api/forms/targets"), respond: () => jsonResponse(targets) },
  ])
  render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FieldList form={form} selectedFieldId={null} onSelectField={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("FieldList — binding chip label", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it("shows the registry label for a static target", async () => {
    renderList(
      makeForm({
        target_entity: "cor",
        fields: [field({ id: "f1", label: "Scope", target_key: "description" })],
      }),
      COR_TARGETS,
    )
    await waitFor(() => expect(screen.getByText("Description")).toBeInTheDocument())
    expect(screen.queryByText("description")).not.toBeInTheDocument()
  })

  it("resolves an intake custom-field def id to its name (not the UUID)", async () => {
    renderList(
      makeForm({
        target_entity: "intake",
        target_template_id: TEMPLATE_ID,
        // Field label differs from the def name so the wait targets the chip.
        fields: [field({ id: "f1", label: "Where", target_key: DEF_ID })],
      }),
      INTAKE_TARGETS,
      { items: [{ id: DEF_ID, template_id: TEMPLATE_ID, name: "Region", field_type: "short_text" }], total: 1 },
    )
    // The chip resolves the def id → "Region" (and the UUID is gone).
    await waitFor(() => expect(screen.getByText("Region")).toBeInTheDocument())
    expect(screen.queryByText(DEF_ID)).not.toBeInTheDocument()
  })
})
