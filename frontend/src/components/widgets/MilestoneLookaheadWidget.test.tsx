import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { MilestoneLookaheadWidget } from "./MilestoneLookaheadWidget"
import { jsonResponse, stubFetchByRoute } from "@/test/test-utils"

type WidgetShape = {
  id: string
  dashboard_id: string
  widget_type: string
  config: Record<string, unknown> | null
  title: string | null
  order_index: number
  width: number
  created_at: string
  updated_at: string
}

const WIDGET: WidgetShape = {
  id: "w1",
  dashboard_id: "d1",
  widget_type: "milestone_lookahead",
  config: null,
  title: null,
  order_index: 0,
  width: 1,
  created_at: "2026-05-22T00:00:00Z",
  updated_at: "2026-05-22T00:00:00Z",
}

function setup(widgetOverrides: Partial<WidgetShape> = {}) {
  const widget = { ...WIDGET, ...widgetOverrides }
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <MilestoneLookaheadWidget widget={widget} dashboardId="d1" />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const lookaheadStub = {
  match: (u: string) => u.includes("/api/dashboard/milestones/lookahead"),
  respond: () => jsonResponse({ items: [], total: 0 }),
}

describe("MilestoneLookaheadWidget", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders the Segmented presets with 60d active by default", async () => {
    stubFetchByRoute([lookaheadStub])
    setup()
    await waitFor(() => {
      // Phase 4.4.3: presets moved from <Button> row to a Segmented
      // control. Selected option is a `tab` with aria-selected=true.
      const sixty = screen.getByRole("tab", { name: "60d" })
      expect(sixty).toHaveAttribute("aria-selected", "true")
    })
    expect(screen.getByText(/next 60 days/i)).toBeInTheDocument()
  })

  it("clicking 30d triggers a PATCH with future_days: 30", async () => {
    const patchSpy = vi.fn((_u: string, _init?: RequestInit) =>
      jsonResponse({ ...WIDGET, config: { future_days: 30 } }),
    )
    stubFetchByRoute([
      lookaheadStub,
      {
        match: (u: string, init?: RequestInit) =>
          u.endsWith("/api/dashboards/d1/widgets/w1") &&
          init?.method === "PATCH",
        respond: (u: string, init?: RequestInit) => patchSpy(u, init),
      },
    ])
    setup()
    const thirty = await screen.findByRole("tab", { name: "30d" })
    await userEvent.click(thirty)
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalled()
    })
    const lastInit = patchSpy.mock.calls[patchSpy.mock.calls.length - 1][1]
    const body = JSON.parse(String(lastInit?.body))
    expect(body.config.future_days).toBe(30)
  })

  it("widget with future_days: 45 shows the custom button as 45d", async () => {
    stubFetchByRoute([lookaheadStub])
    setup({ config: { future_days: 45 } })
    const custom = await screen.findByRole("button", { name: /45d/i })
    expect(custom).toHaveAttribute("aria-pressed", "true")
    expect(screen.getByText(/next 45 days/i)).toBeInTheDocument()
  })

  it("renders the overdue header chip when any item is past due", async () => {
    stubFetchByRoute([
      {
        match: (u: string) => u.includes("/api/dashboard/milestones/lookahead"),
        respond: () =>
          jsonResponse({
            items: [
              {
                milestone_id: "m1",
                milestone_name: "Late one",
                ad_hoc: false,
                direction: "outbound",
                project_id: "p1",
                project_title: "Demo",
                planned_date: "2026-05-01",
                days_offset: -10,
              },
              {
                milestone_id: "m2",
                milestone_name: "Also late",
                ad_hoc: false,
                direction: "outbound",
                project_id: "p2",
                project_title: "Demo 2",
                planned_date: "2026-05-05",
                days_offset: -2,
              },
              {
                milestone_id: "m3",
                milestone_name: "Today",
                ad_hoc: false,
                direction: "outbound",
                project_id: "p3",
                project_title: "Demo 3",
                planned_date: "2026-06-10",
                days_offset: 0,
              },
            ],
            total: 3,
          }),
      },
    ])
    setup()
    await waitFor(() => {
      expect(screen.getByText(/2 overdue/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/2 overdue/i)).toHaveClass(
      "bg-[hsl(var(--tone-rose-bg))]",
    )
  })

  it("hides the overdue chip when no items are past due", async () => {
    stubFetchByRoute([
      {
        match: (u: string) => u.includes("/api/dashboard/milestones/lookahead"),
        respond: () =>
          jsonResponse({
            items: [
              {
                milestone_id: "m1",
                milestone_name: "Future",
                ad_hoc: false,
                direction: "outbound",
                project_id: "p1",
                project_title: "Demo",
                planned_date: "2026-08-01",
                days_offset: 40,
              },
            ],
            total: 1,
          }),
      },
    ])
    setup()
    await waitFor(() => {
      expect(screen.getByText("Future")).toBeInTheDocument()
    })
    expect(screen.queryByText(/overdue/i)).not.toBeInTheDocument()
  })

  it("per-row badges use the tone palette per days_offset", async () => {
    stubFetchByRoute([
      {
        match: (u: string) => u.includes("/api/dashboard/milestones/lookahead"),
        respond: () =>
          jsonResponse({
            items: [
              {
                milestone_id: "m1",
                milestone_name: "Late",
                ad_hoc: false,
                direction: "outbound",
                project_id: "p1",
                project_title: "Demo",
                planned_date: "2026-05-01",
                days_offset: -3,
              },
              {
                milestone_id: "m2",
                milestone_name: "Due today",
                ad_hoc: false,
                direction: "outbound",
                project_id: "p1",
                project_title: "Demo",
                planned_date: "2026-06-10",
                days_offset: 0,
              },
              {
                milestone_id: "m3",
                milestone_name: "Soon",
                ad_hoc: false,
                direction: "outbound",
                project_id: "p1",
                project_title: "Demo",
                planned_date: "2026-06-15",
                days_offset: 5,
              },
              {
                milestone_id: "m4",
                milestone_name: "Far",
                ad_hoc: false,
                direction: "outbound",
                project_id: "p1",
                project_title: "Demo",
                planned_date: "2026-08-01",
                days_offset: 40,
              },
            ],
            total: 4,
          }),
      },
    ])
    setup()
    await waitFor(() => {
      expect(screen.getByText("3d overdue")).toBeInTheDocument()
    })
    expect(screen.getByText("3d overdue")).toHaveClass(
      "bg-[hsl(var(--tone-rose-bg))]",
    )
    expect(screen.getByText("Today")).toHaveClass(
      "bg-[hsl(var(--tone-amber-bg))]",
    )
    expect(screen.getByText("in 5d")).toHaveClass(
      "bg-[hsl(var(--tone-amber-bg))]",
    )
    expect(screen.getByText("in 40d")).toHaveClass(
      "bg-[hsl(var(--tone-slate-bg))]",
    )
  })

  it("custom popover saves a typed value via the Save button", async () => {
    const patchSpy = vi.fn((_u: string, _init?: RequestInit) =>
      jsonResponse({ ...WIDGET, config: { future_days: 120 } }),
    )
    stubFetchByRoute([
      lookaheadStub,
      {
        match: (u: string, init?: RequestInit) =>
          u.endsWith("/api/dashboards/d1/widgets/w1") &&
          init?.method === "PATCH",
        respond: (u: string, init?: RequestInit) => patchSpy(u, init),
      },
    ])
    setup()
    await userEvent.click(await screen.findByRole("button", { name: /^Custom/ }))
    const input = await screen.findByLabelText(/Days/)
    await userEvent.clear(input)
    await userEvent.type(input, "120")
    await userEvent.click(screen.getByRole("button", { name: "Save" }))
    await waitFor(() => {
      expect(patchSpy).toHaveBeenCalled()
    })
    const lastInit = patchSpy.mock.calls[patchSpy.mock.calls.length - 1][1]
    const body = JSON.parse(String(lastInit?.body))
    expect(body.config.future_days).toBe(120)
  })
})
