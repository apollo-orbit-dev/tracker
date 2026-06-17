import { type CSSProperties } from "react"

import { avatarHues, initialsOf } from "@/lib/avatar"

type Props = {
  /** Used for the deterministic hue + initials. */
  name: string
  /** Pixel size (square). Default 24. */
  size?: number
  className?: string
}

/**
 * Phase 4.1 avatar. Generates a per-name oklch hue pair so two users
 * with similar initials stay visually distinct in lists.
 *
 * No image support yet — the codebase doesn't store user-uploaded avatars
 * and the design uses initial letters everywhere. If/when that changes,
 * extend with a `src` prop.
 */
export function Avatar({ name, size = 24, className }: Props) {
  const { background, color } = avatarHues(name)
  const style: CSSProperties = {
    width: size,
    height: size,
    fontSize: Math.round(size * 0.42),
    background,
    color,
  }
  return (
    <span
      aria-hidden
      className={`inline-grid place-items-center rounded-full font-semibold leading-none ${
        className ?? ""
      }`}
      style={style}
      title={name}
    >
      {initialsOf(name)}
    </span>
  )
}
