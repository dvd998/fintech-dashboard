/**
 * PriceTable — sortable table showing all assets in a category.
 * Clicking a column header sorts by that column.
 * Clicking a row calls onRowClick(asset).
 */
import { useState } from 'react'
import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'

// ── Formatting helpers ────────────────────────────────────────────────────────

function fmtPrice(value, symbol = '') {
  if (value == null) return <span className="text-slate-600">—</span>
  const isForex = symbol?.includes('=X')
  const isCheap = value < 1
  const decimals = isForex || isCheap ? 4 : 2
  return (
    <span className="num">
      {value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}
    </span>
  )
}

function fmtChange(value) {
  if (value == null) return <span className="text-slate-600">—</span>
  const isUp = value >= 0
  return (
    <span className={`num font-medium ${isUp ? 'text-up' : 'text-down'}`}>
      {isUp ? '+' : ''}{value.toFixed(2)}%
    </span>
  )
}

function fmtVolume(value) {
  if (value == null) return <span className="text-slate-600">—</span>
  // Compact format: 1.2B, 45.3M, etc.
  if (value >= 1e9) return <span className="num">{(value / 1e9).toFixed(2)}B</span>
  if (value >= 1e6) return <span className="num">{(value / 1e6).toFixed(2)}M</span>
  if (value >= 1e3) return <span className="num">{(value / 1e3).toFixed(2)}K</span>
  return <span className="num">{value.toFixed(0)}</span>
}

function fmtMarketCap(value) {
  if (value == null) return <span className="text-slate-600">—</span>
  if (value >= 1e12) return <span className="num">{(value / 1e12).toFixed(2)}T</span>
  if (value >= 1e9)  return <span className="num">{(value / 1e9).toFixed(2)}B</span>
  if (value >= 1e6)  return <span className="num">{(value / 1e6).toFixed(2)}M</span>
  return <span className="num">{value.toFixed(0)}</span>
}

// ── Column definitions ────────────────────────────────────────────────────────

const COLUMNS = [
  { key: 'name',           label: 'Name',       render: (a) => (
    <div>
      <p className="font-medium text-white">{a.name}</p>
      <p className="text-xs text-slate-500 num">{a.symbol}</p>
    </div>
  )},
  { key: 'price',          label: 'Price',      render: (a) => fmtPrice(a.price, a.symbol)          },
  { key: 'change_percent', label: 'Change %',   render: (a) => fmtChange(a.change_percent)           },
  { key: 'change',         label: 'Change',     render: (a) => fmtPrice(a.change, a.symbol)          },
  { key: 'high',           label: 'High',       render: (a) => fmtPrice(a.high, a.symbol)            },
  { key: 'low',            label: 'Low',        render: (a) => fmtPrice(a.low, a.symbol)             },
  { key: 'volume',         label: 'Volume',     render: (a) => fmtVolume(a.volume)                   },
  { key: 'market_cap',     label: 'Mkt Cap',    render: (a) => fmtMarketCap(a.market_cap)            },
]

// ── Component ─────────────────────────────────────────────────────────────────

export default function PriceTable({ assets = [], onRowClick }) {
  // sortKey: which column we're sorting on; sortDir: 'asc' or 'desc'
  const [sortKey, setSortKey] = useState('market_cap')
  const [sortDir, setSortDir] = useState('desc')

  function handleSort(key) {
    if (sortKey === key) {
      // Clicking the same column flips direction
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('desc')
    }
  }

  // Sort a copy of the array — never mutate the original prop
  const sorted = [...assets].sort((a, b) => {
    const aVal = a[sortKey] ?? -Infinity
    const bVal = b[sortKey] ?? -Infinity
    if (typeof aVal === 'string') {
      return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
    }
    return sortDir === 'asc' ? aVal - bVal : bVal - aVal
  })

  function SortIcon({ colKey }) {
    if (sortKey !== colKey) return <ChevronsUpDown size={12} className="text-slate-600" />
    return sortDir === 'asc'
      ? <ChevronUp size={12} className="text-brand" />
      : <ChevronDown size={12} className="text-brand" />
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-surface-border">
      <table className="w-full data-table">
        <thead>
          <tr className="bg-surface-card">
            {COLUMNS.map(col => (
              <th
                key={col.key}
                onClick={() => handleSort(col.key)}
                className="cursor-pointer select-none hover:text-white transition-colors"
              >
                <span className="flex items-center gap-1">
                  {col.label}
                  <SortIcon colKey={col.key} />
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map(asset => (
            <tr
              key={asset.symbol}
              onClick={() => onRowClick?.(asset)}
              className={onRowClick ? 'cursor-pointer' : ''}
            >
              {COLUMNS.map(col => (
                <td key={col.key}>{col.render(asset)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
