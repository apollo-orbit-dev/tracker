import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  TopbarProvider,
  useTopbarContext,
} from "@/components/topbar/TopbarContext"
import { useTopbarCrumbs } from "@/hooks/useTopbarCrumbs"

function CrumbReader() {
  const { crumbs } = useTopbarContext()
  return (
    <span data-testid="crumbs">
      {crumbs.map((c) => c.label).join("/")}
    </span>
  )
}

function PageA() {
  useTopbarCrumbs([{ label: "A" }])
  return <span data-testid="page-a">A mounted</span>
}

function PageB() {
  useTopbarCrumbs([{ label: "B" }, { label: "Sub" }])
  return <span data-testid="page-b">B mounted</span>
}

describe("useTopbarCrumbs", () => {
  it("publishes crumbs on mount", () => {
    render(
      <TopbarProvider>
        <CrumbReader />
        <PageA />
      </TopbarProvider>,
    )
    expect(screen.getByTestId("crumbs").textContent).toBe("A")
  })

  it("clears crumbs on unmount", () => {
    const { rerender } = render(
      <TopbarProvider>
        <CrumbReader />
        <PageA />
      </TopbarProvider>,
    )
    expect(screen.getByTestId("crumbs").textContent).toBe("A")
    rerender(
      <TopbarProvider>
        <CrumbReader />
      </TopbarProvider>,
    )
    expect(screen.getByTestId("crumbs").textContent).toBe("")
  })

  it("supports multi-crumb arrays", () => {
    render(
      <TopbarProvider>
        <CrumbReader />
        <PageB />
      </TopbarProvider>,
    )
    expect(screen.getByTestId("crumbs").textContent).toBe("B/Sub")
  })
})
