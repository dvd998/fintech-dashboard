/**
 * MarginPositionsTable — open leveraged Long/Short positions.
 *
 * Each row shows the side + leverage, entry vs. current price, how far the
 * price is from the liquidation level (bar turns amber when close), editable
 * stop-loss / take-profit, margin, and P&L with return on margin (ROE).
 *
 * Props:
 *   positions — summary.margin_positions
 *   onChanged — (message) => void, called after a close / SL-TP edit succeeds
 */
import { useState } from 'react'
import { Pencil, Check, X, Loader2 } from 'lucide-react'
import { closeMarginPosition, updateMarginPosition } from '../../services/api'
import { CATEGORY_COLORS } from '../../utils/assetDetail'
import { fmtUSD, fmtPct, fmtPrice } from '../../utils/format'
import { pnlClass, NEAR_LIQUIDATION_PCT } from '../../utils/portfolio'

/** Long/Short badge with a leverage pill. */
export function SideBadge({ side, leverage }) {
  const isLong = side === 'long'
  return (
    <span className="inline-flex items-center rounded overflow-hidden text-[10px] font-semibold uppercase tracking-wider">
      <span className={`px-1.5 py-0.5 ${isLong ? 'bg-up/15 text-up' : 'bg-down/15 text-down'}`}>
        {isLong ? '▲ Long' : '▼ Short'}
      </span>
      <span className="px-1.5 py-0.5 bg-surface-hover text-slate-300 num">{+leverage}x</span>
    </span>
  )
}

/**
 * Distance-to-liquidation bar. Full bar = price at entry-level safety
 * (50/L % away); it drains as the price moves toward the close-out level.
 */
function LiquidationCell({ p }) {
  const startDist = 50 / p.leverage
  const dist = p.liq_distance_pct ?? startDist
  const fill = Math.max(0, Math.min(100, (dist / startDist) * 100))
  const near = dist < NEAR_LIQUIDATION_PCT
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`num ${near ? 'text-amber-400' : 'text-slate-300'}`}>{fmtPrice(p.liquidation_price, p.symbol)}</span>
      <div className="flex items-center gap-1.5" title={`${dist.toFixed(1)}% away from liquidation`}>
        <span className={`text-[10px] num ${near ? 'text-amber-400' : 'text-slate-500'}`}>{dist.toFixed(1)}%</span>
        <div className="w-12 h-1 bg-surface rounded-full overflow-hidden">
          <div className={`h-full rounded-full ${near ? 'bg-amber-400' : 'bg-slate-500'}`} style={{ width: `${fill}%` }} />
        </div>
      </div>
    </div>
  )
}

