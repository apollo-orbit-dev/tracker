/**
 * Format an ISO timestamp as a short relative-time string
 * ("just now", "5m ago", "3h ago", "2d ago", "4mo ago").
 *
 * Shared across the Forms screens (list / responses / review) — previously
 * copied in three places with slightly different tails (Phase 18.5 DRY).
 */
export function relativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime()
  const sec = Math.floor(delta / 1000)
  if (sec < 60) return "just now"
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  if (days < 30) return `${days}d ago`
  const months = Math.floor(days / 30)
  return `${months}mo ago`
}
