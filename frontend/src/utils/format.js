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

/** "$12,345.67" — pass compact=true for "$12.3K" / "$1.2M". */
export function fmtUSD(value, { compact = false, sign = false } = {}) {
  if (value == null || Number.isNaN(value)) return '—'
  const prefix = sign && value > 0 ? '+' : value < 0 ? '−' : ''
  const abs = Math.abs(value)
  if (compact && abs >= 1e6) return `${prefix}$${(abs / 1e6).toFixed(2)}M`
  if (compact && abs >= 1e4) return `${prefix}$${(abs / 1e3).toFixed(1)}K`
  return `${prefix}$${abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

/** "+3.42%" / "−1.05%". */
export function fmtPct(value, digits = 2) {
  if (value == null || Number.isNaN(value)) return '—'
  const prefix = value > 0 ? '+' : value < 0 ? '−' : ''
  return `${prefix}${Math.abs(value).toFixed(digits)}%`
}

/** Fractional units with sensible precision: 0.004213 BTC, 42.27 AAPL, 5,000 USD/JPY. */
export function fmtUnits(value) {
  if (value == null) return '—'
  const abs = Math.abs(value)
  const digits = abs >= 1000 ? 0 : abs >= 1 ? 4 : 6
  return value.toLocaleString('en-US', { maximumFractionDigits: digits })
}

/** Instrument price in its own currency — forex and sub-$1 assets get 4 decimals. */
export function fmtPrice(value, symbol = '') {
  if (value == null) return '—'
  const decimals = symbol.includes('=X') || Math.abs(value) < 1 ? 4 : 2
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
}
