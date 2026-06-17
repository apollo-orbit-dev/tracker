// Phase 7.12 carry-over (a) from the 7.11 review: a stored table
// config can hold column keys that no longer exist on the template
// (deleted field/milestone, changed date_model). Those keys are
// invisible in the picker but counted against the 8-cap and 422 on
// save — once defs load, the section must prune the draft to the
// available key set without ever dropping valid keys.
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { TableConfigSection } from "./TableConfigSection"
import type { SectionState } from "./shared"
import {
  jsonResponse,
  renderWithProviders,
  stubFetchByRoute,
} from "@/test/test-utils"

const FIELDS = {
  items: [
    { id: "f1", name: "PM", field_type: "text", options: null },
    { id: "f-qa", name: "QA done", field_type: "boolean", options: null },
  ],
}
const MILESTONES = {
  items: [
    { id: "m1", name: "Kickoff", direction: "internal", date_model: "single" },
  ],
}
const TEMPLATES = { items: [{ id: "t1", name: "DIV1 / CON / Design" }] }

function stubs() {
  return stubFetchByRoute([
    { match: (u) => u.includes("/fields"), respond: () => jsonResponse(FIELDS) },
    {
      match: (u) => u.includes("/milestones"),
      respond: () => jsonResponse(MILESTONES),
    },
    {
      match: (u) => u.includes("/api/admin/templates"),
      respond: () => jsonResponse(TEMPLATES),
    },
  ])
}

describe("TableConfigSection (stale stored columns)", () => {
  it("prunes stored keys missing from the template once defs load; valid keys survive and the config becomes savable", async () => {
    stubs()
    const onState = vi.fn<(s: SectionState) => void>()
    renderWithProviders(
      <TableConfigSection
        initialConfig={{
          template_id: "t1",
          columns: [
            "builtin:title",
            "custom_field:f1",
            "custom_field:f_gone", // deleted field — not in the defs
            "milestone:m1:planned", // m1 is single-date now — stale mode
          ],
          limit: 6,
        }}
        onState={onState}
      />,
    )
    await waitFor(() => {
      const last = onState.mock.calls.at(-1)![0]
      expect(last.valid).toBe(true)
      expect(last.config.columns).toEqual([
        "builtin:title",
        "custom_field:f1",
      ])
    })
  })

  it("never prunes while defs are still loading (first mount report keeps the stored keys, valid:false)", () => {
    stubs()
    const onState = vi.fn<(s: SectionState) => void>()
    renderWithProviders(
      <TableConfigSection
        initialConfig={{
          template_id: "t1",
          columns: ["builtin:title", "custom_field:f_gone"],
          limit: 6,
        }}
        onState={onState}
      />,
    )
    // Synchronous first report: defs not loaded yet — unpruned + invalid.
    const first = onState.mock.calls[0][0]
    expect(first.valid).toBe(false)
    expect(first.config.columns).toEqual([
      "builtin:title",
      "custom_field:f_gone",
    ])
  })
})

describe("TableConfigSection (conditions, Phase 7.18)", () => {
  it("adding a condition emits a config with non-empty conditions.items", async () => {
    stubs()
    const onState = vi.fn<(s: SectionState) => void>()
    renderWithProviders(
      <TableConfigSection
        initialConfig={{ template_id: "t1", columns: ["builtin:title"], limit: 6 }}
        onState={onState}
      />,
    )
    // ConditionsEditor only renders once template defs load.
    const addBtn = await screen.findByRole("button", { name: /add condition/i })
    await userEvent.click(addBtn)
    await waitFor(() => {
      const last = onState.mock.calls.at(-1)![0]
      const conds = last.config.conditions as {
        items: { field: string }[]
      } | null
      expect(conds).not.toBeNull()
      expect(conds!.items.length).toBeGreaterThan(0)
    })
  })

  it("emits conditions: null when no conditions are set", async () => {
    stubs()
    const onState = vi.fn<(s: SectionState) => void>()
    renderWithProviders(
      <TableConfigSection
        initialConfig={{ template_id: "t1", columns: ["builtin:title"], limit: 6 }}
        onState={onState}
      />,
    )
    await waitFor(() => {
      const last = onState.mock.calls.at(-1)![0]
      expect(last.valid).toBe(true)
      expect(last.config.conditions).toBeNull()
    })
  })

  it("clears conditions when the template changes (stale refs would 422 on save)", async () => {
    // Two templates so we can switch; the /fields stub is template-agnostic.
    stubFetchByRoute([
      { match: (u) => u.includes("/fields"), respond: () => jsonResponse(FIELDS) },
      {
        match: (u) => u.includes("/milestones"),
        respond: () => jsonResponse(MILESTONES),
      },
      {
        match: (u) => u.includes("/api/admin/templates"),
        respond: () =>
          jsonResponse({
            items: [
              { id: "t1", name: "DIV1 / CON / Design" },
              { id: "t2", name: "DIV3 / OTH / CIV" },
            ],
          }),
      },
    ])
    const onState = vi.fn<(s: SectionState) => void>()
    renderWithProviders(
      <TableConfigSection
        initialConfig={{
          template_id: "t1",
          columns: ["builtin:title"],
          conditions: {
            combinator: "and",
            items: [{ field: "f-qa", op: "is_false" }],
          },
          limit: 6,
        }}
        onState={onState}
      />,
    )
    // Once defs load, the stored condition is reflected in the emitted config.
    await waitFor(() => {
      const last = onState.mock.calls.at(-1)![0]
      const conds = last.config.conditions as { items: unknown[] } | null
      expect(conds?.items ?? []).toHaveLength(1)
    })
    // Switching template must drop the now-stale condition refs.
    await userEvent.click(screen.getByLabelText("Template"))
    await userEvent.click(await screen.findByRole("option", { name: /DIV3/ }))
    await waitFor(() => {
      const last = onState.mock.calls.at(-1)![0]
      expect(last.config.conditions ?? null).toBeNull()
    })
  })
})
