import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { Badge } from "./Badge"

describe("Badge", () => {
  it("renders children text", () => {
    render(<Badge>Active</Badge>)
    expect(screen.getByText("Active")).toBeInTheDocument()
  })

  it("applies the slate tone classes by default", () => {
    render(<Badge>Draft</Badge>)
    expect(screen.getByText("Draft")).toHaveClass(
      "bg-[hsl(var(--tone-slate-bg))]",
    )
  })

  it("applies the requested tone", () => {
    render(<Badge tone="emerald">Active</Badge>)
    expect(screen.getByText("Active")).toHaveClass(
      "bg-[hsl(var(--tone-emerald-bg))]",
    )
  })

  it("renders a dot when dot=true", () => {
    const { container } = render(
      <Badge tone="amber" dot>
        Pending
      </Badge>,
    )
    // The dot is an aria-hidden span sibling of the text.
    const dot = container.querySelector(
      '[aria-hidden="true"].bg-\\[hsl\\(var\\(--tone-amber-dot\\)\\)\\]',
    )
    expect(dot).toBeTruthy()
  })

  it("omits the dot when dot is not set", () => {
    const { container } = render(<Badge tone="rose">Cancelled</Badge>)
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull()
  })
})
