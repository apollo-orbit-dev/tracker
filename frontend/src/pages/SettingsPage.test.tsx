import { render, screen } from "@testing-library/react"
import { MemoryRouter } from "react-router"
import { describe, expect, it } from "vitest"

import { SettingsPage } from "./SettingsPage"
import { SidebarProvider } from "@/components/ui/sidebar"
import { TopbarProvider } from "@/components/topbar/TopbarContext"

describe("SettingsPage", () => {
  it("renders the page title and a coming-soon card", () => {
    render(
      <MemoryRouter>
        <SidebarProvider>
          <TopbarProvider>
            <SettingsPage />
          </TopbarProvider>
        </SidebarProvider>
      </MemoryRouter>,
    )
    expect(
      screen.getByRole("heading", { name: "User Settings", level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByText(/coming soon/i)).toBeInTheDocument()
  })
})
