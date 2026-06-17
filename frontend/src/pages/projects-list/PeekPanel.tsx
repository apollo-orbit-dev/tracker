import { ArrowRight, X } from "lucide-react"
import { Link } from "react-router"

import { Avatar } from "@/components/Avatar"
import { Badge } from "@/components/Badge"
import { Button } from "@/components/ui/button"
import { useCORList } from "@/api/cors"
import { useNoteList } from "@/api/notes"
import { type Milestone, type Project, useProject } from "@/api/projects"
import { corStatusLabel, corStatusTone } from "@/lib/cors"
import { milestoneDirectionTone } from "@/lib/field-types"
import { formatMetricValue } from "@/lib/metric-value"
import { lifecycleLabel, lifecycleTone } from "@/lib/lifecycle"
import { milestoneOffsetLabel, milestoneOffsetTone } from "@/lib/milestones"

type Props = {
  project: Project
  onClose: () => void
}

function daysFromToday(iso: string): number {
  const planned = new Date(iso + "T12:00:00")
  const today = new Date()
  today.setHours(12, 0, 0, 0)
  return Math.round(
    (planned.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  )
}

function formatDate(iso: string | null): string {
  if (!iso) return "—"
  // Milestone planned_date / actual_date are date-only strings like
  // "2026-12-31". `new Date("YYYY-MM-DD")` parses as UTC midnight,
  // which becomes the previous day in any timezone west of UTC. Anchor
  // at local noon (same trick as `daysFromToday`) so the displayed
  // calendar day matches what was saved.
  const datePart = iso.length === 10 ? iso : iso.slice(0, 10)
  const d = new Date(datePart + "T12:00:00")
  if (isNaN(d.getTime())) return iso
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  })
}

function relativeTime(iso: string): string {
  const days = daysFromToday(iso.slice(0, 10))
  if (days === 0) return "today"
  if (days === -1) return "yesterday"
  if (days < 0) return `${-days}d ago`
  if (days === 1) return "tomorrow"
  return `in ${days}d`
}

function formatCurrency(raw: string): string {
  const n = parseFloat(raw)
  if (isNaN(n)) return raw
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n)
}

// Sort by order_index so the timeline preserves the milestone sequence
// the template defines (rather than reshuffling by planned date).
function sortedMilestones(items: Milestone[]): Milestone[] {
  return [...items].sort(
    (a, b) =>
      a.order_index - b.order_index ||
      (a.planned_date ?? "").localeCompare(b.planned_date ?? ""),
  )
}

/**
 * Section heading — uppercase muted-fg per design ref `.section-title`.
 */
function SectionHead({
  label,
  trailing,
}: {
  label: string
  trailing?: React.ReactNode
}) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.03em] text-[hsl(var(--subtle-fg))]">
        {label}
      </h3>
      {trailing}
    </div>
  )
}

/**
 * Phase 4.8.9 — peek panel matches the design ref's inline-divider style:
 * no nested cards, sections separated by horizontal rules, milestone
 * timeline rendered with a vertical rail + dots + connecting lines.
 *
 * Sections (top → bottom):
 *   - Header (status badge, title, mono meta)
 *   - Metrics (Coming soon placeholder pending custom-fields work)
 *   - Milestones (timeline)
 *   - Open change orders (side rows)
 *   - Recent notes
 *   - Open full project CTA
 */
