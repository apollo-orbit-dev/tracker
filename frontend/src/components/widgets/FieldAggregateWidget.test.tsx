import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi } from "vitest"

import { FieldAggregateWidget } from "./FieldAggregateWidget"
import type { FieldAggregateConfig } from "@/api/dashboard_widgets"
import { jsonResponse, stubFetchByRoute } from "@/test/test-utils"

function setup(props: {
  config: FieldAggregateConfig | null
  onConfigure?: () => void
}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FieldAggregateWidget {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const aggregateStub = (
  primary: {
    field_name: string
    field_type: string
    total: string
    project_count: number
  },
  secondary: {
    field_name: string
    field_type: string
    total: string
    project_count: number
  } | null = null,
) => ({
  match: (u: string) => u.includes("/api/dashboard/field_aggregate"),
  respond: () => jsonResponse({ primary, secondary }),
})

describe("FieldAggregateWidget", () => {
  it("unconfigured: renders the Sigma prompt + Configure button", async () => {
    const onConfigure = vi.fn()
    setup({ config: null, onConfigure })
    expect(
      screen.getByRole("button", { name: /configure/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/this widget needs configuration/i),
    ).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole("button", { name: /configure/i }),
    )
    expect(onConfigure).toHaveBeenCalled()
  })

  it("unconfigured: omits the Configure button when no onConfigure handler is supplied", () => {
    setup({ config: null })
    expect(screen.getByText(/this widget needs configuration/i)).toBeInTheDocument()
    expect(
      screen.queryByRole("button", { name: /configure/i }),
    ).not.toBeInTheDocument()
  })

  it("configured + primary only: renders a single side-row with total + project count", async () => {
    stubFetchByRoute([
      aggregateStub({
        field_name: "Budget",
        field_type: "currency",
        total: "1284000",
        project_count: 12,
      }),
    ])
    setup({
      config: {
        template_id: "t1",
        primary_field_id: "f1",
        secondary_field_id: null,
      },
    })
    await waitFor(() => {
      expect(screen.getByText("Budget")).toBeInTheDocument()
    })
    expect(screen.getByText(/across 12 projects/i)).toBeInTheDocument()
  })

  it("configured + primary + secondary: renders two rows", async () => {
    stubFetchByRoute([
      aggregateStub(
        {
          field_name: "Budget",
          field_type: "currency",
          total: "1284000",
          project_count: 12,
        },
        {
          field_name: "Spent",
          field_type: "currency",
          total: "968400",
          project_count: 12,
        },
      ),
    ])
    setup({
      config: {
        template_id: "t1",
        primary_field_id: "f1",
        secondary_field_id: "f2",
      },
    })
    await waitFor(() => {
      expect(screen.getByText("Budget")).toBeInTheDocument()
    })
    expect(screen.getByText("Spent")).toBeInTheDocument()
  })

  it("configured + project_count == 1: singularizes 'project'", async () => {
    stubFetchByRoute([
      aggregateStub({
        field_name: "Budget",
        field_type: "currency",
        total: "50000",
        project_count: 1,
      }),
    ])
    setup({
      config: {
        template_id: "t1",
        primary_field_id: "f1",
        secondary_field_id: null,
      },
    })
    await waitFor(() => {
      expect(screen.getByText(/across 1 project$/i)).toBeInTheDocument()
    })
  })
})
