import { Check, Flag } from "lucide-react"

import type { Milestone } from "@/api/projects"

/**
 * Phase 25.2 — read-only milestone timeline card.
 *
 * A horizontal stepper rendered in milestone order (the same order as the
 * editable table below). Each node shows a state dot, the name, and the
 * actual date (when set) or the planned date. The connecting track fills
 * emerald up to the last completed milestone. Clicking a node asks the
 * parent to reveal that milestone's row in the table — editing stays in the
 * table (timeline is presentation only, per the Phase 25 plan, decision C).
 *
 * Hidden entirely when the project has no milestones.
 */
type Props = {
  milestones: Milestone[]
  /** Called with a milestone id when a node is clicked. */
  onSelect: (id: string) => void
}

type NodeState = "done" | "over" | "soon" | "planned"

/** Parse a date-only string ("YYYY-MM-DD") as LOCAL midnight to avoid the
 *  UTC off-by-one a bare `new Date("2026-01-20")` would introduce. */
function parseLocal(d: string): Date {
  return new Date(d.length === 10 ? `${d}T00:00:00` : d)
}

function shortDate(d: string | null): string {
  if (!d) return "—"
  const dt = parseLocal(d)
  if (isNaN(dt.getTime())) return d
  return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" })
}

function nodeState(m: Milestone): NodeState {
  if (m.actual_date) return "done"
  if (!m.planned_date) return "planned"
  const days = Math.round(
    (parseLocal(m.planned_date).getTime() - startOfToday()) / 86_400_000,
  )
  if (days < 0) return "over"
  if (days <= 14) return "soon"
  return "planned"
}

function startOfToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

const DOT_CLASS: Record<NodeState, string> = {
  done: "border-[hsl(var(--tone-emerald-dot))] bg-[hsl(var(--tone-emerald-dot))]",
  over: "border-[hsl(var(--tone-rose-dot))] bg-[hsl(var(--tone-rose-dot))]",
  soon: "border-[hsl(var(--tone-amber-dot))] bg-[hsl(var(--tone-amber-dot))]",
  planned: "border-[hsl(var(--border-strong))] bg-card",
}

export function MilestoneTimeline({ milestones, onSelect }: Props) {
  if (milestones.length === 0) return null

  const n = milestones.length
  const doneCount = milestones.filter((m) => m.actual_date).length
  // Half-a-node inset so the track starts/ends at the first/last dot center.
  const inset = 50 / n
  const lastDone = milestones.reduce(
    (acc, m, i) => (m.actual_date ? i : acc),
    -1,
  )
  const fillRight = lastDone < 0 ? inset : ((lastDone + 0.5) / n) * 100
  const fillWidth = Math.max(0, fillRight - inset)

  // "next" = earliest not-yet-actual milestone by planned date.
  const upcoming = milestones
    .filter((m) => !m.actual_date && m.planned_date)
    .sort(
      (a, b) =>
        parseLocal(a.planned_date!).getTime() -
        parseLocal(b.planned_date!).getTime(),
    )[0]
  const nextLabel = upcoming
    ? `${upcoming.name} (${shortDate(upcoming.planned_date)})`
    : "all complete"

  return (
    <section className="rounded-[14px] border bg-card px-5 pt-5 pb-2">
      <header className="mb-5 flex items-center gap-2.5">
        <Flag className="size-4 shrink-0 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Milestone timeline</h2>
        <span className="ml-auto truncate text-xs text-muted-foreground">
          {doneCount} of {n} complete · next: {nextLabel}
        </span>
      </header>
      <div className="relative flex gap-1.5 pb-2">
        <div
          aria-hidden
          className="absolute top-[7px] h-0.5 rounded bg-[hsl(var(--border-strong))]"
          style={{ left: `${inset}%`, right: `${inset}%` }}
        />
        <div
          aria-hidden
          className="absolute top-[7px] h-0.5 rounded bg-[hsl(var(--tone-emerald-dot))]"
          style={{ left: `${inset}%`, width: `${fillWidth}%` }}
        />
        {milestones.map((m) => {
          const state = nodeState(m)
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => onSelect(m.id)}
              title={`Go to ${m.name}`}
              className="relative z-10 flex min-w-0 flex-1 flex-col items-center text-center"
            >
              <span
                className={`grid size-4 place-items-center rounded-full border-2 ${DOT_CLASS[state]}`}
              >
                {state === "done" && (
                  <Check className="size-2.5 text-white" strokeWidth={3} />
                )}
              </span>
              <span className="mt-2.5 line-clamp-2 text-xs font-medium leading-tight">
                {m.name}
              </span>
              <span className="mt-0.5 text-[11px] text-muted-foreground">
                {m.actual_date ? (
                  <span className="text-[hsl(var(--tone-emerald-fg))]">
                    {shortDate(m.actual_date)}
                  </span>
                ) : (
                  shortDate(m.planned_date)
                )}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
