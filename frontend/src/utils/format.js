/**
 * Small formatting helpers shared across pages/components.
 */

/** How long ago was this date? Returns e.g. "3h ago", "2d ago". */
export function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins   = Math.floor(diffMs / 60_000)
  const hours  = Math.floor(diffMs / 3_600_000)
  const days   = Math.floor(diffMs / 86_400_000)
  if (mins < 1)   return 'just now'
  if (hours < 1)  return `${mins}m ago`
  if (days  < 1)  return `${hours}h ago`
  return `${days}d ago`
}

/** Format a sentiment score like "+0.73" or "−0.42". */
export function fmtScore(score) {
  if (score == null) return ''
  return score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2)
}
