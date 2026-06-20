import { describe, expect, it, vi } from "vitest"
import { screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { EventScopeDialog } from "./EventScopeDialog"
import { renderWithProviders } from "@/test/test-utils"

describe("EventScopeDialog", () => {
  it("renders both scope buttons when open with action=delete", () => {
    renderWithProviders(
      <EventScopeDialog
        open
        action="delete"
        onOpenChange={() => {}}
        onThisOccurrence={() => {}}
        onEntireSeries={() => {}}
      />,
    )
    expect(screen.getByRole("button", { name: /this occurrence/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /entire series/i })).toBeInTheDocument()
  })

  it("calls onThisOccurrence when 'This occurrence' is clicked", async () => {
    const user = userEvent.setup()
    const onThisOccurrence = vi.fn()
    renderWithProviders(
      <EventScopeDialog
        open
        action="delete"
        onOpenChange={() => {}}
        onThisOccurrence={onThisOccurrence}
        onEntireSeries={() => {}}
      />,
    )
    await user.click(screen.getByRole("button", { name: /this occurrence/i }))
    expect(onThisOccurrence).toHaveBeenCalledTimes(1)
  })

  it("calls onEntireSeries when 'Entire series' is clicked", async () => {
    const user = userEvent.setup()
    const onEntireSeries = vi.fn()
    renderWithProviders(
      <EventScopeDialog
        open
        action="delete"
        onOpenChange={() => {}}
        onThisOccurrence={() => {}}
        onEntireSeries={onEntireSeries}
      />,
    )
    await user.click(screen.getByRole("button", { name: /entire series/i }))
    expect(onEntireSeries).toHaveBeenCalledTimes(1)
  })

  it("renders edit-flavored copy and fires callbacks when action=edit", async () => {
    const user = userEvent.setup()
    const onThisOccurrence = vi.fn()
    const onEntireSeries = vi.fn()
    renderWithProviders(
      <EventScopeDialog
        open
        action="edit"
        onOpenChange={() => {}}
        onThisOccurrence={onThisOccurrence}
        onEntireSeries={onEntireSeries}
      />,
    )
    // Edit-flavored title copy (not "Delete")
    expect(screen.getByText(/edit recurring event/i)).toBeInTheDocument()
    // Both scope buttons present
    expect(screen.getByRole("button", { name: /this occurrence/i })).toBeInTheDocument()
    expect(screen.getByRole("button", { name: /entire series/i })).toBeInTheDocument()
    // Callbacks fire correctly
    await user.click(screen.getByRole("button", { name: /this occurrence/i }))
    expect(onThisOccurrence).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole("button", { name: /entire series/i }))
    expect(onEntireSeries).toHaveBeenCalledTimes(1)
  })
})
