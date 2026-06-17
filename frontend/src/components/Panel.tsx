import { ChevronDown } from "lucide-react"
import { type ReactNode, useState } from "react"

import { Badge } from "@/components/Badge"

type Props = {
  /** Icon component (lucide-react). Renders next to the title. */
  icon: React.ComponentType<{ className?: string }>
  title: string
  /** Small muted line under the title. Optional. */
  subtitle?: string
  /** Optional count badge next to the title. */
  count?: number
  /** Right-aligned slot for an action button. */
  action?: ReactNode
  /** When true, the whole header is a button that toggles body visibility. */
  collapsible?: boolean
  /** Initial collapse state when collapsible. */
  defaultCollapsed?: boolean
  children: ReactNode
}

/**
 * Phase 4.5.4 / 4.8.4 panel primitive. Matches the design ref's `.panel`: bordered
 * card with a head row carrying an icon + title (optional count badge,
 * optional subtitle), an optional right-aligned action, and a body.
 *
 * 4.8.4 generalized this from the original inline Panel in
 * TemplateDetailPage. New: `subtitle`, `collapsible`, `defaultCollapsed`,
 * `count` is now optional.
 *
 * Collapsible behavior:
 *   - The whole `.panel-head` becomes clickable (and keyboard-activatable).
 *   - A leading chevron rotates -90° when collapsed.
 *   - The action slot is **not** part of the click target — actions
 *     inside the head still fire normally.
 */
export function Panel({
  icon: Icon,
  title,
  subtitle,
  count,
  action,
  collapsible = false,
  defaultCollapsed = false,
  children,
}: Props) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed)
  const open = !collapsed

  const titleNode = (
    <div className="flex items-center gap-2">
      {collapsible && (
        <ChevronDown
          aria-hidden
          className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${
            collapsed ? "-rotate-90" : ""
          }`}
        />
      )}
      <Icon className="size-4 text-muted-foreground" />
      <h2 className="text-sm font-semibold">{title}</h2>
      {typeof count === "number" && <Badge tone="slate">{count}</Badge>}
      {subtitle && (
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      )}
    </div>
  )

  return (
    <section className="rounded-md border bg-background">
      <header className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
        {collapsible ? (
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            aria-expanded={open}
            aria-label={`Toggle ${title}`}
            className="flex flex-1 items-center gap-2 text-left"
          >
            {titleNode}
          </button>
        ) : (
          titleNode
        )}
        {action && <div className="shrink-0">{action}</div>}
      </header>
      {open && <div>{children}</div>}
    </section>
  )
}
