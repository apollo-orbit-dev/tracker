import { type ReactNode } from "react"

type Option<V extends string> = {
  value: V
  label?: ReactNode
  icon?: ReactNode
  /** Disable selection — renders muted with a not-allowed cursor. */
  disabled?: boolean
  /** Tooltip / aria-description for disabled options. */
  title?: string
}

type Props<V extends string> = {
  value: V
  onChange: (next: V) => void
  options: ReadonlyArray<Option<V>>
  className?: string
  "aria-label"?: string
}

/**
 * Phase 4.1 segmented control. Equivalent to a Radix RadioGroup styled
 * as inline toggle buttons. Used by the dashboard view-mode toggle
 * (Summary / Full), the projects layout toggle (Table / Grouped /
 * Split), and the detail page Overview / Full toggle.
 */
export function Segmented<V extends string>({
  value,
  onChange,
  options,
  className,
  "aria-label": ariaLabel,
}: Props<V>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={`inline-flex items-center gap-[2px] rounded-md bg-muted p-[2px] ${
        className ?? ""
      }`}
    >
      {options.map((o) => {
        const selected = value === o.value
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={selected}
            disabled={o.disabled}
            title={o.title}
            onClick={() => !o.disabled && onChange(o.value)}
            className={`inline-flex h-[26px] items-center gap-1.5 rounded-[5px] px-2.5 text-xs font-medium transition-colors ${
              o.disabled
                ? "cursor-not-allowed text-muted-foreground/50"
                : selected
                  ? "bg-background text-foreground shadow-[0_0_0_1px_hsl(var(--border)),0_1px_1px_rgb(0_0_0_/_0.04)]"
                  : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.icon}
            {o.label ?? o.value}
          </button>
        )
      })}
    </div>
  )
}
