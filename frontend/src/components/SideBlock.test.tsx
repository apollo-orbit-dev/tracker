import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { SideBlock, SideRow } from "./SideBlock"

describe("SideBlock", () => {
  it("renders the uppercase label and children", () => {
    render(
      <SideBlock label="Properties">
        <p>Body</p>
      </SideBlock>,
    )
    expect(
      screen.getByRole("heading", { name: /properties/i }),
    ).toHaveClass("uppercase")
    expect(screen.getByText("Body")).toBeInTheDocument()
  })

  it("renders an action slot in the header when provided", () => {
    render(
      <SideBlock label="Contacts" action={<button>+ Add</button>}>
        <p>Body</p>
      </SideBlock>,
    )
    expect(screen.getByRole("button", { name: "+ Add" })).toBeInTheDocument()
  })
})

describe("SideRow", () => {
  it("renders label and value", () => {
    render(<SideRow label="Project #">25756601</SideRow>)
    expect(screen.getByText("Project #")).toBeInTheDocument()
    expect(screen.getByText("25756601")).toBeInTheDocument()
  })
})
