import { useEffect, useRef, useState } from "react"

type Props = {
  value: string
  /** Fired on commit (Enter / blur). Skipped when the value didn't change. */
  onCommit: (next: string) => void
  /** Disables click/keyboard editing. Renders as plain static text. */
  disabled?: boolean
  /** Shown in display state when value is empty, and as the input placeholder. */
  placeholder?: string
  /** When true, edit state uses a `<textarea>` and only Cmd/Ctrl+Enter commits. */
  multiline?: boolean
  /** Class applied to the display-state span. */
  className?: string
  /** Class applied to the edit-state input/textarea. Keep this matching the
   *  display span's typography so the layout doesn't jump. */
  inputClassName?: string
  /** Used for the display-state button's aria-label so screen readers know what's editable. */
  ariaLabel?: string
  /** Native maxLength applied to the edit-state input/textarea. Pass the
   *  server-side limit so long entries are blocked at the keyboard
   *  instead of silently truncated on commit. */
  maxLength?: number
}

/**
 * Phase 4.7.1 click-to-edit text primitive.
 *
 * Display state is a button that looks like static text. Click (or Enter
 * / Space when focused) flips to edit state — an `<input>` (or
 * `<textarea>` when `multiline`) with the current value auto-selected.
 *
 * Edit-state commit triggers:
 *   - `Enter` (single-line input) or `Cmd/Ctrl+Enter` (textarea — bare
 *     Enter still inserts a newline)
 *   - Blur
 * Edit-state cancel triggers:
 *   - `Esc`
 *
 * The component is stateless w.r.t. the value: `value` is always the
 * source of truth from the parent. The local draft only exists between
 * "enter edit mode" and "commit or cancel"; on commit, we call
 * `onCommit(next)` and exit edit state — the parent decides what to
 * persist.
 *
 * No-op edits (committed value equals the original) skip `onCommit`.
 */
export function InlineText({
  value,
  onCommit,
  disabled = false,
  placeholder,
  multiline = false,
  className,
  inputClassName,
  ariaLabel,
  maxLength,
}: Props) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null)

  // Reset draft whenever we enter edit mode or the upstream value
  // changes while we're not editing. The latter keeps the display
  // honest when something else (audit-log replay, another tab) updates
  // the row.
  useEffect(() => {
    if (!editing) setDraft(value)
  }, [editing, value])

  useEffect(() => {
    if (!editing) return
    const el = inputRef.current
    if (!el) return
    el.focus()
    // Auto-select the existing text so the user can immediately
    // overtype. Matches the Linear/Jira pattern.
    el.select()
  }, [editing])

  if (disabled) {
    return (
      <span className={className}>
        {value || placeholder || ""}
      </span>
    )
  }

  const enterEdit = () => {
    setDraft(value)
    setEditing(true)
  }

  const commit = () => {
    setEditing(false)
    if (draft !== value) {
      onCommit(draft)
    }
  }

  const cancel = () => {
    setDraft(value)
    setEditing(false)
  }

  if (editing) {
    if (multiline) {
      return (
        <textarea
          ref={(el) => {
            inputRef.current = el
          }}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              commit()
            } else if (e.key === "Escape") {
              e.preventDefault()
              cancel()
            }
          }}
          placeholder={placeholder}
          maxLength={maxLength}
          className={inputClassName}
          aria-label={ariaLabel}
        />
      )
    }
    return (
      <input
        ref={(el) => {
          inputRef.current = el
        }}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault()
            commit()
          } else if (e.key === "Escape") {
            e.preventDefault()
            cancel()
          }
        }}
        placeholder={placeholder}
        maxLength={maxLength}
        className={inputClassName}
        aria-label={ariaLabel}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={enterEdit}
      aria-label={ariaLabel}
      data-editable="true"
      // The display state should look like text, not a button. Consumers
      // style this span via `className`; the primitive only carries
      // text-cursor + reset of native button chrome.
      className={`cursor-text text-left bg-transparent border-0 p-0 hover:[text-decoration:underline_dotted] focus-visible:outline-2 focus-visible:outline-ring ${className ?? ""}`}
    >
      {value || (
        <span className="text-muted-foreground">{placeholder ?? ""}</span>
      )}
    </button>
  )
}
