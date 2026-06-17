import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import { PageHeader } from "./PageHeader"
import { SidebarProvider } from "@/components/ui/sidebar"

function wrap(ui: React.ReactNode) {
  return (
    <MemoryRouter>
      <SidebarProvider>{ui}</SidebarProvider>
    </MemoryRouter>
  )
}

describe("PageHeader", () => {
  it("renders the title", () => {
    render(wrap(<PageHeader title="Project Admin" />))
    expect(
      screen.getByRole("heading", { name: "Project Admin", level: 1 }),
    ).toBeInTheDocument()
  })

  it("renders crumbs as links when provided", () => {
    render(
      wrap(
        <PageHeader
          title="Departments"
          crumbs={[{ label: "Admin", to: "/admin" }]}
        />,
      ),
    )
    expect(screen.getByRole("link", { name: "Admin" })).toHaveAttribute(
      "href",
      "/admin",
    )
  })

  it("renders the actions slot", () => {
    render(
      wrap(
        <PageHeader
          title="Projects"
          actions={<button type="button">+ New project</button>}
        />,
      ),
    )
    expect(
      screen.getByRole("button", { name: "+ New project" }),
    ).toBeInTheDocument()
  })
})
