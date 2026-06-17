import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"

import { Segmented } from "./Segmented"

describe("Segmented", () => {
  it("renders one tab per option, marks the selected one", () => {
    render(
      <Segmented
        value="b"
        onChange={() => {}}
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
          { value: "c", label: "Gamma" },
        ]}
      />,
    )
    const tabs = screen.getAllByRole("tab")
    expect(tabs).toHaveLength(3)
    expect(tabs[0]).toHaveAttribute("aria-selected", "false")
    expect(tabs[1]).toHaveAttribute("aria-selected", "true")
    expect(tabs[2]).toHaveAttribute("aria-selected", "false")
  })

  it("calls onChange with the option's value when clicked", async () => {
    const onChange = vi.fn()
    render(
      <Segmented
        value="a"
        onChange={onChange}
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
      />,
    )
    await userEvent.click(screen.getByRole("tab", { name: "Beta" }))
    expect(onChange).toHaveBeenCalledWith("b")
  })

  it("supports aria-label on the tablist", () => {
    render(
      <Segmented
        aria-label="Layout mode"
        value="a"
        onChange={() => {}}
        options={[
          { value: "a", label: "Alpha" },
          { value: "b", label: "Beta" },
        ]}
      />,
    )
    expect(screen.getByRole("tablist")).toHaveAttribute(
      "aria-label",
      "Layout mode",
    )
  })
})
