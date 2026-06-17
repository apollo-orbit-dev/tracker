import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { MetricBuilder } from "./MetricBuilder"
import { fieldOptionsFor } from "./metricCatalog"
import type { FieldDef } from "@/api/templates"
import type { MetricDefinition } from "@/api/views"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const FIELDS = {
  items: [
    { id: "f-bool", name: "Kickoff held", field_type: "boolean", options: null },
    {
      id: "f-sel",
      name: "Region",
      field_type: "single_select",
      options: { choices: ["North", "South"] },
    },
    { id: "f-date", name: "Due date", field_type: "date", options: null },
  ],
}
const TEMPLATES = { items: [{ id: "t1", name: "DIV1 / CON / Design" }] }
const DEPTS = [{ id: "d1", code: "DIV1", name: "Dept 8" }]
const CLIENTS = { items: [{ id: "c1", code: "CON", name: "CON", department_id: "d1" }] }
const DISCS = { items: [{ id: "k1", code: "PC", name: "Design", department_id: "d1" }] }

function stubs() {
  return stubFetchByRoute([
    {
      match: (u) => u.includes("/api/metrics/eval"),
      respond: () => jsonResponse({ value: "14" }),
    },
    {
      match: (u) => u.includes("/fields"),
      respond: () => jsonResponse(FIELDS),
    },
    {
      match: (u) => u.includes("/api/admin/templates"),
      respond: () => jsonResponse(TEMPLATES),
    },
    // Phase 7.14 — ScopePicker DCD sources (/me/departments matches the
    // real /api/auth/me/departments path).
    { match: (u) => u.includes("/me/departments"), respond: () => jsonResponse(DEPTS) },
    { match: (u) => u.includes("/api/admin/clients"), respond: () => jsonResponse(CLIENTS) },
    { match: (u) => u.includes("/api/admin/disciplines"), respond: () => jsonResponse(DISCS) },
  ])
}

const BASE: MetricDefinition = {
  entity: "project",
  aggregation: "count",
  template_id: "t1",
  conditions: {
    combinator: "and",
    items: [{ field: "f-bool", op: "is_false" }],
  },
}

// Phase 7.18 — a draft with one condition on a DATE field, used to
// assert the two new no-value date ops (last_month / on_or_before_today).
const DATE_BASE: MetricDefinition = {
  entity: "project",
  aggregation: "count",
  template_id: "t1",
  conditions: {
    combinator: "and",
    items: [{ field: "f-date", op: "last_month" }],
  },
}

describe("fieldOptionsFor", () => {
  it("maps conditional boolean field types to kind boolean (Phase 7.4.1)", () => {
    const fd = (id: string, name: string, field_type: string): FieldDef => ({
      id,
      template_id: "t1",
      name,
      field_type,
      required: false,
      is_project_metric: false,
      order_index: 0,
      options: null,
      created_at: "",
      updated_at: "",
    })
    const opts = fieldOptionsFor("project", [
      fd("f-bool", "Kickoff held", "boolean"),
      fd("f-cond", "NTP received", "boolean_conditional_text"),
    ])
    expect(opts).toContainEqual({
      ref: "f-bool",
      label: "Kickoff held",
      kind: "boolean",
      choices: null,
    })
    expect(opts).toContainEqual({
      ref: "f-cond",
      label: "NTP received",
      kind: "boolean",
      choices: null,
    })
  })
})

