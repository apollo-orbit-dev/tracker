import { useEffect, useRef } from "react"
import { useNavigate } from "react-router"

import { useAuth } from "@/hooks/useAuth"
import { hasRole } from "@/lib/roles"

const G_WINDOW_MS = 1500

/** True when the user is typing in something that should not be hijacked. */
function focusIsEditable(): boolean {
  const el = document.activeElement as HTMLElement | null
  if (!el) return false
  if (el.isContentEditable) return true
  const tag = el.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  // The cmd-K input exposes role="combobox" / role="textbox" depending on
  // the implementation; cover both.
  const role = el.getAttribute("role")
  if (role === "textbox" || role === "combobox") return true
  return false
}

/**
 * Phase 4.7.2 — two-key `g`-prefixed navigation shortcuts.
 *
 *   g d → /            (Dashboard)
 *   g p → /projects    (Projects)
 *   g a → /admin       (Admin; DM-and-up only)
 *
 * Sequence rules:
 *   - Pressing bare `g` arms a 1500ms window for the follow-up key.
 *   - Any other key (or the timeout) disarms the sequence.
 *   - Modifier-held key presses are ignored (so cmd+G, etc. still work).
 *   - Editable focus disables the sequence — typing `g` in a field
 *     should never navigate the page away.
 *
 * Mounted once at `AppLayout`, listener bound to `window`.
 */
export function useGShortcuts() {
  const navigate = useNavigate()
  const { data: user } = useAuth()
  const roles = user?.roles ?? []
  const isDM = hasRole(roles, "department_manager")

  // Use refs so re-renders (e.g. role changes) don't tear down the
  // listener mid-sequence. The handler reads current values via these.
  const navigateRef = useRef(navigate)
  const isDMRef = useRef(isDM)
  navigateRef.current = navigate
  isDMRef.current = isDM

  useEffect(() => {
    let armedUntil = 0
    let armTimer: ReturnType<typeof setTimeout> | null = null

    function clearArm() {
      if (armTimer) {
        clearTimeout(armTimer)
        armTimer = null
      }
      armedUntil = 0
    }

    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) {
        clearArm()
        return
      }
      if (focusIsEditable()) {
        clearArm()
        return
      }

      const now = Date.now()
      const armed = now < armedUntil

      if (!armed) {
        // Not armed → only `g` is interesting; arm and bail.
        if (e.key === "g") {
          armedUntil = now + G_WINDOW_MS
          if (armTimer) clearTimeout(armTimer)
          armTimer = setTimeout(clearArm, G_WINDOW_MS)
        }
        return
      }

      // Armed: this is the follow-up key.
      clearArm()
      const k = e.key.toLowerCase()
      if (k === "d") {
        e.preventDefault()
        navigateRef.current("/")
      } else if (k === "p") {
        e.preventDefault()
        navigateRef.current("/projects")
      } else if (k === "a") {
        if (!isDMRef.current) return // quietly no-op for non-DMs
        e.preventDefault()
        navigateRef.current("/admin")
      }
      // Any other key disarms (already cleared) and does nothing else.
    }

    window.addEventListener("keydown", onKeyDown)
    return () => {
      window.removeEventListener("keydown", onKeyDown)
      clearArm()
    }
  }, [])
}
