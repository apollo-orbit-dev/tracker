// Phase 7.12 — saved metrics library menu. Apply hands the caller a
// COPY of the stored config (no live link — deleting a saved metric
// later must not affect blocks built from it); save-as POSTs the
// builder's current value; delete is a per-metric destructive
// affordance. The server (validate_metric + the 50-cap) stays the
// boundary validator.
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { SavedMetricsMenu } from "./SavedMetricsMenu"
import type { MetricDefinition } from "@/api/views"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const CURRENT: MetricDefinition = {
  entity: "project",
  aggregation: "count",
  template_id: "t1",
  target_field: null,
  conditions: { combinator: "and", items: [] },
}

const STORED_CONFIG = {
  entity: "project",
  aggregation: "count",
  template_id: "t1",
  target_field: null,
  conditions: {
    combinator: "and",
    items: [{ field: "f-bool", op: "is_false" }],
  },
}

const METRICS = {
  items: [
    { id: "sm1", name: "Missing kickoff", config: STORED_CONFIG },
    { id: "sm2", name: "Open CORs", config: { entity: "cor", aggregation: "count" } },
  ],
}

function stubs(list: unknown = METRICS) {
  return stubFetchByRoute([
    {
      match: (u, init) =>
        u.includes("/api/saved-metrics") &&
        (init?.method ?? "GET") === "GET",
      respond: () => jsonResponse(list),
    },
    {
      match: (u, init) =>
        u.includes("/api/saved-metrics") && init?.method === "POST",
      respond: (_u, init) =>
        jsonResponse(
          { id: "sm-new", ...JSON.parse(String(init?.body)) },
          201,
        ),
    },
    {
      match: (u, init) =>
        u.includes("/api/saved-metrics/") && init?.method === "DELETE",
      respond: () => new Response(null, { status: 204 }),
    },
  ])
}

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole("button", { name: /saved metrics/i }))
}

describe("SavedMetricsMenu", () => {
  it("lists the saved metrics; clicking one applies a COPY of its config", async () => {
    stubs()
    const onApply = vi.fn()
    renderWithProviders(<SavedMetricsMenu current={CURRENT} onApply={onApply} />)
    const user = userEvent.setup()
    await openMenu(user)
    expect(
      await screen.findByRole("menuitem", { name: /open cors/i }),
    ).toBeInTheDocument()
    await user.click(
      screen.getByRole("menuitem", { name: /missing kickoff/i }),
    )
    expect(onApply).toHaveBeenCalledTimes(1)
    const applied = onApply.mock.calls[0][0]
    expect(applied).toEqual(STORED_CONFIG)
    // A copy, not the cached object — mutating the builder draft must
    // never write through into the query cache.
    expect(applied).not.toBe(STORED_CONFIG)
  })

  it("shows the empty state when nothing is saved", async () => {
    stubs({ items: [] })
    renderWithProviders(
      <SavedMetricsMenu current={CURRENT} onApply={() => {}} />,
    )
    const user = userEvent.setup()
    await openMenu(user)
    expect(
      await screen.findByText(/no saved metrics yet/i),
    ).toBeInTheDocument()
  })

  it("'Save current as…' opens the dialog; Save POSTs {name, config: current} and closes", async () => {
    const fetchMock = stubs()
    renderWithProviders(
      <SavedMetricsMenu current={CURRENT} onApply={() => {}} />,
    )
    const user = userEvent.setup()
    await openMenu(user)
    await user.click(
      await screen.findByRole("menuitem", { name: /save current as/i }),
    )
    const dialog = await screen.findByRole("dialog")
    expect(dialog).toBeInTheDocument()
    // Save is gated on a non-empty name.
    expect(screen.getByRole("button", { name: /^save$/i })).toBeDisabled()
    await user.type(screen.getByLabelText("Name"), "Active DIV1")
    await user.click(screen.getByRole("button", { name: /^save$/i }))

    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    )
    const post = fetchMock.mock.calls.find(
      ([, init]) => (init as RequestInit)?.method === "POST",
    )
    expect(post).toBeTruthy()
    expect(String(post![0])).toContain("/api/saved-metrics")
    expect(JSON.parse(String((post![1] as RequestInit).body))).toEqual({
      name: "Active DIV1",
      config: CURRENT,
    })
  })

  it("the per-metric delete affordance DELETEs without applying", async () => {
    const fetchMock = stubs()
    const onApply = vi.fn()
    renderWithProviders(<SavedMetricsMenu current={CURRENT} onApply={onApply} />)
    const user = userEvent.setup()
    await openMenu(user)
    await user.click(
      await screen.findByRole("button", {
        name: /delete saved metric missing kickoff/i,
      }),
    )
    await waitFor(() => {
      const del = fetchMock.mock.calls.find(
        ([, init]) => (init as RequestInit)?.method === "DELETE",
      )
      expect(del).toBeTruthy()
      expect(String(del![0])).toContain("/api/saved-metrics/sm1")
    })
    expect(onApply).not.toHaveBeenCalled()
  })
})
