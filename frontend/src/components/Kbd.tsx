import { type ReactNode } from "react"

type Props = {
  children: ReactNode
  className?: string
}

/**
 * Phase 4.1 keyboard-key glyph. Used for cmd-K trigger hints, menu shortcut
 * indicators, and the command palette footer ("↵ select, esc close").
 */
export function Kbd({ children, className }: Props) {
  return (
    <kbd
      className={`inline-flex h-[18px] min-w-[18px] items-center justify-center rounded border bg-muted px-[5px] font-mono text-[10px] font-medium leading-none text-muted-foreground ${
        className ?? ""
      }`}
    >
      {children}
    </kbd>
  )
}
