/**
 * TradeModal — place a simulated market order at the current price.
 *
 * Flow:
 *   1. Pick an instrument (searchable list, filterable by asset class)
 *   2. Pick a mode:
 *        Invest — Buy / Sell the asset itself (Sell only when you hold it)
 *        Margin — leveraged Long / Short with stop-loss & take-profit (see MarginTicket)
 *   3. Enter a size in dollars or units — or use the quick 10/25/50/100% chips
 *   4. Review the order preview and confirm
 *
 * Props:
 *   instruments   — [{ symbol, name, category, currency, price, change_percent }]
 *   positions     — open positions from the portfolio summary
 *   cash          — available cash (USD)
 *   initialSymbol — preselect an asset (e.g. coming from a "Buy more" button)
 *   initialSide   — 'buy' | 'sell'
 *   initialMode   — 'invest' | 'margin'
 *   onClose       — close without trading
 *   onExecuted    — called with the API's success message after a trade
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Search, ArrowLeft, Loader2, AlertTriangle, Wallet } from 'lucide-react'
import { executeTrade } from '../../services/api'
import { CATEGORY_COLORS } from '../../utils/assetDetail'
import { fmtUSD, fmtPct, fmtUnits, fmtPrice } from '../../utils/format'
import { CATEGORY_ORDER, CATEGORY_LABELS, usdPer, pnlClass } from '../../utils/portfolio'
import MarginTicket from './MarginTicket'

const QUICK_PCTS = [10, 25, 50, 100]

// ── Step 1: instrument picker ────────────────────────────────────────────────

function InstrumentPicker({ instruments, positions, onPick }) {
  const [query, setQuery]       = useState('')
  const [category, setCategory] = useState('all')
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [])

  const held = useMemo(() => new Set(positions.map(p => p.symbol)), [positions])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return instruments.filter(i =>
      (category === 'all' || i.category === category) &&
      (!q || i.symbol.toLowerCase().includes(q) || i.name.toLowerCase().includes(q))
    )
  }, [instruments, query, category])

  return (
    <>
      {/* Search box */}
      <div className="relative mb-3">
        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name or ticker — e.g. Apple, BTC, Gold"
          className="w-full bg-surface border border-surface-border rounded-lg pl-9 pr-3 py-2.5 text-sm text-white placeholder:text-slate-600 focus:outline-none focus:border-brand/60"
        />
      </div>

      {/* Asset-class filter chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {['all', ...CATEGORY_ORDER].map(c => (
          <button
            key={c}
            onClick={() => setCategory(c)}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              category === c ? 'bg-brand text-white' : 'bg-surface-hover text-slate-400 hover:text-white'
            }`}
          >
            {c === 'all' ? 'All' : CATEGORY_LABELS[c]}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1 space-y-1">
        {filtered.length === 0 && (
          <p className="text-sm text-slate-500 text-center py-8">No instruments match “{query}”.</p>
        )}
        {filtered.map(i => (
          <button
            key={i.symbol}
            onClick={() => onPick(i)}
            disabled={!i.price}
            className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg hover:bg-surface-hover transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <div className="flex items-center gap-3 min-w-0">
              {/* Category color dot — same accent the market pages use */}
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: CATEGORY_COLORS[i.category] }} />
              <div className="min-w-0">
                <p className="text-sm text-white truncate">
                  {i.name}
                  {held.has(i.symbol) && (
                    <span className="ml-2 text-[10px] uppercase tracking-wider text-brand bg-brand/10 px-1.5 py-0.5 rounded">Held</span>
                  )}
                </p>
                <p className="text-xs num text-slate-500">{i.symbol}</p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className="text-sm num text-white">
                {fmtPrice(i.price, i.symbol)} <span className="text-[10px] text-slate-500">{i.currency}</span>
              </p>
              <p className={`text-xs num ${pnlClass(i.change_percent)}`}>{fmtPct(i.change_percent)}</p>
            </div>
          </button>
        ))}
      </div>
    </>
  )
}

// ── Step 2: order ticket ─────────────────────────────────────────────────────

