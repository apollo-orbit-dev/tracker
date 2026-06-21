/**
 * Tests for FieldConfigSheet — specifically that the "Maps to" dropdown is
 * filtered by type compatibility:
 *   - currency field → only "amount" (currency target) is offered
 *   - long_text field → only "description" (text target) is offered
 *   - short_text field → only "description" (text target) is offered
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

import { FieldConfigSheet } from "./FieldConfigSheet"
import { jsonResponse, stubFetchByRoute } from "@/test/test-utils"
import type { FormField } from "@/api/forms"

// ── Shared fixture data ────────────────────────────────────────────────────────

const COR_TARGETS = {
  targets: {
    cor: {
      label: "Change order",
      requires_project: true,
      fields: [
        { key: "description", label: "Description", type: "long_text" },
        { key: "amount", label: "Amount", type: "currency" },
      ],
    },
  },
  field_type_map: {
    short_text: "text",
    long_text: "text",
    integer: "number",
    decimal: "number",
    currency: "currency",
    date: "date",
    single_select: "select",
    boolean: "toggle",
  },
}

function makeField(overrides: Partial<FormField> = {}): FormField {
  return {
    id: "field-0001-0001-0001-000000000001",
    form_id: "form-0001-0001-0001-000000000001",
    label: "Test field",
    field_type: "short_text",
    required: false,
    help_text: null,
    placeholder: null,
    options: null,
    order_index: 0,
    target_key: null,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  }
}

function setup(field: FormField, targetEntity: string | null = "cor") {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  stubFetchByRoute([
    {
      match: (u) => u.includes("/api/forms/targets"),
      respond: () => jsonResponse(COR_TARGETS),
    },
    {
      match: (u) => u.includes("/api/forms"),
      respond: () => jsonResponse({ detail: "stub" }, 200),
    },
  ])

  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FieldConfigSheet
          formId="form-0001-0001-0001-000000000001"
          field={field}
          targetEntity={targetEntity}
          open={true}
          onOpenChange={() => {}}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe("FieldConfigSheet — OptionsEditor stable keys", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("after deleting the middle option, remaining inputs show original values", async () => {
    const user = userEvent.setup()
    setup(
      makeField({
        field_type: "single_select",
        label: "Priority",
        options: { choices: ["Alpha", "Beta", "Gamma"] },
      }),
    )

    // Wait for inputs to render
    await waitFor(() => {
      expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue("Beta")).toBeInTheDocument()
    expect(screen.getByDisplayValue("Gamma")).toBeInTheDocument()

    // Find all "Remove option" buttons — the middle one (index 1) deletes "Beta"
    const removeButtons = screen.getAllByRole("button", { name: /remove option/i })
    expect(removeButtons).toHaveLength(3)
    await user.click(removeButtons[1])

    // After deleting "Beta", only "Alpha" and "Gamma" should remain
    await waitFor(() => {
      expect(screen.queryByDisplayValue("Beta")).not.toBeInTheDocument()
    })
    expect(screen.getByDisplayValue("Alpha")).toBeInTheDocument()
    expect(screen.getByDisplayValue("Gamma")).toBeInTheDocument()

    // Exactly 2 choice inputs should remain
    const remaining = screen.getAllByRole("button", { name: /remove option/i })
    expect(remaining).toHaveLength(2)
  })
})

describe("FieldConfigSheet — Maps to filtering", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("shows only 'amount' in the Maps to dropdown for a currency field", async () => {
    const user = userEvent.setup()
    setup(makeField({ field_type: "currency", label: "Amount" }))

    // Wait for the sheet to render
    await waitFor(() => {
      expect(screen.getByLabelText(/maps to/i)).toBeInTheDocument()
    })

    // Open the Maps to select
    await user.click(screen.getByLabelText(/maps to/i))

    // "Amount" target should appear
    await waitFor(() => {
      expect(screen.getByRole("option", { name: /amount/i })).toBeInTheDocument()
    })

    // "Description" target must NOT appear (it's a text/long_text target, incompatible with currency)
    expect(
      screen.queryByRole("option", { name: /description/i }),
    ).not.toBeInTheDocument()
  })

  it("shows only 'description' in the Maps to dropdown for a long_text field", async () => {
    const user = userEvent.setup()
    setup(makeField({ field_type: "long_text", label: "Notes" }))

    await waitFor(() => {
      expect(screen.getByLabelText(/maps to/i)).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText(/maps to/i))

    // "Description" target should appear (long_text → text, description is long_text)
    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /description/i }),
      ).toBeInTheDocument()
    })

    // "Amount" target must NOT appear (it's currency, incompatible with long_text)
    expect(
      screen.queryByRole("option", { name: /amount/i }),
    ).not.toBeInTheDocument()
  })

  it("shows only 'description' in the Maps to dropdown for a short_text field", async () => {
    const user = userEvent.setup()
    setup(makeField({ field_type: "short_text", label: "Title" }))

    await waitFor(() => {
      expect(screen.getByLabelText(/maps to/i)).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText(/maps to/i))

    await waitFor(() => {
      expect(
        screen.getByRole("option", { name: /description/i }),
      ).toBeInTheDocument()
    })

    // currency target not shown
    expect(
      screen.queryByRole("option", { name: /amount/i }),
    ).not.toBeInTheDocument()
  })

  it("shows no targets when target entity is null", async () => {
    const user = userEvent.setup()
    setup(makeField({ field_type: "currency" }), null)

    await waitFor(() => {
      expect(screen.getByLabelText(/maps to/i)).toBeInTheDocument()
    })

    await user.click(screen.getByLabelText(/maps to/i))

    // Neither description nor amount should appear when no entity
    await waitFor(() => {
      // Only the "collect only" option should be present
      expect(screen.getByRole("option", { name: /collect only/i })).toBeInTheDocument()
    })
    expect(
      screen.queryByRole("option", { name: /amount/i }),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByRole("option", { name: /description/i }),
    ).not.toBeInTheDocument()
  })
})

describe("FieldConfigSheet — dropdown option editing (#3 regression)", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it("keeps focus while typing in an option (no per-keystroke remount)", async () => {
    const user = userEvent.setup()
    setup(
      makeField({
        field_type: "single_select",
        options: { choices: ["Alpha", "Beta"] },
      }),
    )
    const input = await screen.findByDisplayValue("Alpha")
    input.focus()
    // Type several chars in one go. Before the fix, the first keystroke
    // remounted the input (new row id) and dropped focus, so the rest were lost.
    await user.type(input, "XYZ")
    expect(screen.getByDisplayValue("AlphaXYZ")).toBeInTheDocument()
  })
})
