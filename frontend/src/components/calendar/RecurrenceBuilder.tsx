import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import type { RecurrenceConfig, RecurrenceEnd } from "@/lib/recurrence"
import { recurrenceSummary } from "@/lib/recurrence"

// Weekday labels: 0=Mon … 6=Sun (dateutil convention)
const WEEKDAYS = [
  { label: "Mon", value: 0 },
  { label: "Tue", value: 1 },
  { label: "Wed", value: 2 },
  { label: "Thu", value: 3 },
  { label: "Fri", value: 4 },
  { label: "Sat", value: 5 },
  { label: "Sun", value: 6 },
]

const NTH_POS = [
  { label: "1st", value: 1 },
  { label: "2nd", value: 2 },
  { label: "3rd", value: 3 },
  { label: "4th", value: 4 },
  { label: "5th", value: 5 },
  { label: "Last", value: -1 },
]

function defaultConfig(freq: RecurrenceConfig["freq"]): RecurrenceConfig {
  return {
    freq,
    interval: 1,
    byweekday: freq === "weekly" ? [0] : undefined,
    monthly_mode: freq === "monthly" ? "day_of_month" : undefined,
    bymonthday: freq === "monthly" ? 1 : undefined,
    end: { mode: "never" },
  }
}

type Props = {
  value: RecurrenceConfig | null
  onChange: (cfg: RecurrenceConfig | null) => void
}

