import { screen, waitFor } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { DrillDownSheet } from "./DrillDownSheet"
import type { MetricDefinition } from "@/api/views"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const METRIC: MetricDefinition = {
  entity: "project",
  aggregation: "count",
  template_id: "t1",
}

const drillRow = (i: number) => ({
  id: `r${i}`,
  project_id: `p${i}`,
  label: `Project ${i}`,
  sublabel: `PRJ-${i}`,
})

function stubRows(data: unknown) {
  return stubFetchByRoute([
    {
      match: (u) => u.includes("/api/metrics/eval/rows"),
      respond: () => jsonResponse(data),
    },
  ])
}

describe("DrillDownSheet", () => {
  it("posts the metric + group params on open and lists rows", async () => {
    const spy = stubRows({ total: 2, rows: [drillRow(1), drillRow(2)] })
    renderWithProviders(
      <DrillDownSheet
        open={{
          metric: METRIC,
          groupBy: "f-sel",
          groupValue: "North",
          title: "By region · North",
        }}
        onClose={() => {}}
      />,
    )
    await waitFor(() =>
      expect(screen.getByText("Project 1")).toBeInTheDocument(),
    )
    expect(screen.getByText("PRJ-1")).toBeInTheDocument()
    expect(screen.getByText("Project 2")).toBeInTheDocument()
    const call = spy.mock.calls.find(([u]) =>
      String(u).includes("/api/metrics/eval/rows"),
    )
    const body = JSON.parse(String((call![1] as RequestInit).body))
    expect(body).toEqual({
      metric: METRIC,
      group_by: "f-sel",
      group_value: "North",
    })
  })

  it("drills the null bucket as group_value: null and rows link to the project", async () => {
    const spy = stubRows({ total: 1, rows: [drillRow(7)] })
    renderWithProviders(
      <DrillDownSheet
        open={{
          metric: METRIC,
          groupBy: "f-sel",
          groupValue: null,
          title: "By region · —",
        }}
        onClose={() => {}}
      />,
    )
    const link = await screen.findByRole("link", { name: /Project 7/ })
    expect(link).toHaveAttribute("href", "/projects/p7")
    const call = spy.mock.calls.find(([u]) =>
      String(u).includes("/api/metrics/eval/rows"),
    )
    const body = JSON.parse(String((call![1] as RequestInit).body))
    expect(body.group_by).toBe("f-sel")
    expect(body.group_value).toBeNull()
  })

  it("omits group params for whole-metric drills and captions capped results", async () => {
    const spy = stubRows({
      total: 105,
      rows: Array.from({ length: 100 }, (_, i) => drillRow(i)),
    })
    renderWithProviders(
      <DrillDownSheet
        open={{ metric: METRIC, title: "All projects" }}
        onClose={() => {}}
      />,
    )
    await waitFor(() =>
      expect(screen.getByText(/Showing 100 of 105/)).toBeInTheDocument(),
    )
    const call = spy.mock.calls.find(([u]) =>
      String(u).includes("/api/metrics/eval/rows"),
    )
    const body = JSON.parse(String((call![1] as RequestInit).body))
    expect(body).toEqual({ metric: METRIC })
  })

  it("renders nothing while closed and shows the error detail on failure", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.includes("/api/metrics/eval/rows"),
        respond: () => jsonResponse({ detail: ["bad group"] }, 422),
      },
    ])
    renderWithProviders(<DrillDownSheet open={null} onClose={() => {}} />)
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument()
    renderWithProviders(
      <DrillDownSheet
        open={{ metric: METRIC, title: "X" }}
        onClose={() => {}}
      />,
    )
    await waitFor(() =>
      expect(screen.getByText(/bad group/)).toBeInTheDocument(),
    )
  })
})
