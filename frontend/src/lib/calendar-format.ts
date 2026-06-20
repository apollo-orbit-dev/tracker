import type { CalendarItem } from "@/api/calendar"

export function calendarItemKey(item: CalendarItem): string {
  return `${item.type}:${item.id}`
}

export function calendarItemLabel(item: CalendarItem): string {
  return item.type === "milestone" ? item.name : item.description
}

// Tailwind classes for the item chip, by type + state.
export function calendarItemColor(item: CalendarItem): string {
  if (item.type === "milestone") {
    return item.completed
      ? "bg-muted text-muted-foreground line-through"
      : "bg-indigo-500/15 text-indigo-700 dark:text-indigo-300"
  }
  return "bg-amber-500/15 text-amber-700 dark:text-amber-300"
}

// Tailwind text/bg color for a small accent dot, by type + state.
export function calendarItemAccent(item: CalendarItem): string {
  if (item.type === "milestone") {
    return item.completed ? "text-muted-foreground" : "text-indigo-500"
  }
  return "text-amber-500"
}

// Tailwind classes for a custom event chip (violet, dark-mode-legible).
export function calendarEventColor(): string {
  return "bg-violet-500/15 text-violet-700 dark:text-violet-300"
}
