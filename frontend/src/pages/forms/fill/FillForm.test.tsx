/**
 * FillForm tests.
 *
 * Covers:
 *  1. Required field empty → Submit disabled; after filling → enabled.
 *  2. COR-target form: Submit stays disabled until target project is selected.
 *  3. Successful submit issues POST /api/forms/{id}/submissions with the
 *     expected `values` + `target_project_id` body.
 *  4. Numeric guard: invalid non-empty currency value disables Submit and shows
 *     inline error; replacing with a valid number re-enables Submit.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

import { FillForm } from "./FillForm"
import { jsonResponse, stubFetchByRoute } from "@/test/test-utils"
import type { Form } from "@/api/forms"

// ── Shared fixture data ────────────────────────────────────────────────────────

const FORM_ID = "form-0001-0001-0001-000000000001"
const FIELD_ID_REQ = "field-req-0001-0001-000000000001"
const FIELD_ID_OPT = "field-opt-0001-0001-000000000002"
const PROJECT_ID = "proj-0001-0001-0001-000000000001"

const BASE_FIELD = {
  form_id: FORM_ID,
  help_text: null,
  placeholder: null,
  options: null,
  order_index: 0,
  target_key: null,
  created_at: "2026-01-01T00:00:00Z",
}

function makeForm(overrides: Partial<Form> = {}): Form {
  return {
    id: FORM_ID,
    department_id: "dept-0001-0001-0001-000000000001",
    name: "Test Form",
    description: null,
    target_entity: null,
    status: "active",
    created_by: "user-0001",
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    fields: [
      {
        ...BASE_FIELD,
        id: FIELD_ID_REQ,
        label: "Required Field",
        field_type: "short_text",
        required: true,
        order_index: 0,
      },
      {
        ...BASE_FIELD,
        id: FIELD_ID_OPT,
        label: "Optional Field",
        field_type: "short_text",
        required: false,
        order_index: 1,
      },
    ],
    ...overrides,
  }
}

const PROJECTS_RESPONSE = {
  items: [
    {
      id: PROJECT_ID,
      project_number: "P-001",
      client_project_number: null,
      title: "Alpha Project",
      template_id: "tmpl-0001",
      lifecycle_state: "active",
      custom_field_values: {},
      created_by: "user-0001",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      deleted_at: null,
      template_name: "Default",
      template_intersection: "Dept / Client / Discipline",
    },
  ],
  total: 1,
  limit: 200,
  offset: 0,
}

const SUBMISSION_RESPONSE = {
  id: "sub-0001-0001-0001-000000000001",
  form_id: FORM_ID,
  submitted_by: "user-0001",
  values: {},
  target_project_id: null,
  status: "pending",
  reviewed_by: null,
  reviewed_at: null,
  review_note: null,
  pushed_entity_type: null,
  pushed_entity_id: null,
  created_at: "2026-06-20T00:00:00Z",
  updated_at: "2026-06-20T00:00:00Z",
}

function setup(form: Form) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const fetchMock = stubFetchByRoute([
    {
      match: (u) => u.includes("/api/forms/targets"),
      respond: () =>
        jsonResponse({
          targets: {
            cor: { label: "Change order", requires_project: true, fields: [] },
            assignment: { label: "Assignment", requires_project: true, fields: [] },
          },
          field_type_map: {},
        }),
    },
    {
      match: (u) => u.includes("/api/projects"),
      respond: () => jsonResponse(PROJECTS_RESPONSE),
    },
    {
      match: (u) => u.includes(`/api/forms/${FORM_ID}/submissions`),
      respond: () => jsonResponse(SUBMISSION_RESPONSE, 201),
    },
  ])

  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <FillForm form={form} />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { ...utils, fetchMock }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("FillForm — required field guard", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it("Submit is disabled when a required field is empty", async () => {
    setup(makeForm())

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /submit/i })).toBeInTheDocument()
    })

    const submitBtn = screen.getByRole("button", { name: /^submit$/i })
    expect(submitBtn).toBeDisabled()
  })

  it("Submit is enabled after filling the required field", async () => {
    const user = userEvent.setup()
    setup(makeForm())

    // Wait for form to render
    await waitFor(() => {
      expect(screen.getByLabelText(/required field/i)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/required field/i)
    await user.type(input, "some value")

    await waitFor(() => {
      const submitBtn = screen.getByRole("button", { name: /^submit$/i })
      expect(submitBtn).not.toBeDisabled()
    })
  })
})

describe("FillForm — COR target project guard", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it("Submit stays disabled for a COR form until a target project is chosen", async () => {
    const user = userEvent.setup()
    const corForm = makeForm({ target_entity: "cor" })
    setup(corForm)

    // Fill the required field
    await waitFor(() => {
      expect(screen.getByLabelText(/required field/i)).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/required field/i), "hello")

    // Submit should still be disabled (no project selected)
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^submit$/i })).toBeDisabled()
    })

    // Open the project combobox and pick a project
    const trigger = await screen.findByTestId("target-project-trigger")
    await user.click(trigger)

    // Wait for project options to load
    await waitFor(() => {
      expect(screen.getByText("Alpha Project")).toBeInTheDocument()
    })

    // Click the project item
    await user.click(screen.getByText("Alpha Project"))

    // Now submit should be enabled
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^submit$/i })).not.toBeDisabled()
    })

    // #50: the picker can be cleared, which re-disables submit (project required).
    await user.click(screen.getByTestId("target-project-trigger"))
    await user.click(await screen.findByText(/clear selection/i))
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^submit$/i })).toBeDisabled()
    })
  })

  it("shows the target-project picker for an assignment form (not just COR)", async () => {
    // Regression: requiresProject was hardcoded to "cor", so assignment forms
    // had no picker and submit failed with "A target project is required."
    setup(makeForm({ target_entity: "assignment" }))
    expect(await screen.findByTestId("target-project-trigger")).toBeInTheDocument()
  })
})

describe("FillForm — numeric guard", () => {
  const FIELD_ID_CURRENCY = "field-curr-0001-0001-000000000003"

  function makeCurrencyForm(): Form {
    return makeForm({
      fields: [
        {
          ...BASE_FIELD,
          id: FIELD_ID_CURRENCY,
          label: "Cost",
          field_type: "currency",
          required: true,
          order_index: 0,
        },
      ],
    })
  }

  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it("typing non-numeric text in a required currency field keeps Submit disabled and shows an inline error", async () => {
    const user = userEvent.setup()
    setup(makeCurrencyForm())

    await waitFor(() => {
      expect(screen.getByLabelText(/cost/i)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/cost/i)
    await user.type(input, "abc")

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^submit$/i })).toBeDisabled()
    })
    expect(screen.getByText(/enter a valid number/i)).toBeInTheDocument()
  })

  it("replacing invalid currency text with a valid number enables Submit and clears the inline error", async () => {
    const user = userEvent.setup()
    setup(makeCurrencyForm())

    await waitFor(() => {
      expect(screen.getByLabelText(/cost/i)).toBeInTheDocument()
    })

    const input = screen.getByLabelText(/cost/i)
    // Type invalid text first
    await user.type(input, "abc")
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^submit$/i })).toBeDisabled()
    })

    // Clear and type a valid amount
    await user.clear(input)
    await user.type(input, "1500")

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^submit$/i })).not.toBeDisabled()
    })
    expect(screen.queryByText(/enter a valid number/i)).not.toBeInTheDocument()
  })

  it("a non-empty invalid currency value on an OPTIONAL field also disables Submit", async () => {
    const user = userEvent.setup()
    // Form with a required short_text and an optional currency field
    const form = makeForm({
      fields: [
        {
          ...BASE_FIELD,
          id: FIELD_ID_REQ,
          label: "Required Field",
          field_type: "short_text",
          required: true,
          order_index: 0,
        },
        {
          ...BASE_FIELD,
          id: FIELD_ID_CURRENCY,
          label: "Cost",
          field_type: "currency",
          required: false,
          order_index: 1,
        },
      ],
    })
    setup(form)

    await waitFor(() => {
      expect(screen.getByLabelText(/required field/i)).toBeInTheDocument()
    })

    // Fill the required text field
    await user.type(screen.getByLabelText(/required field/i), "hello")

    // Now type invalid text in the optional currency field
    await user.type(screen.getByLabelText(/cost/i), "xyz")

    // Submit must still be disabled even though the required field is filled
    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^submit$/i })).toBeDisabled()
    })
    expect(screen.getByText(/enter a valid number/i)).toBeInTheDocument()
  })
})

describe("FillForm — successful submit", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it("POSTs to /api/forms/{id}/submissions with values and target_project_id", async () => {
    const user = userEvent.setup()
    const corForm = makeForm({ target_entity: "cor" })
    const { fetchMock } = setup(corForm)

    // Fill required field
    await waitFor(() => {
      expect(screen.getByLabelText(/required field/i)).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/required field/i), "test value")

    // Pick a project
    const trigger = await screen.findByTestId("target-project-trigger")
    await user.click(trigger)
    await waitFor(() => {
      expect(screen.getByText("Alpha Project")).toBeInTheDocument()
    })
    await user.click(screen.getByText("Alpha Project"))

    // Submit
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /^submit$/i })
      expect(btn).not.toBeDisabled()
    })
    await user.click(screen.getByRole("button", { name: /^submit$/i }))

    // Verify POST was called with the right body
    await waitFor(() => {
      const postCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes(`/api/forms/${FORM_ID}/submissions`) &&
          (init as RequestInit)?.method === "POST",
      )
      expect(postCall).toBeDefined()

      const body = JSON.parse((postCall![1] as RequestInit).body as string)
      expect(body.values).toEqual({ [FIELD_ID_REQ]: "test value" })
      expect(body.target_project_id).toBe(PROJECT_ID)
    })

    // Success state is shown
    await waitFor(() => {
      expect(screen.getByText(/submitted — pending review/i)).toBeInTheDocument()
    })
  })

  it("shows success state and a 'Submit another' button on successful submit", async () => {
    const user = userEvent.setup()
    const form = makeForm() // no COR target, no project needed

    // Only one required field
    setup(form)

    await waitFor(() => {
      expect(screen.getByLabelText(/required field/i)).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/required field/i), "hello")

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /^submit$/i })).not.toBeDisabled()
    })
    await user.click(screen.getByRole("button", { name: /^submit$/i }))

    await waitFor(() => {
      expect(screen.getByText(/submitted — pending review/i)).toBeInTheDocument()
    })
    expect(screen.getByRole("button", { name: /submit another/i })).toBeInTheDocument()
  })
})
