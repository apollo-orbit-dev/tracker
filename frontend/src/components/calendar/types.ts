export type CalendarView = "month" | "schedule"

export type CalendarFilters = {
  departmentIds: string[]
  clientIds: string[]
  disciplineIds: string[]
  showMilestones: boolean
  showAssignments: boolean
  showHolidays: boolean
  showEvents: boolean
}
