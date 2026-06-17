import { screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { BreakdownBlock } from "./BreakdownBlock"
import type { ViewBlock } from "@/api/views"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const block = (config: ViewBlock["config"]): ViewBlock => ({
  id: "b1",
  view_id: "v1",
  block_type: "breakdown",
  title: "Region breakdown",
  order_index: 0,
  width: 4,
  accent: "indigo",
  config,
})

const CFG = {
  group_by: "f-sel",
  columns: [
    { label: "Projects", metric: { entity: "project", aggregation: "count" } },
    {
      label: "Budget",
      metric: { entity: "project", aggregation: "sum", target_field: "f-num" },
      money: true,
    },
  ],
}

describe("BreakdownBlock", () => {
  it("unconfigured: shows the configure prompt", () => {
    renderWithProviders(
      <BreakdownBlock viewId="v1" block={block(null)} onConfigure={() => {}} />,
    )
    expect(
      screen.getByRole("button", { name: /configure/i }),
    ).toBeInTheDocument()
  })

  it("renders column headers and group rows with per-column money formatting", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.includes("/api/views/v1/blocks/b1/data"),
        respond: () =>
          jsonResponse({
            kind: "breakdown",
            columns: ["Projects", "Budget"],
            money: [false, true],
            rows: [
              { label: "North", cells: ["2", "350000"], is_other: false },
              { label: "South", cells: ["1", null], is_other: false },
              { label: "Other", cells: ["3", "9000"], is_other: true },
            ],
          }),
      },
    ])
    renderWithProviders(
      <BreakdownBlock viewId="v1" block={block(CFG)} onConfigure={() => {}} />,
    )
    await waitFor(() => expect(screen.getByText("North")).toBeInTheDocument())
    // headers
    expect(
      screen.getByRole("columnheader", { name: "Projects" }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("columnheader", { name: "Budget" }),
    ).toBeInTheDocument()
    // money column formats with $, count column does not
    expect(screen.getByText("$350,000")).toBeInTheDocument()
    expect(screen.getByText("2")).toBeInTheDocument()
    // null cell renders an em dash
    expect(screen.getByText("—")).toBeInTheDocument()
    // shared synthetic tail row present
    expect(screen.getByText("Other")).toBeInTheDocument()
  })
})
