import { Check, ChevronDown, TriangleAlert } from "lucide-react"
import { useEffect, useMemo, useState } from "react"
import { Link } from "react-router"
import { toast } from "sonner"

import { Badge } from "@/components/Badge"
import { Segmented } from "@/components/Segmented"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  type LookaheadFilter,
  type MilestoneLookaheadItem,
  useMilestoneLookahead,
} from "@/api/dashboard"
import {
  type DashboardWidget,
  useWidgetUpdate,
} from "@/api/dashboard_widgets"
import {
  milestoneOffsetLabel,
  milestoneOffsetTone,
} from "@/lib/milestones"

const PRESETS = [30, 60, 90] as const
const DEFAULT_DAYS = 60
const MIN_DAYS = 1
const MAX_DAYS = 365

function Row({ item }: { item: MilestoneLookaheadItem }) {
  return (
    <li className="flex items-start justify-between gap-3 border-b py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <Link
          to={`/projects/${item.project_id}`}
          className="block truncate text-sm font-medium hover:underline"
        >
          {item.milestone_name}
          {item.ad_hoc && (
            <span className="ml-1 text-[10px] uppercase text-muted-foreground">
              ad-hoc
            </span>
          )}
        </Link>
        <div className="truncate text-xs text-muted-foreground">
          {item.project_title} · {item.direction}
        </div>
      </div>
      <div className="flex flex-col items-end gap-1">
        <Badge tone={milestoneOffsetTone(item.days_offset)}>
          {milestoneOffsetLabel(item.days_offset)}
        </Badge>
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {item.planned_date}
        </span>
      </div>
    </li>
  )
}

/** Pull DCD + future_days out of the saved config. Returns undefined when
 * the config is empty (no filter, no lookahead override). */
function configToFilter(
  widget: DashboardWidget,
): LookaheadFilter | undefined {
  if (!widget.config) return undefined
  const cfg = widget.config as Record<string, unknown>
  const out: LookaheadFilter = {}
  if (typeof cfg.department_id === "string") out.department_id = cfg.department_id
  if (typeof cfg.client_id === "string") out.client_id = cfg.client_id
  if (typeof cfg.discipline_id === "string") out.discipline_id = cfg.discipline_id
  if (typeof cfg.future_days === "number") out.future_days = cfg.future_days
  return Object.keys(out).length ? out : undefined
}