describe("MetricBuilder", () => {
  it("shows ops appropriate to the condition field's type", async () => {
    stubs()
    renderWithProviders(<MetricBuilder value={BASE} onChange={() => {}} />)
    await waitFor(() =>
      expect(screen.getByText(/is false/i)).toBeInTheDocument(),
    )
    // boolean field offers boolean ops only
    expect(screen.queryByText(/contains/i)).not.toBeInTheDocument()
  })

  it("live preview posts to /api/metrics/eval and shows the value", async () => {
    const spy = stubs()
    renderWithProviders(<MetricBuilder value={BASE} onChange={() => {}} />)
    await waitFor(() => expect(screen.getByText("14")).toBeInTheDocument())
    const evalCall = spy.mock.calls.find(([u]) =>
      String(u).includes("/api/metrics/eval"),
    )
    expect(JSON.parse(String((evalCall![1] as RequestInit).body)).entity).toBe(
      "project",
    )
  })

  it("shows the validated ✓ badge after a successful eval, not on error (Phase 7.8)", async () => {
    stubs()
    renderWithProviders(<MetricBuilder value={BASE} onChange={() => {}} />)
    await waitFor(() => expect(screen.getByText("14")).toBeInTheDocument())
    expect(screen.getByText(/validated ✓/)).toBeInTheDocument()

    // A failing eval must not carry the badge.
    stubFetchByRoute([
      {
        match: (u) => u.includes("/api/metrics/eval"),
        respond: () => jsonResponse({ detail: ["nope"] }, 422),
      },
      { match: (u) => u.includes("/fields"), respond: () => jsonResponse(FIELDS) },
      {
        match: (u) => u.includes("/api/admin/templates"),
        respond: () => jsonResponse(TEMPLATES),
      },
    ])
    renderWithProviders(<MetricBuilder value={BASE} onChange={() => {}} />)
    await waitFor(() => expect(screen.getAllByText(/nope/).length).toBe(1))
    // Exactly one badge on the page — the first (successful) builder's.
    expect(screen.getAllByText(/validated ✓/)).toHaveLength(1)
  })

  it("add condition appends a row", async () => {
    stubs()
    const onChange = vi.fn()
    renderWithProviders(<MetricBuilder value={BASE} onChange={onChange} />)
    await waitFor(() => screen.getByText(/add condition/i))
    await userEvent.click(screen.getByText(/add condition/i))
    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls.at(-1)![0] as MetricDefinition
    expect(next.conditions!.items).toHaveLength(2)
  })

  it("offers last_month / on_or_before_today date ops with no value input (Phase 7.18)", async () => {
    stubs()
    renderWithProviders(<MetricBuilder value={DATE_BASE} onChange={() => {}} />)
    // last_month is the selected op — its label shows in the trigger.
    await waitFor(() => screen.getByText(/last month/i))
    // It carries no value, so no date/days input renders for the condition.
    expect(screen.queryByLabelText(/^Date$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Days$/i)).not.toBeInTheDocument()
    // Open the operator dropdown to confirm both new presets are offered.
    await userEvent.click(
      screen.getByRole("combobox", { name: /condition 1 operator/i }),
    )
    expect(
      await screen.findByRole("option", { name: /^≤ today$/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("option", { name: /^last month$/i }),
    ).toBeInTheDocument()
  })

  it("project metric: hides DCD when a template is selected, shows lifecycle", async () => {
    stubs()
    // BASE has template_id: "t1".
    renderWithProviders(<MetricBuilder value={BASE} onChange={() => {}} />)
    await waitFor(() => screen.getByLabelText(/aggregation/i))
    expect(screen.queryByLabelText(/department/i)).not.toBeInTheDocument()
    expect(screen.getByLabelText(/lifecycle/i)).toBeInTheDocument()
  })

  it("project metric: shows DCD when no template selected", async () => {
    stubs()
    const noTemplate = {
      ...BASE,
      template_id: null,
      conditions: { combinator: "and" as const, items: [] },
    }
    renderWithProviders(<MetricBuilder value={noTemplate} onChange={() => {}} />)
    await waitFor(() => screen.getByLabelText(/department/i))
    expect(screen.getByLabelText(/department/i)).toBeInTheDocument()
  })

  it("selecting a template clears DCD scope", async () => {
    stubs()
    const onChange = vi.fn()
    const scoped = {
      ...BASE,
      template_id: null,
      conditions: { combinator: "and" as const, items: [] },
      scope: { department_id: "d1", client_id: "c1", discipline_id: "k1" },
    }
    renderWithProviders(<MetricBuilder value={scoped} onChange={onChange} />)
    await waitFor(() => screen.getByLabelText(/template/i))
    await userEvent.click(screen.getByLabelText(/template/i))
    await userEvent.click(await screen.findByRole("option", { name: /DIV1 \/ CON \/ Design/i }))
    const next = onChange.mock.calls.at(-1)![0] as MetricDefinition
    expect(next.template_id).toBe("t1")
    expect(next.scope?.department_id ?? null).toBeNull()
    expect(next.scope?.client_id ?? null).toBeNull()
    expect(next.scope?.discipline_id ?? null).toBeNull()
  })
})
