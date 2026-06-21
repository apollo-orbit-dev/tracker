import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { MonthGrid } from "./MonthGrid"
import type { CalendarItem, CalendarHolidayItem } from "@/api/calendar"
import type { CalendarEventItem } from "@/api/events"

function mk(n: number, date: string): CalendarItem {
  return {
    type: "milestone", id: `m${n}`, date, name: `MS ${n}`, direction: "outbound",
    completed: false, actual_date: null, project_id: "p", project_title: "P",
  }
}

describe("MonthGrid", () => {
  it("renders a day's items and a +N more overflow", () => {
    // MAX_PER_CELL is 4, so 6 items → shows 4 chips + "+2 more"
    const items = [1, 2, 3, 4, 5, 6].map((n) => mk(n, "2026-07-10"))
    render(<MonthGrid month={new Date("2026-07-15")} items={items} holidays={[]} events={[]} onSelect={vi.fn()} onEventSelect={vi.fn()} />)
    expect(screen.getByText("MS 1")).toBeInTheDocument()
    expect(screen.getByText("+2 more")).toBeInTheDocument()
  })

  it("renders the project title as secondary text on a chip", () => {
    const items = [mk(1, "2026-07-10")]
    render(<MonthGrid month={new Date("2026-07-15")} items={items} holidays={[]} events={[]} onSelect={vi.fn()} onEventSelect={vi.fn()} />)
    // The project_title "P" should appear in the chip as secondary text
    expect(screen.getAllByText("P").length).toBeGreaterThan(0)
  })

  it("renders a holiday label as non-clickable day context", () => {
    const holidays: CalendarHolidayItem[] = [
      { type: "holiday", date: "2026-07-04", name: "Independence Day", country: "US" },
    ]
    const onSelect = vi.fn()
    render(<MonthGrid month={new Date("2026-07-15")} items={[]} holidays={holidays} events={[]} onSelect={onSelect} onEventSelect={vi.fn()} />)
    const label = screen.getByText("Independence Day")
    expect(label).toBeInTheDocument()
    // it is not a button (holidays don't open the detail sheet)
    expect(label.closest("button")).toBeNull()
  })

  it("renders a custom event chip as a clickable button that calls onEventSelect", async () => {
    const event: CalendarEventItem = {
      type: "event",
      event_id: "e1",
      original_date: "2026-07-06",
      date: "2026-07-06",
      end_date: "2026-07-06",
      title: "Standup",
      description: null,
      all_day: true,
      start_time: null,
      end_time: null,
      about_user_name: null,
      is_recurring: true,
      is_override: false,
    }
    const onEventSelect = vi.fn()
    render(
      <MonthGrid
        month={new Date("2026-07-15")}
        items={[]}
        holidays={[]}
        events={[event]}
        onSelect={vi.fn()}
        onEventSelect={onEventSelect}
      />,
    )
    const chip = screen.getByText("Standup")
    expect(chip).toBeInTheDocument()
    // must be inside a button (clickable, unlike holidays)
    expect(chip.closest("button")).not.toBeNull()
    await userEvent.click(chip.closest("button")!)
    expect(onEventSelect).toHaveBeenCalledWith(event)
  })

  it("renders a multi-day event on every day of its span", async () => {
    const event: CalendarEventItem = {
      type: "event",
      event_id: "ev1",
      original_date: "2026-07-06",
      date: "2026-07-06",
      end_date: "2026-07-08",
      title: "Offsite",
      description: null,
      all_day: true,
      start_time: null,
      end_time: null,
      about_user_name: null,
      is_recurring: false,
      is_override: false,
    }
    const onEventSelect = vi.fn()
    render(
      <MonthGrid
        month={new Date("2026-07-15")}
        items={[]}
        holidays={[]}
        events={[event]}
        onSelect={vi.fn()}
        onEventSelect={onEventSelect}
      />,
    )
    // The event title should appear on Jul 6, Jul 7, AND Jul 8 — three chips total
    const chips = screen.getAllByText("Offsite")
    expect(chips).toHaveLength(3)
    // Each chip must be inside a button
    for (const chip of chips) {
      expect(chip.closest("button")).not.toBeNull()
    }
    // Clicking any chip passes the same original event item
    await userEvent.click(chips[0].closest("button")!)
    expect(onEventSelect).toHaveBeenCalledWith(event)
    await userEvent.click(chips[1].closest("button")!)
    expect(onEventSelect).toHaveBeenCalledWith(event)
    await userEvent.click(chips[2].closest("button")!)
    expect(onEventSelect).toHaveBeenCalledWith(event)
  })

  it("renders a single-day event (end_date == date) exactly once", () => {
    const event: CalendarEventItem = {
      type: "event",
      event_id: "ev2",
      original_date: "2026-07-10",
      date: "2026-07-10",
      end_date: "2026-07-10",
      title: "One-day Meeting",
      description: null,
      all_day: true,
      start_time: null,
      end_time: null,
      about_user_name: null,
      is_recurring: false,
      is_override: false,
    }
    render(
      <MonthGrid
        month={new Date("2026-07-15")}
        items={[]}
        holidays={[]}
        events={[event]}
        onSelect={vi.fn()}
        onEventSelect={vi.fn()}
      />,
    )
    expect(screen.getAllByText("One-day Meeting")).toHaveLength(1)
  })

  it("calls onDayClick with the yyyy-MM-dd string when a day cell is clicked", async () => {
    const onDayClick = vi.fn()
    render(
      <MonthGrid
        month={new Date("2026-07-15")}
        items={[]}
        holidays={[]}
        events={[]}
        onSelect={vi.fn()}
        onEventSelect={vi.fn()}
        onDayClick={onDayClick}
      />,
    )
    // Find the "15" day number label and click its containing cell
    const dayNumber = screen.getByText("15")
    const cell = dayNumber.closest("div[data-day]") ?? dayNumber.parentElement?.parentElement
    await userEvent.click(cell!)
    expect(onDayClick).toHaveBeenCalledWith("2026-07-15")
  })

  it("day cells are not clickable when onDayClick is omitted (e.g. viewers)", async () => {
    render(
      <MonthGrid
        month={new Date("2026-07-15")}
        items={[]}
        holidays={[]}
        events={[]}
        onSelect={vi.fn()}
        onEventSelect={vi.fn()}
      />,
    )
    const cell = screen.getByText("15").closest("div[data-day]") as HTMLElement
    // No clickable affordance, and clicking is a no-op (does not throw).
    expect(cell.className).toContain("cursor-default")
    expect(cell.className).not.toContain("cursor-pointer")
    await userEvent.click(cell)
  })

  it("clicking an event chip does NOT call onDayClick (stopPropagation)", async () => {
    const onDayClick = vi.fn()
    const onEventSelect = vi.fn()
    const event: CalendarEventItem = {
      type: "event",
      event_id: "e-stop",
      original_date: "2026-07-15",
      date: "2026-07-15",
      end_date: "2026-07-15",
      title: "StopPropTest",
      description: null,
      all_day: true,
      start_time: null,
      end_time: null,
      about_user_name: null,
      is_recurring: false,
      is_override: false,
    }
    render(
      <MonthGrid
        month={new Date("2026-07-15")}
        items={[]}
        holidays={[]}
        events={[event]}
        onSelect={vi.fn()}
        onEventSelect={onEventSelect}
        onDayClick={onDayClick}
      />,
    )
    const chip = screen.getByText("StopPropTest")
    await userEvent.click(chip.closest("button")!)
    expect(onEventSelect).toHaveBeenCalledWith(event)
    expect(onDayClick).not.toHaveBeenCalled()
  })

  it("clicking a milestone/assignment chip does NOT call onDayClick (stopPropagation)", async () => {
    const onDayClick = vi.fn()
    const onSelect = vi.fn()
    const item = mk(7, "2026-07-15")
    render(
      <MonthGrid
        month={new Date("2026-07-15")}
        items={[item]}
        holidays={[]}
        events={[]}
        onSelect={onSelect}
        onEventSelect={vi.fn()}
        onDayClick={onDayClick}
      />,
    )
    await userEvent.click(screen.getByText("MS 7").closest("button")!)
    expect(onSelect).toHaveBeenCalledWith(item)
    expect(onDayClick).not.toHaveBeenCalled()
  })
})
