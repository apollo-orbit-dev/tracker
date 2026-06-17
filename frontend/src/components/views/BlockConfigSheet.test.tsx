// Phase 7.8 — tests for the riskiest BlockConfigSheet client logic
// (7.7 review amendment): the breakdown column-1 cascade reset (+ its
// transient notice), Save gating on group-by validity, and
// pct_of_total being absent from grouped aggregation options. All of
// this is UX mirroring only — validate_block_config server-side stays
// the boundary validator.
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import { BlockConfigSheet } from "./BlockConfigSheet"
import type { ViewBlock } from "@/api/views"
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
      respond: () => jsonResponse({ value: "3" }),
    },
    { match: (u) => u.includes("/fields"), respond: () => jsonResponse(FIELDS) },
    {
      match: (u) => u.includes("/api/admin/templates"),
      respond: () => jsonResponse(TEMPLATES),
    },
    // Phase 7.14 — ScopePicker DCD sources + the block PATCH save path.
    { match: (u) => u.includes("/me/departments"), respond: () => jsonResponse(DEPTS) },
    { match: (u) => u.includes("/api/admin/clients"), respond: () => jsonResponse(CLIENTS) },
    { match: (u) => u.includes("/api/admin/disciplines"), respond: () => jsonResponse(DISCS) },
    {
      match: (u, init) =>
        u.includes("/blocks/") && (init?.method ?? "GET") === "PATCH",
      respond: () => jsonResponse({}),
    },
  ])
}

const block = (
  block_type: ViewBlock["block_type"],
  config: ViewBlock["config"],
): ViewBlock => ({
  id: "b1",
  view_id: "v1",
  block_type,
  title: null,
  order_index: 0,
  width: 2,
  accent: "indigo",
  config,
})

const COUNT_T1 = {
  entity: "project",
  aggregation: "count",
  template_id: "t1",
  target_field: null,
  conditions: { combinator: "and" as const, items: [] },
}

describe("BlockConfigSheet (chart/breakdown logic)", () => {
  it("grouped contexts do not offer pct_of_total as an aggregation", async () => {
    stubs()
    renderWithProviders(
      <BlockConfigSheet
        viewId="v1"
        block={block("chart", null)}
        onClose={() => {}}
      />,
    )
    const user = userEvent.setup()
    await user.click(await screen.findByLabelText("Aggregation"))
    expect(
      await screen.findByRole("option", { name: "Count" }),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("option", { name: "% of total" }),
    ).not.toBeInTheDocument()
  })

  it("Save stays disabled while the group-by does not resolve against the current scope", async () => {
    stubs()
    // Stale group_by (not among t1's groupable fields) -> disabled.
    renderWithProviders(
      <BlockConfigSheet
        viewId="v1"
        block={block("chart", {
          metric: COUNT_T1,
          group_by: "f-gone",
          kind: "bar",
        })}
        onClose={() => {}}
      />,
    )
    // Wait for fields to load (Region appears in the group-by select),
    // then confirm the stale ref still gates Save.
    await screen.findByLabelText("Group by")
    await waitFor(() =>
      expect(screen.getByText(/finish the metric and pick a group-by/i))
        .toBeInTheDocument(),
    )
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled()
  })

  it("Save enables once the group-by resolves and the metric is complete", async () => {
    stubs()
    renderWithProviders(
      <BlockConfigSheet
        viewId="v1"
        block={block("chart", {
          metric: COUNT_T1,
          group_by: "f-sel",
          kind: "bar",
        })}
        onClose={() => {}}
      />,
    )
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Save" })).toBeEnabled(),
    )
  })

  it("a column-1 entity change resets columns 2+ and shows the cascade notice", async () => {
    stubs()
    renderWithProviders(
      <BlockConfigSheet
        viewId="v1"
        block={block("breakdown", {
          group_by: "f-sel",
          columns: [
            { label: "Projects", metric: COUNT_T1, money: false },
            {
              label: "Missing kickoff",
              metric: {
                ...COUNT_T1,
                conditions: {
                  combinator: "and",
                  items: [{ field: "f-bool", op: "is_false" }],
                },
              },
              money: false,
            },
          ],
        })}
        onClose={() => {}}
      />,
    )
    const user = userEvent.setup()
    // Expand column 2: its inherited condition row is there.
    await user.click(
      await screen.findByRole("button", { name: /expand column 2 metric/i }),
    )
    expect(
      await screen.findByRole("button", { name: /remove condition 1/i }),
    ).toBeInTheDocument()

    // Change column 1's entity -> columns 2+ reset, notice appears.
    await user.click(screen.getByLabelText("Entity"))
    await user.click(
      await screen.findByRole("option", { name: "Change orders" }),
    )
    expect(
      await screen.findByText(
        /Changing the first column's entity or template reset the other columns' metrics/,
      ),
    ).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /remove condition 1/i }),
    ).not.toBeInTheDocument()
  })

  it("propagates column-1 scope to all columns, preserving their aggregation (Phase 7.14)", async () => {
    const spy = stubs()
    // No template -> DCD controls render; column 2 has a distinct
    // aggregation (count_distinct) so we can prove it is preserved.
    const noTemplate = {
      entity: "project",
      aggregation: "count" as const,
      template_id: null,
      target_field: null,
      conditions: { combinator: "and" as const, items: [] },
    }
    renderWithProviders(
      <BlockConfigSheet
        viewId="v1"
        block={block("breakdown", {
          group_by: "lifecycle_state",
          columns: [
            { label: "Projects", metric: noTemplate, money: false },
            {
              label: "Distinct",
              metric: { ...noTemplate, aggregation: "count_distinct", target_field: "title" },
              money: false,
            },
          ],
        })}
        onClose={() => {}}
      />,
    )
    const user = userEvent.setup()
    // Column 1's Department lives in the first builder's ScopePicker.
    await user.click(await screen.findByLabelText(/department/i))
    await user.click(await screen.findByRole("option", { name: /DIV1/i }))

    const saveBtn = screen.getByRole("button", { name: "Save" })
    await waitFor(() => expect(saveBtn).toBeEnabled())
    await user.click(saveBtn)

    const patchCall = spy.mock.calls.find(
      ([u, init]) =>
        String(u).includes("/blocks/") &&
        (init as RequestInit)?.method === "PATCH",
    )
    expect(patchCall).toBeTruthy()
    const body = JSON.parse(String((patchCall![1] as RequestInit).body))
    expect(body.config.columns[1].metric.scope.department_id).toBe("d1")
    expect(body.config.columns[1].metric.aggregation).toBe("count_distinct")
  })
})