export function MilestoneLookaheadWidget({
  widget,
  dashboardId,
}: {
  widget: DashboardWidget
  dashboardId: string
}) {
  // Optimistic local override. When the user clicks a preset / saves a
  // custom value we flip this immediately so the active button highlight
  // and the dynamic caption respond before the PATCH round-trip. Cleared
  // when the widget prop updates with the new config (success) or when
  // the mutation errors (rollback).
  const [pendingDays, setPendingDays] = useState<number | null | undefined>(
    undefined,
  )

  const savedDays = useMemo(() => configToFilter(widget)?.future_days, [widget])
  const activeDays =
    pendingDays !== undefined
      ? pendingDays ?? DEFAULT_DAYS
      : savedDays ?? DEFAULT_DAYS

  // Build the filter passed to the data hook from the optimistic value so
  // the list refetches at the right window even before the PATCH lands.
  const filter = useMemo<LookaheadFilter | undefined>(() => {
    const base = configToFilter(widget) ?? {}
    const f: LookaheadFilter = { ...base }
    if (pendingDays !== undefined) {
      if (pendingDays === null) {
        delete f.future_days
      } else {
        f.future_days = pendingDays
      }
    }
    return Object.keys(f).length ? f : undefined
  }, [widget, pendingDays])

  const q = useMilestoneLookahead(filter)
  const items = q.data?.items ?? []

  const update = useWidgetUpdate(dashboardId)

  // Reconcile optimistic state with the saved config once the new widget
  // row lands via cache invalidation. If `pendingDays` matches `savedDays`
  // (or both are unset), clear the override.
  useEffect(() => {
    if (
      pendingDays !== undefined &&
      (pendingDays === savedDays ||
        (pendingDays === null && savedDays === undefined))
    ) {
      setPendingDays(undefined)
    }
  }, [savedDays, pendingDays])

  useEffect(() => {
    if (update.error) {
      toast.error(update.error.detail || "Couldn't save lookahead window")
      // Rollback the optimistic override.
      setPendingDays(undefined)
    }
  }, [update.error])

  function saveDays(next: number | null) {
    // Optimistic local flip — UI responds instantly. Reconciled / rolled
    // back via the useEffects above.
    setPendingDays(next)
    // Build the new config: existing DCD subset + future_days (or remove
    // it when null). PATCH replaces the whole config object.
    const existing = (widget.config ?? {}) as Record<string, unknown>
    const cfg: Record<string, unknown> = { ...existing }
    if (next === null) {
      delete cfg.future_days
    } else {
      cfg.future_days = next
    }
    update.mutate({
      id: widget.id,
      body: {
        config: Object.keys(cfg).length ? cfg : null,
      },
    })
  }

  const isCustom = !PRESETS.includes(activeDays as 30 | 60 | 90)

  // Overdue summary for the header chip — recomputed off the data hook.
  const overdueCount = items.filter((i) => i.days_offset < 0).length

  return (
    <Card>
      <CardHeader>
        <CardTitle>{widget.title || "Milestone lookahead"}</CardTitle>
        <CardDescription>
          Past-due and upcoming (next {activeDays} days) across your projects.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1">
            {!isCustom ? (
              <Segmented
                aria-label="Lookahead window"
                value={String(activeDays)}
                onChange={(v) => saveDays(Number(v))}
                options={PRESETS.map((d) => ({
                  value: String(d),
                  label: `${d}d`,
                }))}
              />
            ) : (
              // While a custom value is active the Segmented presets stay
              // visible but in their "unselected" state — the Custom button
              // to the right of them carries the active highlight.
              <Segmented
                aria-label="Lookahead window"
                value="__custom__"
                onChange={(v) => saveDays(Number(v))}
                options={PRESETS.map((d) => ({
                  value: String(d),
                  label: `${d}d`,
                }))}
              />
            )}
            <CustomDaysPopover
              activeDays={activeDays}
              isCustom={isCustom}
              disabled={update.isPending}
              onSave={(n) => saveDays(n)}
            />
          </div>
          {overdueCount > 0 && (
            <Badge tone="rose">
              <TriangleAlert className="size-3" />
              {overdueCount} overdue
            </Badge>
          )}
        </div>

        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : q.isError ? (
          <p className="text-sm text-red-700">{q.error.detail}</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nothing on the horizon.
          </p>
        ) : (
          <ul className="max-h-72 overflow-y-auto">
            {items.map((m) => (
              <Row key={m.milestone_id} item={m} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function CustomDaysPopover({
  activeDays,
  isCustom,
  disabled,
  onSave,
}: {
  activeDays: number
  isCustom: boolean
  disabled: boolean
  onSave: (n: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string>(String(activeDays))

  useEffect(() => {
    if (open) setDraft(String(activeDays))
  }, [open, activeDays])

  const n = Number(draft)
  const valid = Number.isInteger(n) && n >= MIN_DAYS && n <= MAX_DAYS

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          size="sm"
          variant={isCustom ? "default" : "outline"}
          disabled={disabled}
          aria-pressed={isCustom}
        >
          {isCustom ? (
            <>
              {activeDays}d <Check className="ml-1 size-3" />
            </>
          ) : (
            <>
              Custom <ChevronDown className="ml-1 size-3" />
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-56">
        <div className="space-y-2">
          <label className="text-xs font-medium" htmlFor="lookahead-days">
            Days ({MIN_DAYS}–{MAX_DAYS})
          </label>
          <Input
            id="lookahead-days"
            type="number"
            min={MIN_DAYS}
            max={MAX_DAYS}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && valid) {
                onSave(n)
                setOpen(false)
              }
            }}
            autoFocus
          />
          <div className="flex items-center justify-between gap-2">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                onSave(null)
                setOpen(false)
              }}
            >
              Reset to {DEFAULT_DAYS}
            </Button>
            <Button
              size="sm"
              disabled={!valid}
              onClick={() => {
                onSave(n)
                setOpen(false)
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}
