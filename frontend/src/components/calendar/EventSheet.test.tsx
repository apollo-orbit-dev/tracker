import { describe, expect, it, afterEach, beforeEach } from "vitest"
import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { vi } from "vitest"

import { EventSheet } from "./EventSheet"
import { jsonResponse, renderWithProviders, stubFetchByRoute } from "@/test/test-utils"
import type { EventSeries } from "@/api/events"

const DEPT_ID = "00000000-0000-0000-0000-000000000001"
const EVENT_ID = "00000000-0000-0000-0000-000000000002"
const OCCURRENCE_DATE = "2026-07-13"

const RECURRING_ITEM: EventSeries = {
  id: EVENT_ID,
  title: "Weekly standup",
  description: null,
  all_day: true,
  start_time: null,
  end_time: null,
  about_user_id: null,
  about_user_name: null,
  department_id: DEPT_ID,
  start_date: "2026-07-06",
  end_date: null,
  recurrence: {
    freq: "weekly",
    interval: 1,
    byweekday: [0], // Monday
    end: { mode: "never" },
  },
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
}

const MULTIDAY_ITEM: EventSeries = {
  ...RECURRING_ITEM,
  end_date: "2026-07-10",
}

describe("EventSheet", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("renders the New event title, a Title field, and the RecurrenceBuilder frequency control", () => {
    stubFetchByRoute([
      {
        // Stub any eligible-user or users fetch that might be triggered
        match: (u) => u.includes("/api/"),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
    ])
    renderWithProviders(
      <EventSheet
        open
        onOpenChange={() => {}}
        departmentId={DEPT_ID}
      />,
    )
    // Sheet title
    expect(screen.getByText("New event")).toBeInTheDocument()
    // Title field label
    expect(screen.getByLabelText("Title")).toBeInTheDocument()
    // RecurrenceBuilder renders a "Repeats" label with a frequency select
    expect(screen.getByText("Repeats")).toBeInTheDocument()
  })

  it("occurrence-edit submit issues PUT to /api/events/{id}/occurrences/{date}, not a series PATCH", async () => {
    const user = userEvent.setup()

    // Track captured requests (URL + method + raw body) to assert on later
    const capturedRequests: { url: string; method: string; body: string | undefined }[] = []

    const fetchStub = stubFetchByRoute([
      {
        // PUT occurrence override
        match: (u, init) =>
          u.includes(`/api/events/${EVENT_ID}/occurrences/${OCCURRENCE_DATE}`) &&
          (init?.method ?? "GET") === "PUT",
        respond: (u, init) => {
          capturedRequests.push({
            url: u,
            method: init?.method ?? "GET",
            body: typeof init?.body === "string" ? init.body : undefined,
          })
          // Return a minimal CalendarEventItem shape
          return jsonResponse({
            type: "event",
            event_id: EVENT_ID,
            original_date: OCCURRENCE_DATE,
            date: OCCURRENCE_DATE,
            end_date: OCCURRENCE_DATE,
            title: "Updated standup",
            description: null,
            all_day: true,
            start_time: null,
            end_time: null,
            about_user_name: null,
            is_recurring: true,
            is_override: true,
          })
        },
      },
      {
        // Catch-all for any other API calls (query invalidation, etc.)
        match: (u) => u.includes("/api/"),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
    ])

    const onOpenChange = vi.fn()

    renderWithProviders(
      <EventSheet
        open
        onOpenChange={onOpenChange}
        departmentId={DEPT_ID}
        item={RECURRING_ITEM}
        occurrenceDate={OCCURRENCE_DATE}
      />,
    )

    // Verify we are in occurrence-edit mode
    expect(screen.getByText("Edit this occurrence")).toBeInTheDocument()

    // The start_date field must NOT be rendered in occurrence mode
    expect(screen.queryByLabelText("Start date")).not.toBeInTheDocument()

    // Change the title
    const titleInput = screen.getByLabelText("Title")
    await user.clear(titleInput)
    await user.type(titleInput, "Updated standup")

    // Submit the form
    await user.click(screen.getByRole("button", { name: /save changes/i }))

    // Wait for the PUT to fire
    await waitFor(() => {
      expect(capturedRequests.length).toBeGreaterThan(0)
    })

    // Assert PUT was made to the occurrence endpoint
    const putCall = capturedRequests.find(
      (r) =>
        r.url.includes(`/api/events/${EVENT_ID}/occurrences/${OCCURRENCE_DATE}`) &&
        r.method === "PUT",
    )
    expect(putCall).toBeDefined()

    // Assert the request body uses override_* field names (not bare field names).
    // This is the regression guard: Pydantic uses extra="ignore", so sending bare
    // keys (title, description, …) would silently produce a no-op override.
    const parsedBody = JSON.parse(putCall!.body ?? "{}")
    expect(parsedBody).toHaveProperty("override_title", "Updated standup")
    // Bare "title" key must NOT be present — if it is, the backend ignores it
    expect(parsedBody).not.toHaveProperty("title")

    // Assert no PATCH was made (which would mean the series path was taken)
    const patchCall = (fetchStub.mock.calls as [string, RequestInit?][]).find(
      ([, init]) => (init?.method ?? "GET") === "PATCH",
    )
    expect(patchCall).toBeUndefined()
  })

  it("requests about-user-options with the departmentId and populates the picker", async () => {
    const USER_ID = "00000000-0000-0000-0000-000000000099"
    const fetchStub = stubFetchByRoute([
      {
        match: (u) => u.includes("/api/events/about-user-options"),
        respond: () =>
          jsonResponse({
            items: [{ id: USER_ID, email: "alice@x.com", display_name: "Alice" }],
            total: 1,
          }),
      },
      {
        match: (u) => u.includes("/api/"),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
    ])

    renderWithProviders(
      <EventSheet
        open
        onOpenChange={() => {}}
        departmentId={DEPT_ID}
      />,
    )

    // Wait for the about-user-options fetch to fire
    await waitFor(() => {
      const aboutUserCall = (fetchStub.mock.calls as [string, RequestInit?][]).find(
        ([u]) => u.includes("/api/events/about-user-options"),
      )
      expect(aboutUserCall).toBeDefined()
      const calledUrl = aboutUserCall![0]
      expect(calledUrl).toContain(`department_id=${DEPT_ID}`)
    })

    // The picker button should now render (not disabled / loading)
    // and show the placeholder since no value is selected
    expect(screen.getByRole("combobox", { name: /select a user/i })).toBeInTheDocument()
  })

  it("series-edit pre-fills the Start date field from the item", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.includes("/api/events/about-user-options"),
        response: () => jsonResponse({ items: [], total: 0 }),
      },
    ])

    renderWithProviders(
      <EventSheet
        open
        onOpenChange={() => {}}
        departmentId={DEPT_ID}
        item={RECURRING_ITEM}
      />,
    )

    const startDate = await screen.findByLabelText("Start date")
    expect((startDate as HTMLInputElement).value).toBe("2026-07-06")
  })

  it("series-edit pre-fills the End date field from item.end_date", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.includes("/api/"),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
    ])

    renderWithProviders(
      <EventSheet
        open
        onOpenChange={() => {}}
        departmentId={DEPT_ID}
        item={MULTIDAY_ITEM}
      />,
    )

    const endDate = await screen.findByLabelText("End date (optional)")
    expect((endDate as HTMLInputElement).value).toBe("2026-07-10")
  })

  it("create with start_date + end_date sends end_date in the POST body", async () => {
    const user = userEvent.setup()

    const capturedRequests: { url: string; method: string; body: string | undefined }[] = []

    stubFetchByRoute([
      {
        match: (u, init) => u.includes("/api/events") && (init?.method ?? "GET") === "POST",
        respond: (u, init) => {
          capturedRequests.push({
            url: u,
            method: init?.method ?? "GET",
            body: typeof init?.body === "string" ? init.body : undefined,
          })
          return jsonResponse({
            id: EVENT_ID,
            title: "PTO",
            description: null,
            all_day: true,
            start_time: null,
            end_time: null,
            about_user_id: null,
            about_user_name: null,
            department_id: DEPT_ID,
            start_date: "2026-07-07",
            end_date: "2026-07-11",
            recurrence: null,
            created_at: "2026-06-01T00:00:00Z",
            updated_at: "2026-06-01T00:00:00Z",
          })
        },
      },
      {
        match: (u) => u.includes("/api/"),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
    ])

    renderWithProviders(
      <EventSheet
        open
        onOpenChange={() => {}}
        departmentId={DEPT_ID}
      />,
    )

    expect(screen.getByText("New event")).toBeInTheDocument()

    // Fill in title
    await user.clear(screen.getByLabelText("Title"))
    await user.type(screen.getByLabelText("Title"), "PTO")

    // Fill in start_date
    await user.type(screen.getByLabelText("Start date"), "2026-07-07")

    // Fill in end_date
    await user.type(screen.getByLabelText("End date (optional)"), "2026-07-11")

    await user.click(screen.getByRole("button", { name: /create event/i }))

    await waitFor(() => {
      expect(capturedRequests.length).toBeGreaterThan(0)
    })

    const postCall = capturedRequests.find((r) => r.method === "POST")
    expect(postCall).toBeDefined()
    const body = JSON.parse(postCall!.body ?? "{}")
    expect(body).toHaveProperty("end_date", "2026-07-11")
  })

  it("create mode with initialStartDate pre-fills the Start date field", async () => {
    stubFetchByRoute([
      {
        match: (u) => u.includes("/api/"),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
    ])

    renderWithProviders(
      <EventSheet
        open
        onOpenChange={() => {}}
        departmentId={DEPT_ID}
        initialStartDate="2026-08-03"
      />,
    )

    const startDate = await screen.findByLabelText("Start date")
    expect((startDate as HTMLInputElement).value).toBe("2026-08-03")
  })

  it("blocks submit when end_date is before start_date and shows an error", async () => {
    const user = userEvent.setup()

    const capturedPosts: unknown[] = []

    stubFetchByRoute([
      {
        match: (u, init) => u.includes("/api/events") && (init?.method ?? "GET") === "POST",
        respond: () => {
          capturedPosts.push(true)
          return jsonResponse({}, 200)
        },
      },
      {
        match: (u) => u.includes("/api/"),
        respond: () => jsonResponse({ items: [], total: 0 }),
      },
    ])

    renderWithProviders(
      <EventSheet
        open
        onOpenChange={() => {}}
        departmentId={DEPT_ID}
      />,
    )

    await user.type(screen.getByLabelText("Title"), "Bad span")
    await user.type(screen.getByLabelText("Start date"), "2026-07-10")
    await user.type(screen.getByLabelText("End date (optional)"), "2026-07-05")

    await user.click(screen.getByRole("button", { name: /create event/i }))

    // No POST should have fired
    expect(capturedPosts.length).toBe(0)

    // Error message must be visible
    expect(
      await screen.findByText("End date must be on or after the start date"),
    ).toBeInTheDocument()
  })
})
