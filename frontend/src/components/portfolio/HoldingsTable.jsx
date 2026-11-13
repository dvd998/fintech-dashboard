/**
 * HoldingsTable — every open position, sortable, with inline Buy / Sell actions.
 *
 * Props:
 *   positions — from the portfolio summary
 *   onTrade   — (symbol, side) => void, opens the trade modal preselected
 */
import { useMemo, useState } from 'react'
import { ChevronUp, ChevronDown } from 'lucide-react'
import { CATEGORY_COLORS } from '../../utils/assetDetail'
import { fmtUSD, fmtPct, fmtUnits, fmtPrice } from '../../utils/format'
import { pnlClass } from '../../utils/portfolio'

const COLUMNS = [
  { key: 'name',           label: 'Asset',        align: 'left'  },
  { key: 'units',          label: 'Units'                        },
  { key: 'avg_price',      label: 'Avg cost'                     },
  { key: 'current_price',  label: 'Price'                        },
  { key: 'market_value',   label: 'Value'                        },
  { key: 'day_pnl',        label: 'Today'                        },
  { key: 'unrealized_pnl', label: 'Unrealized P&L'               },
  { key: 'weight',         label: 'Weight'                       },
]

export default function HoldingsTable({ positions, onTrade }) {
  const [sort, setSort] = useState({ key: 'market_value', dir: 'desc' })

  const rows = useMemo(() => {
    const sorted = [...positions].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key]
      const cmp = typeof av === 'string' ? av.localeCompare(bv) : (av ?? 0) - (bv ?? 0)
      return sort.dir === 'asc' ? cmp : -cmp
    })
    return sorted
  }, [positions, sort])

  function toggleSort(key) {
    setSort(s => s.key === key ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' })
  }

  // Widest weight in the book — weight bars are scaled against it so small books still read
  const maxWeight = Math.max(...positions.map(p => p.weight), 1)

  return (
    <div className="overflow-x-auto">
      <table className="data-table w-full">
        <thead>
          <tr>
            {COLUMNS.map(c => (
              <th
                key={c.key}
                onClick={() => toggleSort(c.key)}
                className={`cursor-pointer select-none hover:text-white transition-colors ${c.align === 'left' ? '' : '!text-right'}`}
              >
                <span className="inline-flex items-center gap-1">
                  {c.label}
                  {sort.key === c.key && (sort.dir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                </span>
              </th>
            ))}
            <th className="!text-right">Trade</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(p => (
            <tr key={p.symbol}>
              {/* Asset */}
              <td>
                <div className="flex items-center gap-2.5">
                  <span className="w-1 h-8 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLORS[p.category] }} />
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate max-w-[180px]">{p.name}</p>
                    <p className="text-xs num text-slate-500">{p.symbol}</p>
                  </div>
                </div>
              </td>
              <td className="text-right num text-slate-300">{fmtUnits(p.units)}</td>
              <td className="text-right num text-slate-400">{fmtPrice(p.avg_price, p.symbol)}</td>
              <td className="text-right num">
                <span className="text-white">{fmtPrice(p.current_price, p.symbol)}</span>
                {p.currency !== 'USD' && <span className="text-[10px] text-slate-500 ml-1">{p.currency}</span>}
              </td>
              <td className="text-right num text-white font-medium">{fmtUSD(p.market_value)}</td>
              <td className={`text-right num ${pnlClass(p.day_pnl)}`}>{fmtUSD(p.day_pnl, { sign: true })}</td>
              <td className="text-right num">
                <p className={pnlClass(p.unrealized_pnl)}>{fmtUSD(p.unrealized_pnl, { sign: true })}</p>
                <p className={`text-xs ${pnlClass(p.unrealized_pct)}`}>{fmtPct(p.unrealized_pct)}</p>
              </td>
              {/* Weight — number plus a bar so concentration is visible at a glance */}
              <td className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <div className="w-16 h-1.5 bg-surface rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(p.weight / maxWeight) * 100}%`, background: CATEGORY_COLORS[p.category] }} />
                  </div>
                  <span className="num text-xs text-slate-300 w-11 text-right">{p.weight.toFixed(1)}%</span>
                </div>
              </td>
              <td className="text-right whitespace-nowrap">
                <button onClick={() => onTrade(p.symbol, 'buy')}
                  className="px-2.5 py-1 rounded-md text-xs font-medium text-up bg-up/10 hover:bg-up/20 transition-colors mr-1.5">
                  Buy
                </button>
                <button onClick={() => onTrade(p.symbol, 'sell')}
                  className="px-2.5 py-1 rounded-md text-xs font-medium text-down bg-down/10 hover:bg-down/20 transition-colors">
                  Sell
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
