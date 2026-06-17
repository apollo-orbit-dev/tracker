import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import { LifecycleWidget } from "./LifecycleWidget"
import { jsonResponse, stubFetchByRoute } from "@/test/test-utils"

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <LifecycleWidget />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("LifecycleWidget", () => {
  it("renders all five lifecycle states with the tone-aware Badge", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.includes("/api/dashboard/projects/lifecycle"),
        respond: () =>
          jsonResponse({
            draft: 3,
            active: 5,
            on_hold: 1,
            complete: 9,
            cancelled: 0,
          }),
      },
    ])
    setup()
    await waitFor(() => {
      expect(screen.getByText("Draft")).toBeInTheDocument()
    })
    expect(screen.getByText("Active")).toBeInTheDocument()
    expect(screen.getByText("On hold")).toBeInTheDocument()
    expect(screen.getByText("Complete")).toBeInTheDocument()
    expect(screen.getByText("Cancelled")).toBeInTheDocument()

    // Phase 4.4.1: each badge uses the new tone palette.
    expect(screen.getByText("Draft")).toHaveClass(
      "bg-[hsl(var(--tone-slate-bg))]",
    )
    expect(screen.getByText("Active")).toHaveClass(
      "bg-[hsl(var(--tone-emerald-bg))]",
    )
    expect(screen.getByText("On hold")).toHaveClass(
      "bg-[hsl(var(--tone-amber-bg))]",
    )
    expect(screen.getByText("Complete")).toHaveClass(
      "bg-[hsl(var(--tone-indigo-bg))]",
    )
    expect(screen.getByText("Cancelled")).toHaveClass(
      "bg-[hsl(var(--tone-rose-bg))]",
    )
  })

  it("shows the counts beside each badge", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.includes("/api/dashboard/projects/lifecycle"),
        respond: () =>
          jsonResponse({
            draft: 0,
            active: 2,
            on_hold: 0,
            complete: 7,
            cancelled: 1,
          }),
      },
    ])
    setup()
    await waitFor(() => {
      expect(screen.getByText("2")).toBeInTheDocument()
    })
    expect(screen.getByText("7")).toBeInTheDocument()
    expect(screen.getByText("1")).toBeInTheDocument()
    // Three zero counts — assert at least one zero renders.
    expect(screen.getAllByText("0").length).toBeGreaterThanOrEqual(2)
  })
})
