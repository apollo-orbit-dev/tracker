import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { InlineField } from "./InlineField"
import type { FieldDef } from "@/api/templates"

function fd(field_type: string, over: Partial<FieldDef> = {}): FieldDef {
  return {
    id: "f1",
    template_id: "t1",
    name: "My Field",
    field_type,
    required: false,
    is_project_metric: false,
    order_index: 0,
    options: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    deleted_at: null,
    ...over,
  }
}

describe("InlineField", () => {
  it("renders read-only text (no edit control) for a viewer", () => {
    render(
      <InlineField field={fd("short_text")} value="Hello" canEdit={false} onCommit={vi.fn()} />,
    )
    expect(screen.getByText("Hello")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("renders a muted placeholder for an empty value", () => {
    render(
      <InlineField field={fd("short_text")} value={null} canEdit={false} onCommit={vi.fn()} />,
    )
    expect(screen.getByText("Not set")).toBeInTheDocument()
  })

  it("renders auto_number read-only even when editable", () => {
    render(<InlineField field={fd("auto_number")} value={42} canEdit onCommit={vi.fn()} />)
    expect(screen.getByText("42")).toBeInTheDocument()
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
  })

  it("commits an inline text edit on Enter", () => {
    const onCommit = vi.fn()
    render(<InlineField field={fd("short_text")} value="Old" canEdit onCommit={onCommit} />)
    fireEvent.click(screen.getByRole("button"))
    const input = screen.getByRole("textbox")
    fireEvent.change(input, { target: { value: "New" } })
    fireEvent.keyDown(input, { key: "Enter" })
    expect(onCommit).toHaveBeenCalledWith("New")
  })

  it("cancels an inline edit on Escape without committing", () => {
    const onCommit = vi.fn()
    render(<InlineField field={fd("short_text")} value="Old" canEdit onCommit={onCommit} />)
    fireEvent.click(screen.getByRole("button"))
    const input = screen.getByRole("textbox")
    fireEvent.change(input, { target: { value: "New" } })
    fireEvent.keyDown(input, { key: "Escape" })
    expect(onCommit).not.toHaveBeenCalled()
    expect(screen.getByText("Old")).toBeInTheDocument()
  })

  it("does not commit when the value is unchanged", () => {
    const onCommit = vi.fn()
    render(<InlineField field={fd("short_text")} value="Old" canEdit onCommit={onCommit} />)
    fireEvent.click(screen.getByRole("button"))
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Enter" })
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("edits a compound type via a popover with explicit Save", () => {
    const onCommit = vi.fn()
    render(<InlineField field={fd("boolean")} value={false} canEdit onCommit={onCommit} />)
    // Trigger shows the formatted value, opens the editor popover.
    fireEvent.click(screen.getByRole("button", { name: /No/ }))
    fireEvent.click(screen.getByRole("checkbox"))
    fireEvent.click(screen.getByRole("button", { name: /save/i }))
    expect(onCommit).toHaveBeenCalledWith(true)
  })
})
