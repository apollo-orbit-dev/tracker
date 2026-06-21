/**
 * ReviewSheet tests.
 *
 * Covers:
 *  1. Pending submission: mapped values render as editable inputs seeded from
 *     submission.values.
 *  2. "Approve & push" button issues POST .../approve with edited final_values,
 *     target_project_id, cor_number, cor_status.
 *  3. "Reject" flow: entering a note and clicking "Confirm reject" issues
 *     POST .../reject with {review_note}.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { MemoryRouter } from "react-router"
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest"

import { ReviewSheet } from "./ReviewSheet"
import { jsonResponse, stubFetchByRoute } from "@/test/test-utils"
import type { Form, Submission } from "@/api/forms"

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FORM_ID = "form-c4-0001-0001-000000000001"
const FIELD_TEXT_ID = "field-c4-text-0001-000000000001"
const FIELD_NUM_ID = "field-c4-num-0001-000000000002"
const SID = "sub-c4-0001-0001-0001-000000000001"
const PROJECT_ID = "proj-c4-0001-0001-0001-000000000001"

const BASE_FIELD_PROPS = {
  form_id: FORM_ID,
  help_text: null,
  placeholder: null,
  options: null,
  target_key: null,
  created_at: "2026-01-01T00:00:00Z",
}

const TEST_FORM: Form = {
  id: FORM_ID,
  department_id: "dept-0001",
  name: "Test COR Form",
  description: null,
  target_entity: "cor",
  status: "active",
  created_by: "user-0001",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  fields: [
    {
      ...BASE_FIELD_PROPS,
      id: FIELD_TEXT_ID,
      label: "Description",
      field_type: "short_text",
      required: true,
      order_index: 0,
    },
    {
      ...BASE_FIELD_PROPS,
      id: FIELD_NUM_ID,
      label: "Cost",
      field_type: "currency",
      required: false,
      order_index: 1,
    },
  ],
}

const PENDING_SUBMISSION: Submission = {
  id: SID,
  form_id: FORM_ID,
  submitted_by: "user-submitter-0001",
  submitted_by_name: "Sam Submitter",
  values: {
    [FIELD_TEXT_ID]: "Initial description",
    [FIELD_NUM_ID]: 1500,
  },
  target_project_id: PROJECT_ID,
  status: "pending",
  reviewed_by: null,
  reviewed_by_name: null,
  reviewed_at: null,
  review_note: null,
  pushed_entity_type: null,
  pushed_entity_id: null,
  created_at: "2026-06-20T00:00:00Z",
  updated_at: "2026-06-20T00:00:00Z",
  proposed_changes: [],
}

const APPROVED_SUBMISSION: Submission = {
  ...PENDING_SUBMISSION,
  status: "approved",
  reviewed_by: "user-reviewer-0001",
  reviewed_by_name: "Rita Reviewer",
  reviewed_at: "2026-06-20T01:00:00Z",
  review_note: null,
  pushed_entity_type: "cor",
  pushed_entity_id: "cor-0001",
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

const APPROVE_RESPONSE: Submission = {
  ...PENDING_SUBMISSION,
  status: "approved",
}

const REJECT_RESPONSE: Submission = {
  ...PENDING_SUBMISSION,
  status: "rejected",
}

// ── Setup helper ──────────────────────────────────────────────────────────────

function setup(
  sub: Submission,
  extraHandlers: Parameters<typeof stubFetchByRoute>[0] = [],
  form: Form = TEST_FORM,
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })

  const fetchMock = stubFetchByRoute([
    {
      match: (u) => u.includes(`/api/forms/${FORM_ID}`) && !u.includes("/submissions"),
      respond: () => jsonResponse(form),
    },
    {
      match: (u) => u.includes(`/api/forms/${FORM_ID}/submissions/${SID}`) && !u.includes("/approve") && !u.includes("/reject"),
      respond: () => jsonResponse(sub),
    },
    {
      match: (u) => u.includes("/api/projects"),
      respond: () => jsonResponse(PROJECTS_RESPONSE),
    },
    ...extraHandlers,
  ])

  const onOpenChange = vi.fn()

  const utils = render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <ReviewSheet
          formId={FORM_ID}
          sid={SID}
          open={true}
          onOpenChange={onOpenChange}
        />
      </MemoryRouter>
    </QueryClientProvider>,
  )

  return { ...utils, fetchMock, onOpenChange }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("ReviewSheet — pending submission: seeded editable inputs", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it("renders mapped field values as editable inputs seeded from submission.values", async () => {
    setup(PENDING_SUBMISSION)

    // Text field seeded with initial value
    await waitFor(() => {
      const input = screen.getByDisplayValue("Initial description")
      expect(input).toBeInTheDocument()
    })

    // Currency field seeded with numeric value (rendered as string)
    expect(screen.getByDisplayValue("1500")).toBeInTheDocument()
  })

  it("allows editing the seeded field values", async () => {
    const user = userEvent.setup()
    setup(PENDING_SUBMISSION)

    await waitFor(() => {
      expect(screen.getByDisplayValue("Initial description")).toBeInTheDocument()
    })

    const textInput = screen.getByDisplayValue("Initial description")
    await user.clear(textInput)
    await user.type(textInput, "Updated description")

    await waitFor(() => {
      expect(screen.getByDisplayValue("Updated description")).toBeInTheDocument()
    })
  })
})

describe("ReviewSheet — General (collect-only) form", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  const GENERAL_FORM: Form = { ...TEST_FORM, target_entity: null, name: "Feedback" }

  it("hides COR fields and approves with null cor_number/target_project_id", async () => {
    const { fetchMock } = setup(
      PENDING_SUBMISSION,
      [
        {
          match: (u) => u.includes("/approve"),
          respond: () => jsonResponse({ ...PENDING_SUBMISSION, status: "approved" }),
        },
      ],
      GENERAL_FORM,
    )

    // Approve button (labelled just "Approve" for a General form) appears.
    const approve = await screen.findByRole("button", { name: /^approve$/i })
    // No COR-specific inputs for a collect-only form.
    expect(screen.queryByLabelText(/COR number/i)).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/COR status/i)).not.toBeInTheDocument()
    expect(approve).toBeEnabled()

    await userEvent.click(approve)

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        ([u, init]) => String(u).includes("/approve") && init?.method === "POST",
      )
      const init = call?.[1]
      expect(init?.body).toBeTruthy()
      const body = JSON.parse(init!.body as string)
      expect(body.cor_number).toBeNull()
      expect(body.target_project_id).toBeNull()
    })
  })
})

describe("ReviewSheet — Approve & push", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it("issues POST .../approve with final_values, target_project_id, cor_number, cor_status on click", async () => {
    const user = userEvent.setup()
    const { fetchMock } = setup(PENDING_SUBMISSION, [
      {
        match: (u, init) =>
          u.includes(`/api/forms/${FORM_ID}/submissions/${SID}/approve`) &&
          init?.method === "POST",
        respond: () => jsonResponse(APPROVE_RESPONSE),
      },
    ])

    // Wait for fields to load
    await waitFor(() => {
      expect(screen.getByDisplayValue("Initial description")).toBeInTheDocument()
    })

    // Fill in COR number (required)
    const corNumberInput = screen.getByLabelText(/cor number/i)
    await user.type(corNumberInput, "COR-001")

    // "Approve & push" should now be enabled (project already set from sub, COR number filled, no numeric errors)
    await waitFor(() => {
      const btn = screen.getByRole("button", { name: /approve & push/i })
      expect(btn).not.toBeDisabled()
    })

    await user.click(screen.getByRole("button", { name: /approve & push/i }))

    // Verify the POST was called with the correct body
    await waitFor(() => {
      const approveCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes(`/submissions/${SID}/approve`) &&
          (init as RequestInit)?.method === "POST",
      )
      expect(approveCall).toBeDefined()

      const body = JSON.parse((approveCall![1] as RequestInit).body as string)
      // final_values should include the seeded values (coerced to proper types)
      expect(body.final_values).toMatchObject({
        [FIELD_TEXT_ID]: "Initial description",
        [FIELD_NUM_ID]: 1500,
      })
      expect(body.target_project_id).toBe(PROJECT_ID)
      expect(body.cor_number).toBe("COR-001")
      expect(body.cor_status).toBe("submitted") // default
    })
  })

  it("Approve & push is disabled when cor_number is empty", async () => {
    setup(PENDING_SUBMISSION)

    await waitFor(() => {
      expect(screen.getByDisplayValue("Initial description")).toBeInTheDocument()
    })

    // Don't fill COR number — button should remain disabled
    const btn = screen.getByRole("button", { name: /approve & push/i })
    expect(btn).toBeDisabled()
  })

  it("Approve & push is disabled when cor_number has internal spaces", async () => {
    const user = userEvent.setup()
    setup(PENDING_SUBMISSION)

    await waitFor(() => {
      expect(screen.getByDisplayValue("Initial description")).toBeInTheDocument()
    })

    // Fill COR number with internal space (e.g. "COR 001")
    const corNumberInput = screen.getByLabelText(/cor number/i)
    await user.type(corNumberInput, "COR 001")

    // Approve button should remain disabled
    const btn = screen.getByRole("button", { name: /approve & push/i })
    expect(btn).toBeDisabled()

    // Error message should display
    await waitFor(() => {
      expect(screen.getByText(/required, no spaces, max 32 chars/i)).toBeInTheDocument()
    })
  })

  it("Approve & push is enabled when cor_number has no whitespace", async () => {
    const user = userEvent.setup()
    setup(PENDING_SUBMISSION)

    await waitFor(() => {
      expect(screen.getByDisplayValue("Initial description")).toBeInTheDocument()
    })

    // Fill COR number with hyphens, no spaces
    const corNumberInput = screen.getByLabelText(/cor number/i)
    await user.type(corNumberInput, "COR-001")

    // Approve button should be enabled (project already set, no numeric errors)
    const btn = screen.getByRole("button", { name: /approve & push/i })
    await waitFor(() => {
      expect(btn).not.toBeDisabled()
    })

    // Error message should NOT display
    expect(screen.queryByText(/required, no spaces, max 32 chars/i)).not.toBeInTheDocument()
  })
})

describe("ReviewSheet — Reject", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it("issues POST .../reject with {review_note} on confirm", async () => {
    const user = userEvent.setup()
    const { fetchMock } = setup(PENDING_SUBMISSION, [
      {
        match: (u, init) =>
          u.includes(`/api/forms/${FORM_ID}/submissions/${SID}/reject`) &&
          init?.method === "POST",
        respond: () => jsonResponse(REJECT_RESPONSE),
      },
    ])

    // Wait for submission to load
    await waitFor(() => {
      expect(screen.getByDisplayValue("Initial description")).toBeInTheDocument()
    })

    // Click "Reject…" to show the reject form
    const rejectBtn = screen.getByRole("button", { name: /reject…/i })
    await user.click(rejectBtn)

    // Type a rejection note
    const noteTextarea = screen.getByLabelText(/rejection note/i)
    await user.type(noteTextarea, "Not enough detail provided")

    // Confirm the rejection
    await user.click(screen.getByRole("button", { name: /confirm reject/i }))

    // Verify the POST was called with the correct body
    await waitFor(() => {
      const rejectCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          String(url).includes(`/submissions/${SID}/reject`) &&
          (init as RequestInit)?.method === "POST",
      )
      expect(rejectCall).toBeDefined()

      const body = JSON.parse((rejectCall![1] as RequestInit).body as string)
      expect(body.review_note).toBe("Not enough detail provided")
    })
  })
})

describe("ReviewSheet — already-reviewed submission", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it("shows read-only outcome view for an approved submission", async () => {
    setup(APPROVED_SUBMISSION)

    await waitFor(() => {
      // Review outcome heading should appear
      expect(screen.getByText(/review outcome/i)).toBeInTheDocument()
    })

    // No approve/reject buttons in read-only mode
    expect(screen.queryByRole("button", { name: /approve & push/i })).not.toBeInTheDocument()
    expect(screen.queryByRole("button", { name: /reject/i })).not.toBeInTheDocument()

    // Should show reviewer (display name) and pushed entity
    expect(screen.getByText(/Rita Reviewer/)).toBeInTheDocument()
    // ...and the target project the submission was for.
    expect(screen.getByText(/P-001 — Alpha Project/)).toBeInTheDocument()
  })
})

// ── Assignment target (Phase 20.2) ──────────────────────────────────────────────

const ASSIGNMENT_FORM: Form = {
  ...TEST_FORM,
  name: "Task form",
  target_entity: "assignment",
  fields: [
    {
      ...BASE_FIELD_PROPS,
      id: FIELD_TEXT_ID,
      label: "Description",
      field_type: "long_text",
      required: true,
      order_index: 0,
      target_key: "description",
    },
  ],
}

const ELIGIBLE_RESPONSE = {
  items: [
    { id: "user-elig-1", email: "a@x.com", display_name: "Ann Assignee" },
    { id: "user-elig-2", email: "b@x.com", display_name: "Ben Builder" },
  ],
  total: 2,
}

describe("ReviewSheet — assignment target", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  function renderAssignment() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const fetchMock = stubFetchByRoute([
      {
        match: (u) => u.includes(`/api/forms/${FORM_ID}`) && !u.includes("/submissions"),
        respond: () => jsonResponse(ASSIGNMENT_FORM),
      },
      {
        match: (u) => u.includes(`/api/forms/${FORM_ID}/submissions/${SID}`) && !u.includes("/approve") && !u.includes("/reject"),
        respond: () => jsonResponse(PENDING_SUBMISSION),
      },
      // eligible-users must be matched BEFORE the generic /api/projects handler.
      {
        match: (u) => u.includes("/assignments/eligible-users"),
        respond: () => jsonResponse(ELIGIBLE_RESPONSE),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: () => jsonResponse(PROJECTS_RESPONSE),
      },
    ])
    const onOpenChange = vi.fn()
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ReviewSheet formId={FORM_ID} sid={SID} open onOpenChange={onOpenChange} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    return { fetchMock, onOpenChange }
  }

  it("renders an assignee picker and gates approval until an assignee is chosen", async () => {
    renderAssignment()

    // The assignment approve CTA, and the assignee control, are present.
    await waitFor(() => {
      expect(screen.getByText("Assignee")).toBeInTheDocument()
    })
    // The assignee picker is a searchable combobox (#21.7).
    expect(
      screen.getByRole("combobox", { name: /select an assignee|pick a project/i }),
    ).toBeInTheDocument()
    const approve = screen.getByRole("button", { name: /approve & push/i })
    expect(approve).toHaveTextContent(/approve & create/i)
    // No assignee chosen yet → approval is disabled.
    expect(approve).toBeDisabled()
    // COR-only controls are absent for an assignment form.
    expect(screen.queryByLabelText(/COR number/i)).not.toBeInTheDocument()
  })
})

// ── Milestone target (Phase 20.3) ───────────────────────────────────────────────

const MILESTONE_FORM: Form = {
  ...TEST_FORM,
  name: "New milestone",
  target_entity: "milestone",
  fields: [
    {
      ...BASE_FIELD_PROPS,
      id: FIELD_TEXT_ID,
      label: "Name",
      field_type: "short_text",
      required: true,
      order_index: 0,
      target_key: "name",
    },
  ],
}

describe("ReviewSheet — milestone target", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  function renderMilestone() {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    stubFetchByRoute([
      {
        match: (u) => u.includes(`/api/forms/${FORM_ID}`) && !u.includes("/submissions"),
        respond: () => jsonResponse(MILESTONE_FORM),
      },
      {
        match: (u) => u.includes(`/api/forms/${FORM_ID}/submissions/${SID}`) && !u.includes("/approve") && !u.includes("/reject"),
        respond: () => jsonResponse(PENDING_SUBMISSION),
      },
      {
        match: (u) => u.includes("/api/projects"),
        respond: () => jsonResponse(PROJECTS_RESPONSE),
      },
    ])
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ReviewSheet formId={FORM_ID} sid={SID} open onOpenChange={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
  }

  it("renders direction + date-model selects and gates approval on direction", async () => {
    renderMilestone()
    await waitFor(() => {
      expect(screen.getByLabelText("Direction")).toBeInTheDocument()
    })
    expect(screen.getByLabelText("Date model")).toBeInTheDocument()
    const approve = screen.getByRole("button", { name: /approve & push/i })
    expect(approve).toHaveTextContent(/approve & create/i)
    // No direction chosen yet → disabled (date model defaults to planned_actual).
    expect(approve).toBeDisabled()
    // COR-only controls absent.
    expect(screen.queryByLabelText(/COR number/i)).not.toBeInTheDocument()
  })
})

// ── Event target (Phase 20.4) ───────────────────────────────────────────────────

const EVENT_FORM: Form = {
  ...TEST_FORM,
  name: "New event",
  target_entity: "event",
  fields: [
    {
      ...BASE_FIELD_PROPS,
      id: FIELD_TEXT_ID,
      label: "Title",
      field_type: "short_text",
      required: true,
      order_index: 0,
      target_key: "title",
    },
  ],
}

describe("ReviewSheet — event target", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it("offers Approve & create with no project picker or COR/assignee controls", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    stubFetchByRoute([
      {
        match: (u) => u.includes(`/api/forms/${FORM_ID}`) && !u.includes("/submissions"),
        respond: () => jsonResponse(EVENT_FORM),
      },
      {
        match: (u) => u.includes(`/api/forms/${FORM_ID}/submissions/${SID}`) && !u.includes("/approve") && !u.includes("/reject"),
        respond: () => jsonResponse({ ...PENDING_SUBMISSION, target_project_id: null }),
      },
      { match: (u) => u.includes("/api/projects"), respond: () => jsonResponse(PROJECTS_RESPONSE) },
    ])
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ReviewSheet formId={FORM_ID} sid={SID} open onOpenChange={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const approve = await screen.findByRole("button", { name: /approve & push/i })
    expect(approve).toHaveTextContent(/approve & create/i)
    expect(approve).not.toBeDisabled() // no project/approval-time gating for events
    expect(screen.queryByLabelText("Target project")).not.toBeInTheDocument()
    expect(screen.queryByLabelText("Assignee")).not.toBeInTheDocument()
    expect(screen.queryByLabelText(/COR number/i)).not.toBeInTheDocument()
  })
})

// ── Intake target (Phase 20.5) ──────────────────────────────────────────────────

const INTAKE_FORM: Form = {
  ...TEST_FORM,
  name: "Project intake",
  target_entity: "intake",
  target_template_id: "tmpl-intake-0001",
  fields: [
    {
      ...BASE_FIELD_PROPS,
      id: FIELD_TEXT_ID,
      label: "Project title",
      field_type: "short_text",
      required: true,
      order_index: 0,
      target_key: "title",
    },
  ],
}

describe("ReviewSheet — intake target", () => {
  beforeEach(() => vi.restoreAllMocks())
  afterEach(() => vi.unstubAllGlobals())

  it("requires a valid project number and offers Approve & create (no project picker)", async () => {
    const user = userEvent.setup()
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    stubFetchByRoute([
      {
        match: (u) => u.includes(`/api/forms/${FORM_ID}`) && !u.includes("/submissions"),
        respond: () => jsonResponse(INTAKE_FORM),
      },
      {
        match: (u) => u.includes(`/api/forms/${FORM_ID}/submissions/${SID}`) && !u.includes("/approve") && !u.includes("/reject"),
        respond: () => jsonResponse({ ...PENDING_SUBMISSION, target_project_id: null }),
      },
      { match: (u) => u.includes("/api/projects"), respond: () => jsonResponse(PROJECTS_RESPONSE) },
    ])
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <ReviewSheet formId={FORM_ID} sid={SID} open onOpenChange={vi.fn()} />
        </MemoryRouter>
      </QueryClientProvider>,
    )
    const numberInput = await screen.findByLabelText("Project number")
    const approve = screen.getByRole("button", { name: /approve & push/i })
    expect(approve).toHaveTextContent(/approve & create/i)
    // No project number yet → disabled.
    expect(approve).toBeDisabled()
    // No target-project picker for intake (it creates a new project).
    expect(screen.queryByLabelText("Target project")).not.toBeInTheDocument()
    // A valid number enables approval.
    await user.type(numberInput, "PRJ-2026-001")
    await waitFor(() => expect(approve).not.toBeDisabled())
  })
})
