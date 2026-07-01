import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { FilterChecklist } from "./FilterChecklist"

const opts = [
  { id: "a", name: "Alpha" },
  { id: "b", name: "Beta" },
]

describe("FilterChecklist", () => {
  it("adds an option to the selection when toggled on", () => {
    const onChange = vi.fn()
    render(<FilterChecklist label="Departments" options={opts} selected={[]} onChange={onChange} />)
    fireEvent.click(screen.getAllByRole("checkbox")[0])
    expect(onChange).toHaveBeenCalledWith(["a"])
  })

  it("removes an already-selected option when toggled off", () => {
    const onChange = vi.fn()
    render(<FilterChecklist label="Departments" options={opts} selected={["a"]} onChange={onChange} />)
    fireEvent.click(screen.getAllByRole("checkbox")[0])
    expect(onChange).toHaveBeenCalledWith([])
  })

  it("clears the whole selection via Clear", () => {
    const onChange = vi.fn()
    render(<FilterChecklist label="Departments" options={opts} selected={["a", "b"]} onChange={onChange} />)
    fireEvent.click(screen.getByText("Clear"))
    expect(onChange).toHaveBeenCalledWith([])
  })

  it("renders a placeholder when there are no options", () => {
    render(<FilterChecklist label="X" options={[]} selected={[]} onChange={vi.fn()} />)
    expect(screen.getByText("None available")).toBeInTheDocument()
  })
})
