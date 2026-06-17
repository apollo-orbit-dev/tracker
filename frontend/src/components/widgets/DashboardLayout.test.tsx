import { DndContext } from "@dnd-kit/core"
import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import { DashboardLayout, type LayoutWidget } from "./DashboardLayout"

function widget(
  id: string,
  width: 1 | 2,
  column: 0 | 1,
  order_index: number,
): LayoutWidget {
  return {
    id,
    width,
    column,
    order_index,
    title: id,
  }
}

function renderTestWidget(w: LayoutWidget) {
  return (
    <div key={w.id} data-testid={`w-${w.id}`} style={{ height: 40 }}>
      {w.title}
    </div>
  )
}

function renderInDnd(ui: React.ReactNode) {
  return render(<DndContext onDragEnd={() => {}}>{ui}</DndContext>)
}

describe("DashboardLayout", () => {
  it("renders an empty layout with no children when given no widgets", () => {
    const { container } = renderInDnd(
      <DashboardLayout
        widgets={[]}
        customizing={false}
        renderWidget={renderTestWidget}
      />,
    )
    expect(container.querySelectorAll("[data-testid^='w-']")).toHaveLength(0)
  })

  it("renders 4 half-width widgets split 2/2 between columns", () => {
    renderInDnd(
      <DashboardLayout
        widgets={[
          widget("a", 1, 0, 0),
          widget("b", 1, 1, 1),
          widget("c", 1, 0, 2),
          widget("d", 1, 1, 3),
        ]}
        customizing={false}
        renderWidget={renderTestWidget}
      />,
    )
    expect(screen.getByTestId("w-a")).toBeInTheDocument()
    expect(screen.getByTestId("w-b")).toBeInTheDocument()
    expect(screen.getByTestId("w-c")).toBeInTheDocument()
    expect(screen.getByTestId("w-d")).toBeInTheDocument()
  })

  it("groups half-width widgets around a full-width barrier into two runs", () => {
    // Widgets: [a(half,c0), b(full), c(half,c0)]. b is its own block; a and c
    // are in separate runs (so c renders in column 0 of a new run).
    const { container } = renderInDnd(
      <DashboardLayout
        widgets={[
          widget("a", 1, 0, 0),
          widget("b", 2, 0, 1),
          widget("c", 1, 0, 2),
        ]}
        customizing={false}
        renderWidget={renderTestWidget}
      />,
    )
    // Top-level child count: 3 (run-a, full-b, run-c).
    // container.firstChild is the DndContext wrapper's outer div; find the
    // DashboardLayout root via its data-testid-free first child.
    const root = container.firstChild as HTMLElement
    expect(root.children).toHaveLength(3)
  })

  it("renders an empty-column placeholder in customize mode only", () => {
    renderInDnd(
      <DashboardLayout
        widgets={[
          widget("a", 1, 0, 0),
          widget("c", 1, 0, 1),
          widget("e", 1, 0, 2),
        ]}
        customizing={true}
        renderWidget={renderTestWidget}
      />,
    )
    expect(screen.getByText(/drop here/i)).toBeInTheDocument()
  })

  it("hides the empty-column placeholder when customize mode is off", () => {
    renderInDnd(
      <DashboardLayout
        widgets={[widget("a", 1, 0, 0), widget("c", 1, 0, 1)]}
        customizing={false}
        renderWidget={renderTestWidget}
      />,
    )
    expect(screen.queryByText(/drop here/i)).not.toBeInTheDocument()
  })
})
