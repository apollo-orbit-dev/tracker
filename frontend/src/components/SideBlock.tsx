import { type ReactNode } from "react"

/**
 * Phase 4.3 — section block for the right sidebar on the project detail
 * page. Carries an uppercase label, an optional action slot (e.g. a "+"
 * icon button), and freeform children below a subtle divider.
 */
type SideBlockProps = {
  label: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function SideBlock({
  label,
  action,
  children,
  className,
}: SideBlockProps) {
  return (
    <section className={`space-y-2 ${className ?? ""}`}>
      <header className="flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.04em] text-muted-foreground">
          {label}
        </h3>
        {action}
      </header>
      <div className="space-y-1.5">{children}</div>
    </section>
  )
}

/**
 * Key/value row for Properties + Activity blocks. Label left (muted),
 * value right (foreground, right-aligned).
 */
type SideRowProps = {
  label: string
  children: ReactNode
  className?: string
}

export function SideRow({ label, children, className }: SideRowProps) {
  return (
    <div className={`flex items-baseline justify-between gap-3 text-sm ${className ?? ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right">{children}</span>
    </div>
  )
}
