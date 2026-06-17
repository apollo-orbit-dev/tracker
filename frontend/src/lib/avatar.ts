/**
 * Phase 4.1 — deterministic avatar color from a display name.
 *
 * Mirrors the reference mockup so React's
 * Avatar lands at the same hue as the reference mockups: a 32-bit
 * hash of the name gates a 0–360° hue range, then we project to
 * paired oklch chips for the background and foreground.
 */

export function hashName(name: string): number {
  let h = 0
  for (let i = 0; i < name.length; i++) {
    h = ((h << 5) - h + name.charCodeAt(i)) | 0
  }
  return h
}

/**
 * Returns `{ background, color }` strings as oklch() values. Stable across
 * loads as long as `name` is byte-for-byte the same. Anonymous (`""`)
 * users get hue 0 (a neutral rose).
 */
export function avatarHues(
  name: string,
): { background: string; color: string } {
  const hue = Math.abs(hashName(name)) % 360
  return {
    background: `oklch(0.92 0.04 ${hue})`,
    color: `oklch(0.42 0.12 ${hue})`,
  }
}

export function initialsOf(name: string): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase()
  }
  return parts[0]?.slice(0, 2).toUpperCase() ?? "?"
}
