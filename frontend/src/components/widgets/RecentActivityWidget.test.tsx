import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { render, screen, waitFor } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import { RecentActivityWidget } from "./RecentActivityWidget"
import { jsonResponse, stubFetchByRoute } from "@/test/test-utils"

function setup() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <RecentActivityWidget />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

const activityStub = (
  items: {
    project_id: string
    project_title: string
    author_name: string
    body_preview: string
    created_at: string
  }[],
) => ({
  match: (u: string) => u.includes("/api/dashboard/activity/recent"),
  respond: () => jsonResponse({ items }),
})

describe("RecentActivityWidget", () => {
  it("renders one row per item with the project link + author + body", async () => {
    stubFetchByRoute([
      activityStub([
        {
          project_id: "p1",
          project_title: "Demo project",
          author_name: "Jane Doe",
          body_preview: "Initial scoping done.",
          created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
        },
        {
          project_id: "p2",
          project_title: "Other project",
          author_name: "John Smith",
          body_preview: "Site visit scheduled for Thursday.",
          created_at: new Date(
            Date.now() - 3 * 24 * 60 * 60_000,
          ).toISOString(),
        },
      ]),
    ])
    setup()
    await waitFor(() => {
      expect(screen.getByText("Demo project")).toBeInTheDocument()
    })
    expect(screen.getByText("Other project")).toBeInTheDocument()
    expect(
      (screen.getByText("Demo project") as HTMLAnchorElement).getAttribute(
        "href",
      ),
    ).toBe("/projects/p1")
    expect(
      screen.getByText(/initial scoping done/i),
    ).toBeInTheDocument()
  })

  it("renders an Avatar per row using the author name", async () => {
    stubFetchByRoute([
      activityStub([
        {
          project_id: "p1",
          project_title: "Demo project",
          author_name: "Jane Doe",
          body_preview: "Note 1",
          created_at: new Date().toISOString(),
        },
      ]),
    ])
    const { container } = setup()
    await waitFor(() => {
      expect(screen.getByText("Demo project")).toBeInTheDocument()
    })
    // Avatar primitive (4.1) renders initials in a span with title=name
    // and an inline oklch background. Find by title.
    const avatar = container.querySelector('span[title="Jane Doe"]')
    expect(avatar).not.toBeNull()
    // Initials: "JD".
    expect(avatar?.textContent).toBe("JD")
  })

  it("renders the empty state when there is no recent activity", async () => {
    stubFetchByRoute([activityStub([])])
    setup()
    await waitFor(() => {
      expect(screen.getByText(/nothing recent/i)).toBeInTheDocument()
    })
  })
})
