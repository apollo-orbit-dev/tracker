import { useCallback, useEffect, useState } from "react"

/**
 * Phase 4.6 — global command palette open state + cmd+K listener.
 *
 * Owns nothing the consumer can't also own; the value of the hook is in
 * binding the global keyboard listener to the same piece of state the
 * palette component reads from. The single source-of-truth lives in
 * `AppLayout`, which mounts the palette and wires the topbar trigger.
 *
 * Cmd+K on macOS / Ctrl+K elsewhere. We don't sniff `navigator.platform`
 * — both modifier flags are checked, so whichever the user holds works.
 */
export function useCommandPalette() {
  const [open, setOpen] = useState(false)

  const toggle = useCallback(() => setOpen((v) => !v), [])

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // Allow cmd+K (mac) or ctrl+K (others). Don't fire on letter K alone.
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((v) => !v)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return { open, setOpen, toggle }
}
