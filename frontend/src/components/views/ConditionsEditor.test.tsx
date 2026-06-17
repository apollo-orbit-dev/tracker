// Phase 7.18 — ConditionsEditor: the conditions UI extracted from
// MetricBuilder (behavior-frozen) and reused by the table block. Pure
// component (no fetch) — fieldOpts are passed in directly.
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { ConditionsEditor } from "./ConditionsEditor"
import type { FieldOption } from "./metricCatalog"
import type { MetricCondition } from "@/api/views"

const FIELD_OPTS: FieldOption[] = [
  { ref: "f-bool", label: "QA done", kind: "boolean", choices: null },
  { ref: "f-date", label: "Due date", kind: "date", choices: null },
  { ref: "f-text", label: "Notes", kind: "text", choices: null },
]

const conds = (items: MetricCondition[]) =>
  ({ combinator: "and" as const, items })

describe("ConditionsEditor", () => {
  it("adding a condition appends a row via onChange", async () => {
    const onChange = vi.fn()
    render(
      <ConditionsEditor
        fieldOpts={FIELD_OPTS}
        conditions={conds([])}
        onChange={onChange}
        idPrefix="t"
      />,
    )
    await userEvent.click(screen.getByRole("button", { name: /add condition/i }))
    expect(onChange).toHaveBeenCalled()
    const next = onChange.mock.calls.at(-1)![0]
    expect(next.items).toHaveLength(1)
    // First field option is the default for the new row.
    expect(next.items[0].field).toBe("f-bool")
  })

  it("shows the AND/OR toggle only at ≥2 items", () => {
    const { rerender } = render(
      <ConditionsEditor
        fieldOpts={FIELD_OPTS}
        conditions={conds([{ field: "f-bool", op: "is_true" }])}
        onChange={() => {}}
        idPrefix="t"
      />,
    )
    expect(
      screen.queryByRole("tablist", { name: /combine conditions with/i }),
    ).not.toBeInTheDocument()

    rerender(
      <ConditionsEditor
        fieldOpts={FIELD_OPTS}
        conditions={conds([
          { field: "f-bool", op: "is_true" },
          { field: "f-text", op: "contains", value: "x" },
        ])}
        onChange={() => {}}
        idPrefix="t"
      />,
    )
    expect(
      screen.getByRole("tablist", { name: /combine conditions with/i }),
    ).toBeInTheDocument()
  })

  it("a boolean field renders no value input; a date no-value op renders none either", () => {
    const { rerender } = render(
      <ConditionsEditor
        fieldOpts={FIELD_OPTS}
        conditions={conds([{ field: "f-bool", op: "is_true" }])}
        onChange={() => {}}
        idPrefix="t"
      />,
    )
    // No value control for a boolean condition.
    expect(screen.queryByLabelText(/^Text value$/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/^Date$/i)).not.toBeInTheDocument()

    // A date field with on_or_before_today (no-value preset) → no input.
    rerender(
      <ConditionsEditor
        fieldOpts={FIELD_OPTS}
        conditions={conds([{ field: "f-date", op: "on_or_before_today" }])}
        onChange={() => {}}
        idPrefix="t"
      />,
    )
    expect(screen.queryByLabelText(/^Date$/i)).not.toBeInTheDocument()

    // A date field with a value-carrying op (before) → a date input.
    rerender(
      <ConditionsEditor
        fieldOpts={FIELD_OPTS}
        conditions={conds([{ field: "f-date", op: "before" }])}
        onChange={() => {}}
        idPrefix="t"
      />,
    )
    expect(screen.getByLabelText(/^Date$/i)).toBeInTheDocument()
  })
})