/** SL / TP cell — shows the levels; pencil switches to inline inputs. */
function LevelsCell({ p, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [sl, setSl] = useState('')
  const [tp, setTp] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  function start() {
    setSl(p.stop_loss != null ? String(p.stop_loss) : '')
    setTp(p.take_profit != null ? String(p.take_profit) : '')
    setError(null)
    setEditing(true)
  }

  async function save() {
    setBusy(true)
    setError(null)
    try {
      const res = await updateMarginPosition(p.id, {
        stop_loss: sl === '' ? null : parseFloat(sl),
        take_profit: tp === '' ? null : parseFloat(tp),
      })
      setEditing(false)
      onChanged(res.message)
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Update failed')
    } finally {
      setBusy(false)
    }
  }

  if (!editing) {
    return (
      <button onClick={start} className="group text-right w-full" title="Edit stop-loss / take-profit">
        <p className="text-xs num">
          <span className="text-slate-600">SL </span>
          <span className={p.stop_loss != null ? 'text-amber-400' : 'text-slate-600'}>{p.stop_loss != null ? fmtPrice(p.stop_loss, p.symbol) : '—'}</span>
        </p>
        <p className="text-xs num">
          <span className="text-slate-600">TP </span>
          <span className={p.take_profit != null ? 'text-up' : 'text-slate-600'}>{p.take_profit != null ? fmtPrice(p.take_profit, p.symbol) : '—'}</span>
          <Pencil size={10} className="inline ml-1.5 text-slate-600 group-hover:text-white transition-colors" />
        </p>
      </button>
    )
  }

  const inputCls = 'w-24 bg-surface border border-surface-border rounded px-1.5 py-0.5 text-xs num text-white focus:outline-none focus:border-brand/60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none'
  return (
    <div className="flex flex-col items-end gap-1">
      <label className="flex items-center gap-1 text-[10px] text-slate-500">SL
        <input type="number" step="any" value={sl} onChange={e => setSl(e.target.value)} placeholder="none" className={inputCls} />
      </label>
      <label className="flex items-center gap-1 text-[10px] text-slate-500">TP
        <input type="number" step="any" value={tp} onChange={e => setTp(e.target.value)} placeholder="none" className={inputCls} />
      </label>
      <div className="flex gap-1">
        <button onClick={save} disabled={busy} className="p-1 rounded text-up hover:bg-up/10" title="Save">
          {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
        </button>
        <button onClick={() => setEditing(false)} className="p-1 rounded text-slate-500 hover:text-white" title="Cancel"><X size={12} /></button>
      </div>
      {error && <p className="text-[10px] text-down max-w-[180px] text-right">{error}</p>}
    </div>
  )
}

function CloseButton({ p, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  async function close() {
    setBusy(true)
    setError(null)
    try {
      const res = await closeMarginPosition(p.id)
      onChanged(res.message)
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Close failed')
      setBusy(false)
    }
  }
  return (
    <div className="flex flex-col items-end">
      <button onClick={close} disabled={busy}
        className="px-2.5 py-1 rounded-md text-xs font-medium text-slate-300 bg-surface-hover hover:bg-surface-border hover:text-white transition-colors flex items-center gap-1.5 disabled:opacity-50">
        {busy && <Loader2 size={11} className="animate-spin" />}
        Close
      </button>
      {error && <p className="text-[10px] text-down mt-1">{error}</p>}
    </div>
  )
}

export default function MarginPositionsTable({ positions, onChanged }) {
  return (
    <div className="overflow-x-auto">
      <table className="data-table w-full">
        <thead>
          <tr>
            <th>Position</th>
            <th className="!text-right">Entry</th>
            <th className="!text-right">Price</th>
            <th className="!text-right">Liquidation</th>
            <th className="!text-right">SL / TP</th>
            <th className="!text-right">Margin · Exposure</th>
            <th className="!text-right">P&L · ROE</th>
            <th className="!text-right"></th>
          </tr>
        </thead>
        <tbody>
          {positions.map(p => (
            <tr key={p.id}>
              <td>
                <div className="flex items-center gap-2.5">
                  <span className="w-1 h-9 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLORS[p.category] }} />
                  <div className="min-w-0">
                    <p className="text-white font-medium truncate max-w-[180px]">{p.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <SideBadge side={p.side} leverage={p.leverage} />
                      <span className="text-xs num text-slate-500">{p.symbol}</span>
                    </div>
                  </div>
                </div>
              </td>
              <td className="text-right num text-slate-400">{fmtPrice(p.entry_price, p.symbol)}</td>
              <td className="text-right num">
                <span className="text-white">{fmtPrice(p.current_price, p.symbol)}</span>
                {p.currency !== 'USD' && <span className="text-[10px] text-slate-500 ml-1">{p.currency}</span>}
              </td>
              <td className="text-right"><LiquidationCell p={p} /></td>
              <td className="text-right"><LevelsCell p={p} onChanged={onChanged} /></td>
              <td className="text-right num">
                <p className="text-white">{fmtUSD(p.margin)}</p>
                <p className="text-xs text-slate-500">{fmtUSD(p.notional, { compact: true })}</p>
              </td>
              <td className="text-right num">
                <p className={pnlClass(p.pnl)}>{fmtUSD(p.pnl, { sign: true })}</p>
                <p className={`text-xs ${pnlClass(p.roe_pct)}`}>{fmtPct(p.roe_pct)}</p>
              </td>
              <td className="text-right"><CloseButton p={p} onChanged={onChanged} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
