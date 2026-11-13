/**
 * TransactionsList — the trade log, newest first, filterable by side.
 *
 * Props:
 *   transactions — from /api/portfolio/transactions
 */
import { useState } from 'react'
import { ArrowDownLeft, ArrowUpRight, Receipt } from 'lucide-react'
import { fmtUSD, fmtUnits, fmtPrice, timeAgo } from '../../utils/format'
import { pnlClass, asUTC } from '../../utils/portfolio'

const FILTERS = [
  { key: 'all',  label: 'All'   },
  { key: 'buy',  label: 'Buys'  },
  { key: 'sell', label: 'Sells' },
]

export default function TransactionsList({ transactions }) {
  const [filter, setFilter] = useState('all')
  const rows = filter === 'all' ? transactions : transactions.filter(t => t.side === filter)

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-slate-300 flex items-center gap-2">
          <Receipt size={14} className="text-slate-500" />
          Transaction History
          <span className="text-slate-600 num text-xs">{transactions.length}</span>
        </h3>
        <div className="flex gap-1 bg-surface-border/40 rounded-lg p-0.5">
          {FILTERS.map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-2.5 py-0.5 text-[11px] rounded font-medium transition-all ${
                filter === f.key ? 'bg-brand text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="text-xs text-slate-600 italic py-6 text-center">No trades yet.</p>
      ) : (
        <div className="space-y-1.5 max-h-[420px] overflow-y-auto pr-1">
          {rows.map(t => {
            const isBuy = t.side === 'buy'
            const Icon = isBuy ? ArrowDownLeft : ArrowUpRight
            return (
              <div key={t.id} className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-surface hover:bg-surface-hover transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${isBuy ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}>
                    <Icon size={14} />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">
                      <span className={`font-semibold ${isBuy ? 'text-up' : 'text-down'}`}>{isBuy ? 'Buy' : 'Sell'}</span>{' '}
                      {t.name}
                    </p>
                    <p className="text-[11px] num text-slate-500">
                      {fmtUnits(t.units)} {t.symbol} @ {fmtPrice(t.price, t.symbol)}{t.currency !== 'USD' ? ` ${t.currency}` : ''}
                      <span className="text-slate-600"> · </span>
                      <span title={new Date(asUTC(t.executed_at)).toLocaleString()}>{timeAgo(asUTC(t.executed_at))}</span>
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm num text-white">{isBuy ? '−' : '+'}{fmtUSD(t.amount_usd)}</p>
                  {t.realized_pnl != null && (
                    <p className={`text-[11px] num ${pnlClass(t.realized_pnl)}`}>
                      P&L {fmtUSD(t.realized_pnl, { sign: true })}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
