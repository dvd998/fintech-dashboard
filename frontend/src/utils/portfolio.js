/**
 * Helpers shared by the Portfolio page and its components.
 */

export const PORTFOLIO_PATH = '/ai-playground/portfolio'

// Category order used for the allocation donut and asset-picker chips.
// Order is chosen so neighbouring donut slices stay distinguishable for
// colour-blind users (sky and violet are never adjacent).
export const CATEGORY_ORDER = ['stocks', 'crypto', 'forex', 'commodities', 'indices']

export const CATEGORY_LABELS = {
  stocks: 'Stocks', crypto: 'Crypto', commodities: 'Commodities', forex: 'Forex', indices: 'Indices',
}

export const CASH_COLOR = '#64748b'   // slate — neutral, so it never reads as an asset class

/**
 * USD value of 1 unit of `ccy`, from the live instrument list.
 * Mirrors usd_per() in backend/app/services/portfolio.py — only used for the
 * trade preview; the backend always computes the real execution.
 */
export function usdPer(ccy, instruments) {
  if (!ccy || ccy === 'USD') return 1
  const price = sym => instruments.find(i => i.symbol === sym)?.price
  const direct = price(`${ccy}USD=X`)
  if (direct) return direct
  const inverse = price(`USD${ccy}=X`)
  if (inverse) return 1 / inverse
  if (ccy === 'HKD') return 1 / 7.8   // pegged — matches the backend fallback
  return null
}

/** Tailwind text class for a signed number. */
export function pnlClass(value) {
  if (value == null || Math.abs(value) < 0.005) return 'text-slate-400'
  return value > 0 ? 'text-up' : 'text-down'
}

/**
 * The backend stores UTC timestamps without a zone suffix ("2026-11-13T14:13:50").
 * JS would parse those as *local* time, so tag them as UTC first.
 */
export function asUTC(iso) {
  if (!iso) return iso
  return /Z$|[+-]\d\d:?\d\d$/.test(iso) ? iso : `${iso}Z`
}
