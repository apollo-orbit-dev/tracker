import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { MetricCardBlock } from "./MetricCardBlock"
import type { ViewBlock } from "@/api/views"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const block = (config: ViewBlock["config"]): ViewBlock => ({
  id: "b1",
  view_id: "v1",
  block_type: "metric",
  title: "Missing kickoff",
  order_index: 0,
  width: 1,
  accent: "indigo",
  config,
})

const CFG = {
  metric: { entity: "project", aggregation: "count" },
  thresholds: { green: 3, amber: 6 },
}

describe("MetricCardBlock", () => {
  it("unconfigured: shows the configure prompt", () => {
    renderWithProviders(
      <MetricCardBlock
        viewId="v1"
        block={block(null)}
        onConfigure={() => {}}
        onDrill={() => {}}
      />,
    )
    expect(
      screen.getByRole("button", { name: /configure/i }),
    ).toBeInTheDocument()
  })

  it("renders the value with green threshold tone", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.includes("/api/views/v1/blocks/b1/data"),
        respond: () => jsonResponse({ kind: "metric", value: "2" }),
      },
    ])
    renderWithProviders(
      <MetricCardBlock
        viewId="v1"
        block={block(CFG)}
        onConfigure={() => {}}
        onDrill={() => {}}
      />,
    )
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument())
    expect(screen.getByText("2")).toHaveClass("text-emerald-600")
  })

  it("renders red beyond amber and formats money compactly", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.includes("/data"),
        respond: () => jsonResponse({ kind: "metric", value: "250000" }),
      },
    ])
    renderWithProviders(
      <MetricCardBlock
        viewId="v1"
        block={block({ ...CFG, money: true, compact: true })}
        onConfigure={() => {}}
        onDrill={() => {}}
      />,
    )
    await waitFor(() => expect(screen.getByText("$250k")).toBeInTheDocument())
    expect(screen.getByText("$250k")).toHaveClass("text-rose-600")
  })

  it("appends % for pct_of_total (money flag ignored) — Phase 7.8", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.includes("/data"),
        respond: () => jsonResponse({ kind: "metric", value: "42.5" }),
      },
    ])
    renderWithProviders(
      <MetricCardBlock
        viewId="v1"
        block={block({
          metric: { entity: "milestone", aggregation: "pct_of_total" },
          money: true,
        })}
        onConfigure={() => {}}
        onDrill={() => {}}
      />,
    )
    await waitFor(() => expect(screen.getByText("42.5%")).toBeInTheDocument())
  })

  it("configured card value drills on click — Phase 7.8", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.includes("/data"),
        respond: () => jsonResponse({ kind: "metric", value: "2" }),
      },
    ])
    const onDrill = vi.fn()
    renderWithProviders(
      <MetricCardBlock
        viewId="v1"
        block={block(CFG)}
        onConfigure={() => {}}
        onDrill={onDrill}
      />,
    )
    await waitFor(() => expect(screen.getByText("2")).toBeInTheDocument())
    await userEvent.click(
      screen.getByRole("button", { name: /show matching rows/i }),
    )
    expect(onDrill).toHaveBeenCalledTimes(1)
  })
})
