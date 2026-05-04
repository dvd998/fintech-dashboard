/**
 * Top header bar — shows the current page title and last-refresh time.
 */
import { useLocation } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'

// Map URL paths to readable page titles
const PAGE_TITLES = {
  '/':            'Dashboard',
  '/stocks':      'Stocks',
  '/crypto':      'Crypto',
  '/commodities': 'Commodities',
  '/forex':       'Forex',
  '/indices':     'Indices',
}

export default function Header({ onRefresh, lastUpdated }) {
  const { pathname } = useLocation()

  // Find the matching title; fall back to the raw path
  const title = PAGE_TITLES[pathname] ?? pathname.replace('/', '')

  const timeStr = lastUpdated
    ? lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <header className="h-14 flex items-center justify-between px-6 border-b border-surface-border bg-surface-card/50 backdrop-blur-sm sticky top-0 z-20">
      <h1 className="text-lg font-semibold text-white">{title}</h1>

      <div className="flex items-center gap-4">
        {/* Show when data was last fetched */}
        {timeStr && (
          <span className="text-xs text-slate-500">
            Updated {timeStr}
          </span>
        )}

        {/* Manual refresh button */}
        <button
          onClick={onRefresh}
          className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors px-3 py-1.5 rounded-lg border border-surface-border hover:border-brand/50"
        >
          <RefreshCw size={13} />
          Refresh
        </button>
      </div>
    </header>
  )
}
