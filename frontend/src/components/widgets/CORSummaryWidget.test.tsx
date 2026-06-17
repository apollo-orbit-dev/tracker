import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import { CORSummaryWidget } from "./CORSummaryWidget"
import { jsonResponse, stubFetchByRoute } from "@/test/test-utils"

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <CORSummaryWidget />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const corsStub = (
  by_status: { status: string; count: number; total_amount: string }[],
) => ({
  match: (u: string) => u.includes("/api/dashboard/cors/summary"),
  respond: () => jsonResponse({ by_status }),
})

describe("CORSummaryWidget", () => {
  it("renders a stacked bar segment per non-zero status + tone-aware row badges", async () => {
    stubFetchByRoute([
      corsStub([
        { status: "draft", count: 1, total_amount: "10000.00" },
        { status: "submitted", count: 2, total_amount: "25000.00" },
        { status: "approved", count: 3, total_amount: "65000.00" },
      ]),
    ])
    setup()
    await waitFor(() => {
      expect(screen.getByText("Draft")).toBeInTheDocument()
    })
    expect(screen.getByText("Submitted")).toBeInTheDocument()
    expect(screen.getByText("Approved")).toBeInTheDocument()

    // Tones: draft → slate, submitted → blue, approved → emerald.
    expect(screen.getByText("Draft")).toHaveClass(
      "bg-[hsl(var(--tone-slate-bg))]",
    )
    expect(screen.getByText("Submitted")).toHaveClass(
      "bg-[hsl(var(--tone-blue-bg))]",
    )
    expect(screen.getByText("Approved")).toHaveClass(
      "bg-[hsl(var(--tone-emerald-bg))]",
    )

    // One bar segment per non-zero status.
    expect(screen.getAllByTestId("cor-bar-segment")).toHaveLength(3)
  })

  it("renders the Total exposure footer with aggregated count + dollars", async () => {
    stubFetchByRoute([
      corsStub([
        { status: "draft", count: 1, total_amount: "10000.00" },
        { status: "approved", count: 3, total_amount: "65000.00" },
      ]),
    ])
    setup()
    await waitFor(() => {
      expect(screen.getByText(/total exposure/i)).toBeInTheDocument()
    })
    // 1 + 3 = 4 CORs; $10k + $65k = $75k.
    expect(screen.getByText("4 CORs")).toBeInTheDocument()
    expect(screen.getByText("$75,000")).toBeInTheDocument()
  })

  it("singularizes 'COR' when count == 1", async () => {
    stubFetchByRoute([
      corsStub([{ status: "approved", count: 1, total_amount: "5000.00" }]),
    ])
    setup()
    await waitFor(() => {
      expect(screen.getByText(/total exposure/i)).toBeInTheDocument()
    })
    // Two appearances expected: the row's count + the footer total.
    expect(screen.getAllByText("1 COR")).toHaveLength(2)
  })

  it("suppresses the bar when grand total is $0", async () => {
    stubFetchByRoute([
      corsStub([
        { status: "draft", count: 1, total_amount: "0" },
        { status: "submitted", count: 1, total_amount: "0" },
      ]),
    ])
    setup()
    await waitFor(() => {
      expect(screen.getByText("Draft")).toBeInTheDocument()
    })
    expect(screen.queryAllByTestId("cor-bar-segment")).toHaveLength(0)
  })

  it("renders the empty state when there are no CORs", async () => {
    stubFetchByRoute([corsStub([])])
    setup()
    await waitFor(() => {
      expect(screen.getByText(/no cors yet/i)).toBeInTheDocument()
    })
    expect(screen.queryByText(/total exposure/i)).not.toBeInTheDocument()
  })
})
