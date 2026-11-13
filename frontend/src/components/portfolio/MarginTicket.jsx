/**
 * MarginTicket — open a leveraged Long or Short position (CFD-style).
 *
 * The user posts margin (cash collateral) and picks a leverage. Exposure =
 * margin × leverage, so a 1% price move changes the position's value by
 * leverage %. If losses eat half the margin the position is auto-closed
 * ("liquidated"); you can never lose more than the margin you posted.
 *
 * Props:
 *   instrument — { symbol, name, category, currency, price, max_leverage }
 *   cash       — available cash (USD)
 *   fx         — USD per 1 unit of the instrument's quote currency
 *   onExecuted — called with the API's success message
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, AlertTriangle, Wallet, ShieldAlert, Info } from 'lucide-react'
import { openMarginPosition } from '../../services/api'
import { fmtUSD, fmtUnits, fmtPrice } from '../../utils/format'
import { LEVERAGE_PRESETS, liquidationPrice } from '../../utils/portfolio'

const QUICK_PCTS = [10, 25, 50, 100]
// Quick distances for stop-loss / take-profit, as % move from the current price
const SL_PCTS = [2, 5, 10]
const TP_PCTS = [5, 10, 20]

/** Price input for SL / TP with quick-% chips. `adverse` = chip moves price against the position. */
function LevelInput({ label, value, onChange, pcts, side, price, adverse, symbol, hint }) {
  // Long: adverse moves are down; Short: adverse moves are up
  const sign = (side === 'long') === adverse ? -1 : 1
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] text-slate-500">{label}</span>
        <div className="flex gap-1">
          {pcts.map(p => (
            <button key={p} type="button"
              onClick={() => onChange(String(+(price * (1 + sign * p / 100)).toPrecision(8)))}
              className="px-1.5 py-0.5 rounded text-[10px] num bg-surface-hover text-slate-400 hover:text-white transition-colors">
              {sign > 0 ? '+' : '−'}{p}%
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center bg-surface border border-surface-border rounded-lg focus-within:border-brand/60">
        <input
          type="number" step="any" min="0" value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={`Optional · now ${fmtPrice(price, symbol)}`}
          className="flex-1 min-w-0 bg-transparent px-3 py-2 text-sm num text-white placeholder:text-slate-700 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        {value && (
          <button type="button" onClick={() => onChange('')} className="px-2 text-xs text-slate-500 hover:text-white">✕</button>
        )}
      </div>
      {hint && <p className="text-[10px] num mt-1 text-slate-500">{hint}</p>}
    </div>
  )
}

