import { type ReactNode } from "react"

export type BadgeTone =
  | "slate"
  | "emerald"
  | "amber"
  | "indigo"
  | "rose"
  | "blue"

type Props = {
  tone?: BadgeTone
  /** Render a small colored dot to the left of the label. */
  dot?: boolean
  className?: string
  children: ReactNode
}

const TONE_STYLES: Record<BadgeTone, { bg: string; fg: string; dot: string }> = {
  slate: {
    bg: "bg-[hsl(var(--tone-slate-bg))]",
    fg: "text-[hsl(var(--tone-slate-fg))]",
    dot: "bg-[hsl(var(--tone-slate-dot))]",
  },
  emerald: {
    bg: "bg-[hsl(var(--tone-emerald-bg))]",
    fg: "text-[hsl(var(--tone-emerald-fg))]",
    dot: "bg-[hsl(var(--tone-emerald-dot))]",
  },
  amber: {
    bg: "bg-[hsl(var(--tone-amber-bg))]",
    fg: "text-[hsl(var(--tone-amber-fg))]",
    dot: "bg-[hsl(var(--tone-amber-dot))]",
  },
  indigo: {
    bg: "bg-[hsl(var(--tone-indigo-bg))]",
    fg: "text-[hsl(var(--tone-indigo-fg))]",
    dot: "bg-[hsl(var(--tone-indigo-dot))]",
  },
  rose: {
    bg: "bg-[hsl(var(--tone-rose-bg))]",
    fg: "text-[hsl(var(--tone-rose-fg))]",
    dot: "bg-[hsl(var(--tone-rose-dot))]",
  },
  blue: {
    bg: "bg-[hsl(var(--tone-blue-bg))]",
    fg: "text-[hsl(var(--tone-blue-fg))]",
    dot: "bg-[hsl(var(--tone-blue-dot))]",
  },
}

/**
 * Phase 4.1 tone-aware badge. Six semantic tones backed by the
 * `--tone-{name}-{bg,fg,dot}` CSS tokens, which means light/dark mode
 * works automatically via the index.css palette.
 *
 * Existing badge usages in the codebase use ad-hoc Tailwind classes;
 * they'll migrate to this primitive incrementally during 4.2+ as each
 * page is redressed.
 */
export function Badge({ tone = "slate", dot, className, children }: Props) {
  const t = TONE_STYLES[tone]
  return (
    <span
      className={`inline-flex h-[20px] items-center gap-1.5 rounded-[5px] px-[7px] text-[11.75px] font-medium leading-none whitespace-nowrap ${t.bg} ${t.fg} ${
        className ?? ""
      }`}
    >
      {dot && (
        <span
          aria-hidden
          className={`inline-block size-[5.5px] rounded-full ${t.dot}`}
        />
      )}
      {children}
    </span>
  )
}
