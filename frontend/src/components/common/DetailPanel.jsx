/**
 * DetailPanel — shared detail view shown when the user clicks an asset.
 * Renders the current-price card, a period selector, period % change badge,
 * the currency label, and a filtered price history chart.
 *
 * Props:
 *   selected — asset object from the list (symbol, name, price, …)
 *   detail   — API response with { history: [{date, close, …}] }, or null while loading
 *   color    — hex color passed through to PriceAreaChart
 *   onClose  — called when the X button is clicked
 */
import { useState, useMemo } from 'react'
import { X, TrendingUp, TrendingDown } from 'lucide-react'
import PriceCard from './PriceCard'
import PriceAreaChart from '../charts/PriceAreaChart'

const PERIODS = [
  { label: '1W', days: 7 },
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '6M', days: 180 },
  { label: '1Y', days: 365 },
]

// Indices trade in local currencies; everything else is USD
const INDEX_CURRENCIES = {
  '^GSPC': 'USD', '^DJI': 'USD', '^IXIC': 'USD',
  '^FTSE': 'GBP', '^N225': 'JPY', '^GDAXI': 'EUR', '^HSI': 'HKD',
}

function getCurrency(symbol) {
  if (symbol in INDEX_CURRENCIES) return INDEX_CURRENCIES[symbol]
  // Forex EURUSD=X → quote currency = last 3 chars before "=X"
  if (symbol.endsWith('=X')) return symbol.replace('=X', '').slice(-3)
  return 'USD'
}

export default function DetailPanel({ selected, detail, color, onClose }) {
  const [period, setPeriod] = useState('1Y')

  const currency = getCurrency(selected.symbol)

  const filteredHistory = useMemo(() => {
    if (!detail?.history?.length) return []
    const days = PERIODS.find(p => p.label === period)?.days ?? 365
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return detail.history.filter(row => new Date(row.date) >= cutoff)
  }, [detail, period])

  const periodChange = useMemo(() => {
    if (filteredHistory.length < 2) return null
    const first = filteredHistory[0].close
    const last  = filteredHistory[filteredHistory.length - 1].close
    return ((last - first) / first) * 100
  }, [filteredHistory])

  return (
    <div className="mt-6 card">
      {/* Header — name, symbol, currency, close button */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-xl font-semibold text-white">{selected.name}</h2>
          <p className="text-sm num text-slate-500">
            {selected.symbol}
            <span className="mx-2 text-slate-600">·</span>
            <span className="text-xs font-semibold tracking-widest text-slate-400 uppercase">{currency}</span>
          </p>
        </div>
        <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
          <X size={18} />
        </button>
      </div>

      {/* Current price card */}
      <div className="mb-6 w-64">
        <PriceCard asset={selected} />
      </div>

      {/* Chart header: label + period change badge + period buttons */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <h3 className="text-sm font-medium text-slate-400">Price History</h3>
          {periodChange != null && (
            <span className={periodChange >= 0 ? 'badge-up' : 'badge-down'}>
              {periodChange >= 0
                ? <TrendingUp  size={10} className="inline mr-1" />
                : <TrendingDown size={10} className="inline mr-1" />
              }
              {periodChange >= 0 ? '+' : ''}{periodChange.toFixed(2)}%
            </span>
          )}
        </div>

        <div className="flex gap-1 bg-surface-border/40 rounded-lg p-0.5">
          {PERIODS.map(p => (
            <button
              key={p.label}
              onClick={() => setPeriod(p.label)}
              className={`px-3 py-1 text-xs rounded-md font-medium transition-all ${
                period === p.label
                  ? 'bg-brand text-white'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart or loading skeleton */}
      {detail
        ? filteredHistory.length > 0
          ? <PriceAreaChart data={filteredHistory} color={color} height={280} />
          : <div className="h-64 flex items-center justify-center text-slate-500 text-sm">No data for this period</div>
        : <div className="h-64 bg-surface-border rounded-xl animate-pulse" />
      }
    </div>
  )
}