export function RecurrenceBuilder({ value, onChange }: Props) {
  const freq = value?.freq ?? null

  // ── Frequency select ───────────────────────────────────────────────────────
  function handleFreqChange(f: string) {
    if (f === "none") {
      onChange(null)
      return
    }
    const newFreq = f as RecurrenceConfig["freq"]
    onChange(defaultConfig(newFreq))
  }

  // ── Interval ───────────────────────────────────────────────────────────────
  function handleIntervalChange(raw: string) {
    if (!value) return
    const n = Math.max(1, parseInt(raw, 10) || 1)
    onChange({ ...value, interval: n })
  }

  // ── Weekday checkboxes (weekly) ────────────────────────────────────────────
  function handleWeekdayToggle(wd: number, checked: boolean) {
    if (!value) return
    const current = value.byweekday ?? []
    const next = checked ? [...current, wd].sort((a, b) => a - b) : current.filter((d) => d !== wd)
    onChange({ ...value, byweekday: next })
  }

  // ── Monthly mode select ────────────────────────────────────────────────────
  function handleMonthlyModeChange(mode: string) {
    if (!value) return
    if (mode === "day_of_month") {
      onChange({ ...value, monthly_mode: "day_of_month", bymonthday: value.bymonthday ?? 1, bysetpos: undefined, byweekday_nth: undefined })
    } else {
      onChange({ ...value, monthly_mode: "nth_weekday", bysetpos: 1, byweekday_nth: 0, bymonthday: undefined })
    }
  }

  function handleByMonthdayChange(raw: string) {
    if (!value) return
    const n = Math.min(31, Math.max(1, parseInt(raw, 10) || 1))
    onChange({ ...value, bymonthday: n })
  }

  function handleBySetposChange(pos: string) {
    if (!value) return
    onChange({ ...value, bysetpos: parseInt(pos, 10) })
  }

  function handleByWeekdayNthChange(wd: string) {
    if (!value) return
    onChange({ ...value, byweekday_nth: parseInt(wd, 10) })
  }

  // ── End condition ──────────────────────────────────────────────────────────
  function handleEndModeChange(mode: string) {
    if (!value) return
    let end: RecurrenceEnd
    if (mode === "never") end = { mode: "never" }
    else if (mode === "until") end = { mode: "until", until: "" }
    else end = { mode: "count", count: 1 }
    onChange({ ...value, end })
  }

  function handleUntilChange(until: string) {
    if (!value) return
    onChange({ ...value, end: { mode: "until", until } })
  }

  function handleCountChange(raw: string) {
    if (!value) return
    const n = Math.max(1, parseInt(raw, 10) || 1)
    onChange({ ...value, end: { mode: "count", count: n } })
  }

  return (
    <div className="space-y-3">
      {/* Frequency */}
      <div className="flex items-center gap-2">
        <Label className="w-20 shrink-0">Repeats</Label>
        <Select value={freq ?? "none"} onValueChange={handleFreqChange}>
          <SelectTrigger size="sm" className="w-36">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">None</SelectItem>
            <SelectItem value="daily">Daily</SelectItem>
            <SelectItem value="weekly">Weekly</SelectItem>
            <SelectItem value="monthly">Monthly</SelectItem>
            <SelectItem value="yearly">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {value && (
        <>
          {/* Interval */}
          <div className="flex items-center gap-2">
            <Label className="w-20 shrink-0">Every</Label>
            <Input
              type="number"
              min={1}
              value={value.interval}
              onChange={(e) => handleIntervalChange(e.target.value)}
              className="h-8 w-20"
            />
            <span className="text-sm text-muted-foreground">
              {value.freq === "daily" ? "day(s)" : value.freq === "weekly" ? "week(s)" : value.freq === "monthly" ? "month(s)" : "year(s)"}
            </span>
          </div>

          {/* Weekday checkboxes */}
          {value.freq === "weekly" && (
            <div className="flex items-center gap-2 flex-wrap">
              <Label className="w-20 shrink-0">On</Label>
              <div className="flex gap-2 flex-wrap">
                {WEEKDAYS.map((wd) => (
                  <label key={wd.value} className="flex items-center gap-1 text-sm cursor-pointer">
                    <Checkbox
                      checked={(value.byweekday ?? []).includes(wd.value)}
                      onCheckedChange={(checked) => handleWeekdayToggle(wd.value, !!checked)}
                    />
                    {wd.label}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Monthly mode */}
          {value.freq === "monthly" && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Label className="w-20 shrink-0">Mode</Label>
                <Select
                  value={value.monthly_mode ?? "day_of_month"}
                  onValueChange={handleMonthlyModeChange}
                >
                  <SelectTrigger size="sm" className="w-44">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="day_of_month">Day of month</SelectItem>
                    <SelectItem value="nth_weekday">Nth weekday</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {value.monthly_mode === "day_of_month" || !value.monthly_mode ? (
                <div className="flex items-center gap-2">
                  <Label className="w-20 shrink-0">Day</Label>
                  <Input
                    type="number"
                    min={1}
                    max={31}
                    value={value.bymonthday ?? 1}
                    onChange={(e) => handleByMonthdayChange(e.target.value)}
                    className="h-8 w-20"
                  />
                </div>
              ) : (
                <div className="flex items-center gap-2 flex-wrap">
                  <Label className="w-20 shrink-0">On the</Label>
                  <Select
                    value={String(value.bysetpos ?? 1)}
                    onValueChange={handleBySetposChange}
                  >
                    <SelectTrigger size="sm" className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {NTH_POS.map((p) => (
                        <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={String(value.byweekday_nth ?? 0)}
                    onValueChange={handleByWeekdayNthChange}
                  >
                    <SelectTrigger size="sm" className="w-24">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {WEEKDAYS.map((wd) => (
                        <SelectItem key={wd.value} value={String(wd.value)}>{wd.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          )}

          {/* End condition */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="w-20 shrink-0">Ends</Label>
              <Select value={value.end.mode} onValueChange={handleEndModeChange}>
                <SelectTrigger size="sm" className="w-36">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="never">Never</SelectItem>
                  <SelectItem value="until">On date</SelectItem>
                  <SelectItem value="count">After N times</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {value.end.mode === "until" && (
              <div className="flex items-center gap-2">
                <Label className="w-20 shrink-0">Until</Label>
                <Input
                  type="date"
                  value={value.end.until}
                  onChange={(e) => handleUntilChange(e.target.value)}
                  className="h-8 w-44"
                />
              </div>
            )}

            {value.end.mode === "count" && (
              <div className="flex items-center gap-2">
                <Label className="w-20 shrink-0">Times</Label>
                <Input
                  type="number"
                  min={1}
                  value={value.end.count}
                  onChange={(e) => handleCountChange(e.target.value)}
                  className="h-8 w-20"
                />
              </div>
            )}
          </div>

          {/* Live summary caption */}
          <p className="text-xs text-muted-foreground">{recurrenceSummary(value)}</p>
        </>
      )}
    </div>
  )
}