export default function MarginTicket({ instrument, cash, fx, onExecuted }) {
  const maxLev = instrument.max_leverage ?? 1
  const [side, setSide]         = useState('long')
  const [leverage, setLeverage] = useState(Math.min(2, maxLev))
  const [input, setInput]       = useState('')
  const [slInput, setSlInput]   = useState('')
  const [tpInput, setTpInput]   = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]       = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const price  = instrument.price
  const dir    = side === 'long' ? 1 : -1
  const margin = parseFloat(input) || 0
  const sl     = slInput === '' ? null : parseFloat(slInput)
  const tp     = tpInput === '' ? null : parseFloat(tpInput)

  // ── Order math (mirrors backend/app/services/margin.py) ──
  const exposure = margin * leverage
  const units    = exposure / (price * (fx ?? 1))
  const liq      = liquidationPrice(side, price, leverage)
  const liqDist  = (50 / leverage)                 // % adverse move to close-out
  const perPct   = exposure / 100                  // USD gained/lost per 1% move
  const pnlAt    = level => dir * units * (level - price) * (fx ?? 1)

  // SL/TP validation — same rules as the backend, shown before submitting
  const levelError = useMemo(() => {
    if (sl != null && (Number.isNaN(sl) || (side === 'long' ? sl >= price : sl <= price)))
      return `Stop-loss must be ${side === 'long' ? 'below' : 'above'} the current price for a ${side}.`
    if (tp != null && (Number.isNaN(tp) || (side === 'long' ? tp <= price : tp >= price)))
      return `Take-profit must be ${side === 'long' ? 'above' : 'below'} the current price for a ${side}.`
    return null
  }, [sl, tp, side, price])

  // Stop beyond the liquidation price would never trigger — warn but allow
  const slPastLiq = sl != null && !levelError && (side === 'long' ? sl <= liq : sl >= liq)

  const risk   = sl != null && !levelError && margin ? Math.max(pnlAt(sl), -margin) : null
  const reward = tp != null && !levelError && margin ? pnlAt(tp) : null

  const overLimit = margin > cash + 0.005
  const canSubmit = margin > 0 && !overLimit && !levelError && !submitting

  function applyQuick(pct) {
    setInput(String(Math.floor(cash * pct) / 100))   // round down to the cent
  }

  async function submit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const res = await openMarginPosition({
        symbol: instrument.symbol, side, leverage, margin_usd: margin,
        stop_loss: sl, take_profit: tp,
      })
      onExecuted(res.message)
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Order failed — please try again.')
      setSubmitting(false)
    }
  }

  const isLong = side === 'long'

  return (
    <form onSubmit={submit}>
      {/* Long / Short segmented control */}
      <div className="grid grid-cols-2 gap-1 bg-surface rounded-lg p-1 mb-4">
        {['long', 'short'].map(s => (
          <button key={s} type="button"
            onClick={() => { setSide(s); setSlInput(''); setTpInput(''); setError(null) }}
            className={`py-2 rounded-md text-sm font-semibold capitalize transition-colors ${
              side === s
                ? s === 'long' ? 'bg-up/15 text-up' : 'bg-down/15 text-down'
                : 'text-slate-400 hover:text-white'
            }`}>
            {s === 'long' ? '▲ Long' : '▼ Short'}
          </button>
        ))}
      </div>

      {/* Leverage chips — presets above this asset class's cap are disabled */}
      <div className="flex items-center justify-between text-xs mb-1.5">
        <span className="text-slate-500">Leverage</span>
        <span className="text-slate-600">max {maxLev}x for {instrument.category}</span>
      </div>
      <div className="grid grid-cols-6 gap-1.5 mb-4">
        {LEVERAGE_PRESETS.map(l => (
          <button key={l} type="button" disabled={l > maxLev} onClick={() => setLeverage(l)}
            className={`py-1.5 rounded-md text-xs num font-medium transition-colors disabled:opacity-25 disabled:cursor-not-allowed ${
              leverage === l ? 'bg-brand text-white' : 'bg-surface-hover text-slate-400 hover:text-white'
            }`}>
            {l}x
          </button>
        ))}
      </div>

      {/* Margin amount */}
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="text-slate-500 flex items-center gap-1.5"><Wallet size={12} /> Margin (from cash)</span>
        <span className="num text-slate-300">{fmtUSD(cash)} available</span>
      </div>
      <div className="flex items-stretch bg-surface border border-surface-border rounded-lg focus-within:border-brand/60 mb-2">
        <span className="pl-3 flex items-center text-slate-500 text-sm num">$</span>
        <input
          ref={inputRef} type="number" step="any" min="0" value={input}
          onChange={e => setInput(e.target.value)} placeholder="0.00"
          className="flex-1 bg-transparent px-2 py-3 text-lg num text-white placeholder:text-slate-700 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <span className="px-3 flex items-center text-xs text-slate-500 border-l border-surface-border num">
          × {leverage} = {fmtUSD(exposure, { compact: true })}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1.5 mb-4">
        {QUICK_PCTS.map(p => (
          <button key={p} type="button" onClick={() => applyQuick(p)}
            className="py-1.5 rounded-md bg-surface-hover text-xs text-slate-400 hover:text-white hover:bg-surface-border transition-colors">
            {p === 100 ? 'Max' : `${p}%`}
          </button>
        ))}
      </div>

      {/* Stop-loss / take-profit */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <LevelInput label="Stop-loss" value={slInput} onChange={setSlInput} pcts={SL_PCTS}
          side={side} price={price} adverse symbol={instrument.symbol}
          hint={risk != null ? `Risk ${fmtUSD(risk, { sign: true })}` : null} />
        <LevelInput label="Take-profit" value={tpInput} onChange={setTpInput} pcts={TP_PCTS}
          side={side} price={price} adverse={false} symbol={instrument.symbol}
          hint={reward != null ? `Reward ${fmtUSD(reward, { sign: true })}` : null} />
      </div>

      {/* Order preview */}
      <div className="bg-surface rounded-lg p-3 space-y-1.5 text-xs mb-4">
        <Row label="Exposure" value={fmtUSD(exposure)} />
        <Row label="Units" value={margin ? fmtUnits(units) : '—'} />
        <Row label="Per 1% move" value={margin ? `±${fmtUSD(perPct)}` : '—'} />
        <Row label="Liquidation price"
          value={<>{fmtPrice(liq, instrument.symbol)} <span className="text-slate-500">({isLong ? '−' : '+'}{liqDist.toFixed(1)}%)</span></>}
          className="text-amber-400" />
        {risk != null && reward != null && risk < 0 && (
          <Row label="Reward : risk" value={`${(reward / -risk).toFixed(2)} : 1`} />
        )}
        <p className="text-[11px] text-slate-600 pt-1 flex items-start gap-1.5">
          <Info size={11} className="mt-px flex-shrink-0" />
          Auto-closed when losses reach 50% of margin. SL/TP fill at the next price check (~5 min), so the fill can slip past your level.
        </p>
      </div>

      {leverage >= 10 && (
        <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2 mb-4">
          <ShieldAlert size={14} className="flex-shrink-0 mt-px" />
          At {leverage}x, a {liqDist.toFixed(1)}% move against you liquidates this position.
        </div>
      )}
      {slPastLiq && (
        <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-400/10 border border-amber-400/20 rounded-lg px-3 py-2 mb-4">
          <AlertTriangle size={14} className="flex-shrink-0 mt-px" />
          Your stop-loss is beyond the liquidation price, so liquidation would hit first.
        </div>
      )}
      {(error || overLimit || levelError) && (
        <div className="flex items-start gap-2 text-xs text-down bg-down/10 border border-down/20 rounded-lg px-3 py-2 mb-4">
          <AlertTriangle size={14} className="flex-shrink-0 mt-px" />
          {error ?? levelError ?? 'Not enough cash for this margin.'}
        </div>
      )}

      <button type="submit" disabled={!canSubmit}
        className={`w-full py-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed text-white ${
          isLong ? 'bg-up hover:bg-up/90' : 'bg-down hover:bg-down/90'
        }`}>
        {submitting && <Loader2 size={15} className="animate-spin" />}
        {isLong ? 'Long' : 'Short'} {instrument.symbol} {leverage}x
        {margin > 0 && !overLimit ? ` · ${fmtUSD(margin)} margin` : ''}
      </button>
    </form>
  )
}

function Row({ label, value, className = 'text-slate-200' }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`num ${className}`}>{value}</span>
    </div>
  )
}