function OrderTicket({ instrument, position, cash, totalValue, fx, initialSide, onExecuted }) {
  const [side, setSide]       = useState(position ? initialSide : 'buy')
  const [unitMode, setUnitMode] = useState(false)     // false = size in USD, true = size in units
  const [input, setInput]     = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError]     = useState(null)
  const inputRef = useRef(null)

  useEffect(() => { inputRef.current?.focus() }, [side, unitMode])

  // USD value of one unit at the current price (quote currency converted to USD)
  const unitUsd = instrument.price * (fx ?? 1)
  const amount  = parseFloat(input) || 0

  // Normalise whatever was typed into both a USD amount and a unit count
  const { usd, units } = useMemo(() => {
    if (side === 'sell' && position) {
      // Sells are valued off the position's market value, matching the backend
      const usdPerHeldUnit = position.market_value / position.units
      return unitMode
        ? { usd: amount * usdPerHeldUnit, units: amount }
        : { usd: amount, units: amount / usdPerHeldUnit }
    }
    return unitMode
      ? { usd: amount * unitUsd, units: amount }
      : { usd: amount, units: amount / unitUsd }
  }, [amount, unitMode, side, position, unitUsd])

  const maxUsd = side === 'buy' ? cash : (position?.market_value ?? 0)
  const overLimit = usd > maxUsd + 0.005
  const canSubmit = amount > 0 && !overLimit && !submitting

  // Projected state after the trade, for the preview box
  const cashAfter   = side === 'buy' ? cash - usd : cash + usd
  const posValAfter = (position?.market_value ?? 0) + (side === 'buy' ? usd : -usd)
  const weightAfter = totalValue ? (posValAfter / totalValue) * 100 : 0

  function applyQuick(pct) {
    const targetUsd = maxUsd * pct / 100
    if (unitMode) {
      const perUnit = side === 'sell' && position ? position.market_value / position.units : unitUsd
      // 100% of a position: use the exact held units so the sell closes it cleanly
      setInput(String(side === 'sell' && pct === 100 ? position.units : +(targetUsd / perUnit).toFixed(8)))
    } else {
      // Round down to the cent so 100% never exceeds available cash
      setInput(String(Math.floor(targetUsd * 100) / 100))
    }
  }

  async function submit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSubmitting(true)
    setError(null)
    try {
      const payload = { symbol: instrument.symbol, side }
      // Selling exactly 100% → send units so the position closes with no dust
      if (side === 'sell' && Math.abs(usd - maxUsd) < 0.01) payload.units = position.units
      else if (unitMode) payload.units = amount
      else payload.amount_usd = amount
      const res = await executeTrade(payload)
      onExecuted(res.message)
    } catch (err) {
      setError(err.response?.data?.detail ?? 'Trade failed — please try again.')
      setSubmitting(false)
    }
  }

  const isBuy = side === 'buy'

  return (
    <form onSubmit={submit}>
      {/* Buy / Sell segmented control */}
      <div className="grid grid-cols-2 gap-1 bg-surface rounded-lg p-1 mb-4">
        {['buy', 'sell'].map(s => (
          <button
            key={s}
            type="button"
            disabled={s === 'sell' && !position}
            title={s === 'sell' && !position ? "You don't hold this asset" : undefined}
            onClick={() => { setSide(s); setInput(''); setError(null) }}
            className={`py-2 rounded-md text-sm font-semibold capitalize transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${
              side === s
                ? s === 'buy' ? 'bg-up/15 text-up' : 'bg-down/15 text-down'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      {/* Available balance line */}
      <div className="flex items-center justify-between text-xs mb-2">
        <span className="text-slate-500 flex items-center gap-1.5">
          <Wallet size={12} />
          {isBuy ? 'Available cash' : 'Position value'}
        </span>
        <span className="num text-slate-300">
          {fmtUSD(maxUsd)}
          {!isBuy && position && <span className="text-slate-500"> · {fmtUnits(position.units)} units</span>}
        </span>
      </div>

      {/* Size input with USD/units toggle */}
      <div className="flex items-stretch bg-surface border border-surface-border rounded-lg focus-within:border-brand/60 mb-2">
        <span className="pl-3 flex items-center text-slate-500 text-sm num">{unitMode ? '#' : '$'}</span>
        <input
          ref={inputRef}
          type="number"
          step="any"
          min="0"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="0.00"
          className="flex-1 bg-transparent px-2 py-3 text-lg num text-white placeholder:text-slate-700 focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        <button
          type="button"
          onClick={() => { setUnitMode(m => !m); setInput('') }}
          className="px-3 text-xs font-medium text-slate-400 hover:text-white border-l border-surface-border transition-colors"
          title="Switch between dollar amount and number of units"
        >
          {unitMode ? 'Units' : 'USD'} ⇄
        </button>
      </div>

      {/* Quick-size chips */}
      <div className="grid grid-cols-4 gap-1.5 mb-4">
        {QUICK_PCTS.map(p => (
          <button
            key={p}
            type="button"
            onClick={() => applyQuick(p)}
            className="py-1.5 rounded-md bg-surface-hover text-xs text-slate-400 hover:text-white hover:bg-surface-border transition-colors"
          >
            {p === 100 ? (isBuy ? 'Max' : 'All') : `${p}%`}
          </button>
        ))}
      </div>

      {/* Order preview */}
      <div className="bg-surface rounded-lg p-3 space-y-1.5 text-xs mb-4">
        <PreviewRow label={unitMode ? 'Estimated cost' : 'Estimated units'}
          value={unitMode ? fmtUSD(usd) : fmtUnits(units)} />
        <PreviewRow label="Cash after trade" value={fmtUSD(cashAfter)} warn={cashAfter < -0.005} />
        <PreviewRow label="Position weight after" value={`${Math.max(0, weightAfter).toFixed(1)}%`} />
        {!isBuy && position && amount > 0 && (
          <PreviewRow
            label="Realized P&L (est.)"
            value={fmtUSD(position.unrealized_pnl * Math.min(1, usd / position.market_value), { sign: true })}
            className={pnlClass(position.unrealized_pnl)}
          />
        )}
        {instrument.currency !== 'USD' && (
          <p className="text-[11px] text-slate-600 pt-1">
            Quoted in {instrument.currency}; P&L converted to USD at the live rate.
          </p>
        )}
      </div>

      {(error || overLimit) && (
        <div className="flex items-start gap-2 text-xs text-down bg-down/10 border border-down/20 rounded-lg px-3 py-2 mb-4">
          <AlertTriangle size={14} className="flex-shrink-0 mt-px" />
          {error ?? (isBuy ? 'Not enough cash for this order.' : 'You can’t sell more than you hold.')}
        </div>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className={`w-full py-3 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed ${
          isBuy ? 'bg-up text-white hover:bg-up/90' : 'bg-down text-white hover:bg-down/90'
        }`}
      >
        {submitting && <Loader2 size={15} className="animate-spin" />}
        {isBuy ? 'Buy' : 'Sell'} {instrument.symbol}{amount > 0 && !overLimit ? ` · ${fmtUSD(usd)}` : ''}
      </button>
    </form>
  )
}

function PreviewRow({ label, value, warn, className = 'text-slate-200' }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-500">{label}</span>
      <span className={`num ${warn ? 'text-down' : className}`}>{value}</span>
    </div>
  )
}

/** Selected instrument: name, symbol, live price — shared by both tickets. */
function InstrumentHeader({ instrument, onBack }) {
  return (
    <>
      <button type="button" onClick={onBack} className="flex items-center gap-1 text-xs text-slate-500 hover:text-white mb-3 transition-colors">
        <ArrowLeft size={13} /> Change instrument
      </button>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full" style={{ background: CATEGORY_COLORS[instrument.category] }} />
            <h3 className="text-lg font-semibold text-white">{instrument.name}</h3>
          </div>
          <p className="text-xs num text-slate-500 mt-0.5">{instrument.symbol} · {CATEGORY_LABELS[instrument.category]}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold num text-white">
            {fmtPrice(instrument.price, instrument.symbol)} <span className="text-xs text-slate-500">{instrument.currency}</span>
          </p>
          <p className={`text-xs num ${pnlClass(instrument.change_percent)}`}>{fmtPct(instrument.change_percent)} today</p>
        </div>
      </div>
    </>
  )
}

// ── Modal shell ──────────────────────────────────────────────────────────────

// Invest = buy/own the asset (1x, no liquidation). Margin = leveraged Long/Short.
const MODES = [
  { key: 'invest', label: 'Invest',          hint: 'Own the asset · 1x' },
  { key: 'margin', label: 'Margin · Long/Short', hint: 'Leverage · can short' },
]

export default function TradeModal({
  instruments, positions, cash, totalValue,
  initialSymbol, initialSide = 'buy', initialMode = 'invest', onClose, onExecuted,
}) {
  const [selected, setSelected] = useState(
    () => instruments.find(i => i.symbol === initialSymbol) ?? null
  )
  const [mode, setMode] = useState(initialMode)

  // Close on Escape
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const position = selected ? positions.find(p => p.symbol === selected.symbol) : null
  const fx = selected ? usdPer(selected.currency, instruments) : 1

  return (
    // Backdrop — clicking outside the dialog closes it
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="w-full max-w-md max-h-[92vh] overflow-y-auto bg-surface-card border border-surface-border rounded-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">{selected ? 'Place order' : 'Choose an instrument'}</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-white transition-colors p-1">
            <X size={18} />
          </button>
        </div>

        {selected ? (
          <>
            <InstrumentHeader instrument={selected} onBack={() => setSelected(null)} />

            {/* Invest | Margin tabs */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {MODES.map(m => (
                <button key={m.key} type="button" onClick={() => setMode(m.key)}
                  className={`text-left px-3 py-2 rounded-lg border transition-colors ${
                    mode === m.key
                      ? 'border-brand/60 bg-brand/10'
                      : 'border-surface-border hover:border-slate-600'
                  }`}>
                  <p className={`text-sm font-medium ${mode === m.key ? 'text-white' : 'text-slate-300'}`}>{m.label}</p>
                  <p className="text-[11px] text-slate-500">{m.hint}</p>
                </button>
              ))}
            </div>

            {mode === 'invest'
              ? <OrderTicket
                  key={selected.symbol}
                  instrument={selected}
                  position={position}
                  cash={cash}
                  totalValue={totalValue}
                  fx={fx}
                  initialSide={initialSide}
                  onExecuted={onExecuted}
                />
              : <MarginTicket
                  key={selected.symbol}
                  instrument={selected}
                  cash={cash}
                  fx={fx}
                  onExecuted={onExecuted}
                />
            }
          </>
        ) : (
          <InstrumentPicker instruments={instruments} positions={positions} onPick={setSelected} />
        )}
      </div>
    </div>
  )
}