export function PeekPanel({ project, onClose }: Props) {
  const detail = useProject(project.id)
  const cors = useCORList(project.id)
  const notes = useNoteList(project.id, { limit: 3, offset: 0 })

  const milestones = detail.data?.milestones ?? []

  // 5.2: metric fields are template field defs flagged
  // `is_project_metric`; values come from the project's
  // `custom_field_values`. Sorted by order_index to match the field
  // sequence the DM defined.
  const metricFields = (detail.data?.template_field_defs ?? [])
    .filter((fd) => fd.is_project_metric)
    .sort((a, b) => a.order_index - b.order_index)
  const customFieldValues =
    (detail.data?.custom_field_values as Record<string, unknown>) ?? {}
  const orderedMilestones = sortedMilestones(milestones)
  const completed = milestones.filter((m) => m.actual_date).length

  const openCors = (cors.data?.items ?? [])
    .filter((c) => c.status === "draft" || c.status === "submitted")
    .slice(0, 3)

  return (
    <aside className="flex h-full flex-col overflow-hidden border-l bg-background">
      {/* Header */}
      <header className="flex flex-col gap-2 border-b px-4 py-3.5">
        <div className="flex items-start justify-between gap-2">
          <Badge tone={lifecycleTone(project.lifecycle_state)} dot>
            {lifecycleLabel(project.lifecycle_state)}
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Close peek"
            onClick={onClose}
            className="-mr-1 -mt-1 size-7"
          >
            <X className="size-4" />
          </Button>
        </div>
        <h2 className="text-base font-semibold leading-tight tracking-tight">
          {project.title}
        </h2>
        <p className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-muted-foreground">
          <span>{project.project_number}</span>
          {project.template_intersection && (
            <>
              <span className="text-[hsl(var(--subtle-fg))]">·</span>
              <span>{project.template_intersection}</span>
            </>
          )}
          {project.client_project_number && (
            <>
              <span className="text-[hsl(var(--subtle-fg))]">·</span>
              <span>client {project.client_project_number}</span>
            </>
          )}
        </p>
      </header>

      {/* Scrollable body — sections separated by border-bottom, no cards. */}
      <div className="flex-1 overflow-y-auto px-4">
        {/* 5.2: metrics — fields the template DM flagged as Project
            Metric, rendered with the value from the project's
            custom_field_values. Section hides entirely when no metric
            fields exist on the template. */}
        {metricFields.length > 0 && (
          <section className="border-b py-4 [&:last-child]:border-b-0">
            <SectionHead label="Metrics" />
            <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
              {metricFields.map((fd) => (
                <div key={fd.id} className="space-y-0.5">
                  <div className="text-[hsl(var(--subtle-fg))]">
                    {fd.name}
                  </div>
                  <div className="text-sm font-medium tabular-nums text-foreground">
                    {formatMetricValue(customFieldValues[fd.id], fd.field_type)}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Milestones timeline */}
        <section className="border-b py-4 [&:last-child]:border-b-0">
          <SectionHead
            label="Milestones"
            trailing={
              milestones.length > 0 ? (
                <span className="text-[11px] text-[hsl(var(--subtle-fg))]">
                  {completed}/{milestones.length} done
                </span>
              ) : null
            }
          />
          {detail.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : orderedMilestones.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No milestones defined.
            </p>
          ) : (
            <ol className="flex flex-col">
              {orderedMilestones.map((m, i) => {
                const done = !!m.actual_date
                const offset =
                  !done && m.planned_date
                    ? daysFromToday(m.planned_date)
                    : null
                const overdue = offset !== null && offset < 0
                const isLast = i === orderedMilestones.length - 1
                // Dot fill rule, per design `styles.css:329-331`:
                //   done    → filled primary
                //   overdue → filled tone-rose-dot
                //   future  → hollow with border-strong
                const dotClass = done
                  ? "border-primary bg-primary"
                  : overdue
                    ? "border-[hsl(var(--tone-rose-dot))] bg-[hsl(var(--tone-rose-dot))]"
                    : "border-border bg-background"
                return (
                  <li
                    key={m.id}
                    className="relative grid grid-cols-[18px_1fr_auto] items-start gap-x-2.5 py-2"
                  >
                    {/* Connecting line — anchored to this li and extends
                        8px below into the next li's top padding (which
                        is py-2 = 8px). Bridges the gap between dots
                        seamlessly. Per design `styles.css:332`. */}
                    {!isLast && (
                      <span
                        aria-hidden
                        className="absolute left-2 top-4 -bottom-2 w-[2px] bg-border"
                      />
                    )}
                    {/* Rail dot. */}
                    <div className="grid place-items-start justify-center pt-1">
                      <span
                        className={`relative z-10 size-[10px] rounded-full border-2 ${dotClass}`}
                      />
                    </div>
                    {/* Name + direction */}
                    <div className="min-w-0">
                      <div
                        className={`text-[13px] font-medium leading-tight ${
                          done ? "text-muted-foreground line-through" : ""
                        }`}
                      >
                        {m.name}
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <Badge tone={milestoneDirectionTone(m.direction)}>
                          {m.direction}
                        </Badge>
                      </div>
                    </div>
                    {/* Right: date + offset chip (or "Done" + actual date) */}
                    <div className="text-right text-[12px] tabular-nums text-muted-foreground whitespace-nowrap">
                      {done
                        ? formatDate(m.actual_date)
                        : formatDate(m.planned_date)}
                      {done ? (
                        <div className="mt-1">
                          <Badge tone="emerald">Done</Badge>
                        </div>
                      ) : offset !== null && (offset < 0 || offset <= 30) ? (
                        <div className="mt-1">
                          <Badge tone={milestoneOffsetTone(offset)}>
                            {milestoneOffsetLabel(offset)}
                          </Badge>
                        </div>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        {/* Open change orders */}
        {openCors.length > 0 && (
          <section className="border-b py-4 [&:last-child]:border-b-0">
            <SectionHead
              label="Open change orders"
              trailing={<Badge tone="blue">{openCors.length}</Badge>}
            />
            <ul className="flex flex-col">
              {openCors.map((c, i) => (
                <li
                  key={c.id}
                  className={
                    "flex items-center justify-between gap-2 py-1.5 text-[13px] " +
                    (i < openCors.length - 1 ? "border-b" : "")
                  }
                >
                  <div className="min-w-0 flex-1 truncate">
                    <span className="font-mono text-xs">{c.number}</span>
                    <span className="ml-1.5 text-xs text-muted-foreground">
                      {c.description.length > 40
                        ? c.description.slice(0, 40) + "…"
                        : c.description}
                    </span>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <span className="text-xs font-semibold tabular-nums">
                      {formatCurrency(c.amount)}
                    </span>
                    <Badge tone={corStatusTone(c.status)}>
                      {corStatusLabel(c.status)}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Recent notes */}
        <section className="border-b py-4 [&:last-child]:border-b-0">
          <SectionHead label="Recent notes" />
          {notes.isLoading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (notes.data?.items ?? []).length === 0 ? (
            <p className="text-xs text-muted-foreground">No notes yet.</p>
          ) : (
            <ul className="flex flex-col">
              {(notes.data?.items ?? []).map((n, i, arr) => (
                <li
                  key={n.id}
                  className={
                    "py-2 " + (i < arr.length - 1 ? "border-b" : "")
                  }
                >
                  <div className="flex items-center gap-2 text-xs">
                    <Avatar name={n.created_by.display_name} size={18} />
                    <span className="font-semibold">
                      {n.created_by.display_name}
                    </span>
                    <span className="ml-auto text-[11px] text-[hsl(var(--subtle-fg))]">
                      {relativeTime(n.created_at)}
                    </span>
                  </div>
                  <p className="mt-1 line-clamp-3 text-[13px] leading-snug text-foreground/85">
                    {n.body}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* CTA */}
      <div className="border-t px-4 py-3">
        <Button asChild className="w-full">
          <Link to={`/projects/${project.id}`}>
            Open full project
            <ArrowRight className="ml-1.5 size-3.5" />
          </Link>
        </Button>
      </div>
    </aside>
  )
}
