import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ChartBlock } from "./ChartBlock"
import type { ViewBlock } from "@/api/views"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const block = (config: ViewBlock["config"]): ViewBlock => ({
  id: "b1",
  view_id: "v1",
  block_type: "chart",
  title: "By region",
  order_index: 0,
  width: 2,
  accent: "indigo",
  config,
})

const CFG = {
  metric: { entity: "project", aggregation: "count" },
  group_by: "f-sel",
  kind: "bar",
}

function stubData(data: unknown) {
  return stubFetchByRoute([
    {
      match: (u) => u.includes("/api/views/v1/blocks/b1/data"),
      respond: () => jsonResponse(data),
    },
  ])
}

const row = (
  label: string,
  value: string | null,
  flags: { is_null?: boolean; is_other?: boolean } = {},
) => ({
  label,
  value,
  is_null: flags.is_null ?? false,
  is_other: flags.is_other ?? false,
})

describe("ChartBlock", () => {
  it("unconfigured: shows the configure prompt", () => {
    renderWithProviders(
      <ChartBlock
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

  it("bar: renders a row per group with label + value; rows drill", async () => {
    stubData({
      kind: "chart",
      chart_kind: "bar",
      money: false,
      rows: [row("North", "2"), row("South", "1")],
    })
    const onDrill = vi.fn()
    renderWithProviders(
      <ChartBlock
        viewId="v1"
        block={block(CFG)}
        onConfigure={() => {}}
        onDrill={onDrill}
      />,
    )
    await waitFor(() => expect(screen.getByText("North")).toBeInTheDocument())
    expect(screen.getByText("2")).toBeInTheDocument()
    expect(screen.getByText("South")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: /North/ }))
    expect(onDrill).toHaveBeenCalledWith({ label: "North", isNull: false })
  })

  it("bar: formats money values and keys the null bucket off its flag", async () => {
    stubData({
      kind: "chart",
      chart_kind: "bar",
      money: true,
      rows: [row("submitted", "350000"), row("—", "1000", { is_null: true })],
    })
    const onDrill = vi.fn()
    renderWithProviders(
      <ChartBlock
        viewId="v1"
        block={block({ ...CFG, money: true })}
        onConfigure={() => {}}
        onDrill={onDrill}
      />,
    )
    await waitFor(() =>
      expect(screen.getByText("$350,000")).toBeInTheDocument(),
    )
    // The "—" bucket stays drillable and reports isNull via the flag.
    await userEvent.click(screen.getByRole("button", { name: /—/ }))
    expect(onDrill).toHaveBeenCalledWith({ label: "—", isNull: true })
  })

  it("bar: the synthetic Other row is disabled, not drillable", async () => {
    stubData({
      kind: "chart",
      chart_kind: "bar",
      money: false,
      rows: [row("North", "9"), row("Other", "5", { is_other: true })],
    })
    const onDrill = vi.fn()
    renderWithProviders(
      <ChartBlock
        viewId="v1"
        block={block(CFG)}
        onConfigure={() => {}}
        onDrill={onDrill}
      />,
    )
    await waitFor(() => expect(screen.getByText("Other")).toBeInTheDocument())
    const other = screen.getByRole("button", { name: /Other/ })
    expect(other).toBeDisabled()
    await userEvent.click(other)
    expect(onDrill).not.toHaveBeenCalled()
  })

  it("donut: renders a legend of drillable group buttons", async () => {
    stubData({
      kind: "chart",
      chart_kind: "donut",
      money: false,
      rows: [
        row("approved", "4"),
        row("draft", "2"),
        row("Other", "1", { is_other: true }),
      ],
    })
    const onDrill = vi.fn()
    renderWithProviders(
      <ChartBlock
        viewId="v1"
        block={block({ ...CFG, kind: "donut" })}
        onConfigure={() => {}}
        onDrill={onDrill}
      />,
    )
    await waitFor(() =>
      expect(screen.getByText("approved")).toBeInTheDocument(),
    )
    expect(screen.getByText("4")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /Other/ })).toBeDisabled()
    await userEvent.click(screen.getByRole("button", { name: /draft/ }))
    expect(onDrill).toHaveBeenCalledWith({ label: "draft", isNull: false })
  })
})
