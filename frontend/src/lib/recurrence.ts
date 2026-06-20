export type RecurrenceEnd =
  | { mode: "never" } | { mode: "until"; until: string } | { mode: "count"; count: number }

export type RecurrenceConfig = {
  freq: "daily" | "weekly" | "monthly" | "yearly"
  interval: number
  byweekday?: number[]
  monthly_mode?: "day_of_month" | "nth_weekday"
  bymonthday?: number
  bysetpos?: number
  byweekday_nth?: number
  end: RecurrenceEnd
}

const WD = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const POS: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", 5: "5th", [-1]: "last" }

export function recurrenceSummary(cfg: RecurrenceConfig): string {
  const every = cfg.interval > 1 ? `every ${cfg.interval} ` : "every "
  let base: string
  if (cfg.freq === "daily") base = `${every}day${cfg.interval > 1 ? "s" : ""}`
  else if (cfg.freq === "weekly") {
    const days = (cfg.byweekday ?? []).map((d) => WD[d]).join(", ") || "—"
    base = `${every}week${cfg.interval > 1 ? "s" : ""} on ${days}`
  } else if (cfg.freq === "monthly") {
    base = cfg.monthly_mode === "nth_weekday"
      ? `monthly on the ${POS[cfg.bysetpos ?? 1]} ${WD[cfg.byweekday_nth ?? 0]}`
      : `monthly on day ${cfg.bymonthday ?? 1}`
  } else base = `${every}year${cfg.interval > 1 ? "s" : ""}`
  const end = cfg.end.mode === "count" ? `, ${cfg.end.count} times`
    : cfg.end.mode === "until" ? `, until ${cfg.end.until}` : ""
  return base + end
}
