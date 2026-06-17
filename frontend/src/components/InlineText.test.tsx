import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { InlineText } from "@/components/InlineText"

describe("InlineText", () => {
  it("renders the value as a button in display state", () => {
    const onCommit = vi.fn()
    render(<InlineText value="Hello" onCommit={onCommit} ariaLabel="Test" />)
    const btn = screen.getByRole("button", { name: "Test" })
    expect(btn).toHaveTextContent("Hello")
  })

  it("clicks to enter edit mode and commits on Enter", async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<InlineText value="Hello" onCommit={onCommit} ariaLabel="Test" />)

    await user.click(screen.getByRole("button", { name: "Test" }))
    const input = screen.getByRole("textbox") as HTMLInputElement
    expect(input).toHaveValue("Hello")

    await user.clear(input)
    await user.type(input, "World{Enter}")
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("World")
  })

  it("commits on blur with the typed value", async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <>
        <InlineText value="Hello" onCommit={onCommit} ariaLabel="Test" />
        <button type="button">elsewhere</button>
      </>,
    )
    await user.click(screen.getByRole("button", { name: "Test" }))
    const input = screen.getByRole("textbox")
    await user.clear(input)
    await user.type(input, "Blurred")
    await user.click(screen.getByRole("button", { name: "elsewhere" }))
    expect(onCommit).toHaveBeenCalledExactlyOnceWith("Blurred")
  })

  it("cancels on Esc without firing onCommit", async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<InlineText value="Hello" onCommit={onCommit} ariaLabel="Test" />)
    await user.click(screen.getByRole("button", { name: "Test" }))
    const input = screen.getByRole("textbox")
    await user.type(input, "abandoned{Escape}")
    expect(onCommit).not.toHaveBeenCalled()
    // Display state shows the original value again.
    expect(
      screen.getByRole("button", { name: "Test" }),
    ).toHaveTextContent("Hello")
  })

  it("skips onCommit when the value didn't change", async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(<InlineText value="Hello" onCommit={onCommit} ariaLabel="Test" />)
    await user.click(screen.getByRole("button", { name: "Test" }))
    // Press Enter without changing anything.
    await user.keyboard("{Enter}")
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("renders as plain text when disabled", async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <InlineText value="Hello" onCommit={onCommit} disabled ariaLabel="Test" />,
    )
    expect(screen.queryByRole("button")).not.toBeInTheDocument()
    expect(screen.getByText("Hello")).toBeInTheDocument()
    // Clicking the text shouldn't open an input — there's no role to click,
    // so just confirm the input never appeared.
    await user.click(screen.getByText("Hello"))
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(onCommit).not.toHaveBeenCalled()
  })

  it("renders a textarea in multiline mode and commits on Cmd+Enter only", async () => {
    const user = userEvent.setup()
    const onCommit = vi.fn()
    render(
      <InlineText
        value="Line"
        onCommit={onCommit}
        multiline
        ariaLabel="Notes"
      />,
    )
    await user.click(screen.getByRole("button", { name: "Notes" }))
    const ta = screen.getByRole("textbox") as HTMLTextAreaElement
    expect(ta.tagName).toBe("TEXTAREA")
    // Bare Enter should insert a newline, not commit.
    await user.type(ta, " 2{Enter}Line 3")
    expect(onCommit).not.toHaveBeenCalled()
    // Cmd+Enter commits.
    await user.keyboard("{Meta>}{Enter}{/Meta}")
    expect(onCommit).toHaveBeenCalledTimes(1)
    expect(onCommit.mock.calls[0][0]).toContain("Line 3")
  })
})
