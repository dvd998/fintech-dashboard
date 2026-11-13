/**
 * Portfolio — paper-trading simulator.
 *
 * The user starts with virtual cash (default $100,000) and buys/sells any
 * tracked instrument at the live price. Everything is persisted in SQLite, so
 * positions keep tracking real market moves over the following days.
 *
 * Layout:
 *   1. Header — title + "New Trade" / "Reset" buttons
 *   2. KPI row — total value, today's P&L, unrealized/realized P&L, cash
 *   3. Equity curve vs. S&P 500 (since start, or a backtest of current holdings)
 *      + allocation donut
 *   4. Holdings table with inline Buy/Sell
 *   5. Transaction history + performance insights
 *
 * Deep link: /ai-playground/portfolio?trade=AAPL&side=buy opens the trade
 * modal preselected — used by the "Trade" button on every asset detail panel.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Briefcase, Plus, RotateCcw, Wallet, TrendingUp, TrendingDown, Activity,
  CheckCircle2, X, Loader2, Trophy, AlertTriangle, Target, CalendarDays, Info,
} from 'lucide-react'
import {
  fetchPortfolio, fetchInstruments, fetchTransactions, fetchPortfolioHistory, resetPortfolio,
} from '../services/api'
import { fmtUSD, fmtPct } from '../utils/format'
import { pnlClass, asUTC } from '../utils/portfolio'
import { CATEGORY_COLORS } from '../utils/assetDetail'
import TradeModal from '../components/portfolio/TradeModal'
import EquityChart, { PORTFOLIO_COLOR, BENCHMARK_COLOR } from '../components/portfolio/EquityChart'
import AllocationDonut from '../components/portfolio/AllocationDonut'
import HoldingsTable from '../components/portfolio/HoldingsTable'
import TransactionsList from '../components/portfolio/TransactionsList'

// Chart ranges: "Since start" replays real trades; the rest backtest today's holdings
const RANGES = [
  { key: 'actual', label: 'Since start' },
  { key: '30',     label: '1M', days: 30  },
  { key: '90',     label: '3M', days: 90  },
  { key: '180',    label: '6M', days: 180 },
  { key: '365',    label: '1Y', days: 365 },
]

// Starter ideas shown on an empty portfolio — one per asset class
const STARTER_IDEAS = ['AAPL', 'NVDA', 'BTC-USD', 'ETH-USD', 'GC=F', 'EURUSD=X', '^GSPC']

// A single position above this share of the portfolio triggers a concentration warning
const CONCENTRATION_LIMIT = 25

const POLL_MS = 60_000   // re-value the book every minute while the page is open

// ── Small building blocks ────────────────────────────────────────────────────

function KpiCard({ label, icon: Icon, children, accent }) {
  return (
    <div className="card relative overflow-hidden">
      {/* Soft accent glow in the corner — purely decorative */}
      {accent && <div className="absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-20" style={{ background: accent }} />}
      <p className="text-[11px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5 mb-2">
        <Icon size={12} /> {label}
      </p>
      {children}
    </div>
  )
}

function Toast({ message, onClose }) {
  useEffect(() => {
    const t = setTimeout(onClose, 4000)
    return () => clearTimeout(t)
  }, [message, onClose])
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-surface-card border border-up/30 rounded-xl px-4 py-3 shadow-2xl">
      <CheckCircle2 size={18} className="text-up" />
      <span className="text-sm text-white">{message}</span>
      <button onClick={onClose} className="text-slate-500 hover:text-white"><X size={14} /></button>
    </div>
  )
}

/** Confirm dialog for wiping the portfolio, with a choice of starting capital. */
function ResetModal({ current, onClose, onConfirm }) {
  const [amount, setAmount] = useState(String(current ?? 100000))
  const [busy, setBusy] = useState(false)
  const value = parseFloat(amount)
  const valid = value >= 1 && value <= 1e9

  async function confirm() {
    setBusy(true)
    try { await onConfirm(value) } finally { setBusy(false) }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="w-full max-w-sm bg-surface-card border border-surface-border rounded-2xl shadow-2xl p-5">
        <div className="flex items-center gap-2 mb-2">
          <AlertTriangle size={18} className="text-amber-400" />
          <h2 className="text-base font-semibold text-white">Reset portfolio?</h2>
        </div>
        <p className="text-sm text-slate-400 mb-4">
          All positions and the full trade history will be deleted. This can’t be undone.
        </p>
        <label className="text-xs text-slate-500 mb-1.5 block">Starting capital</label>
        <div className="flex items-center bg-surface border border-surface-border rounded-lg focus-within:border-brand/60 mb-2">
          <span className="pl-3 text-slate-500 num">$</span>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            className="flex-1 bg-transparent px-2 py-2.5 num text-white focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none" />
        </div>
        <div className="grid grid-cols-4 gap-1.5 mb-5">
          {[10_000, 50_000, 100_000, 1_000_000].map(v => (
            <button key={v} onClick={() => setAmount(String(v))}
              className={`py-1.5 rounded-md text-xs num transition-colors ${
                value === v ? 'bg-brand text-white' : 'bg-surface-hover text-slate-400 hover:text-white'
              }`}>
              {fmtUSD(v, { compact: true }).replace('.0K', 'K').replace('.00M', 'M')}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm text-slate-300 bg-surface-hover hover:bg-surface-border transition-colors">
            Cancel
          </button>
          <button onClick={confirm} disabled={!valid || busy}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold text-white bg-down hover:bg-down/90 disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
            {busy && <Loader2 size={14} className="animate-spin" />}
            Reset
          </button>
        </div>
      </div>
    </div>
  )
}

/** One line in the insights panel. */
function InsightRow({ icon: Icon, iconClass = 'text-slate-500', label, children }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-t border-surface-border first:border-t-0">
      <span className={`mt-0.5 ${iconClass}`}><Icon size={15} /></span>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] uppercase tracking-wider text-slate-500">{label}</p>
        <div className="text-sm text-slate-200 mt-0.5">{children}</div>
      </div>
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Portfolio() {
  const [summary, setSummary]           = useState(null)
  const [instruments, setInstruments]   = useState([])
  const [transactions, setTransactions] = useState([])
  const [history, setHistory]           = useState(null)
  const [range, setRange]               = useState(null)    // null until we pick a sensible default
  const [error, setError]               = useState(null)
  const [trade, setTrade]               = useState(null)    // { symbol, side } while the modal is open
  const [showReset, setShowReset]       = useState(false)
  const [toast, setToast]               = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()

  // Load summary + trade log + instrument list. `quiet` skips the error banner for background polls.
  const loadAll = useCallback(async (quiet = false) => {
    try {
      const [s, tx, inst] = await Promise.all([fetchPortfolio(), fetchTransactions(), fetchInstruments()])
      setSummary(s)
      setTransactions(tx)
      setInstruments(inst)
      setError(null)
    } catch (e) {
      if (!quiet) setError('Could not load the portfolio. Is the backend running?')
    }
  }, [])

  useEffect(() => {
    loadAll()
    const id = setInterval(() => loadAll(true), POLL_MS)
    return () => clearInterval(id)
  }, [loadAll])

  // Pick the default chart range once: a brand-new portfolio has almost no
  // real history yet, so show a 3M backtest of its holdings instead.
  useEffect(() => {
    if (!summary || range) return
    const ageDays = (Date.now() - new Date(asUTC(summary.created_at)).getTime()) / 86_400_000
    setRange(ageDays < 7 && summary.positions.length ? '90' : 'actual')
  }, [summary, range])

  // (Re)load the equity curve when the range changes or after a trade
  const tradeCount = summary?.trade_count
  useEffect(() => {
    if (!range) return
    let cancelled = false
    const r = RANGES.find(x => x.key === range)
    fetchPortfolioHistory(range === 'actual' ? 'actual' : 'backtest', r?.days ?? 90)
      .then(d => { if (!cancelled) setHistory(d) })
      .catch(() => { if (!cancelled) setHistory([]) })
    return () => { cancelled = true }
  }, [range, tradeCount])

  // Deep link: ?trade=SYMBOL&side=buy opens the modal once instruments are loaded
  useEffect(() => {
    const sym = searchParams.get('trade')
    if (!sym || !instruments.length) return
    setTrade({ symbol: sym, side: searchParams.get('side') ?? 'buy' })
    setSearchParams({}, { replace: true })
  }, [searchParams, instruments, setSearchParams])

  async function handleExecuted(message) {
    setTrade(null)
    setToast(message)
    await loadAll(true)
  }

  async function handleReset(startingCash) {
    await resetPortfolio(startingCash)
    setShowReset(false)
    setRange('actual')
    setToast(`Portfolio reset with ${fmtUSD(startingCash)}`)
    await loadAll(true)
  }

  // Derived numbers for the chart header + insights panel
  const chartStats = useMemo(() => {
    if (!history || history.length < 2) return null
    const first = history[0], last = history[history.length - 1]
    const ret = (last.value / first.value - 1) * 100
    const bench = first.benchmark && last.benchmark ? (last.benchmark / first.benchmark - 1) * 100 : null
    return { ret, bench, alpha: bench != null ? ret - bench : null }
  }, [history])

  const insights = useMemo(() => {
    if (!summary?.positions.length) return null
    const byPct = [...summary.positions].sort((a, b) => b.unrealized_pct - a.unrealized_pct)
    const largest = [...summary.positions].sort((a, b) => b.weight - a.weight)[0]
    return { best: byPct[0], worst: byPct[byPct.length - 1], largest }
  }, [summary])

  // ── Render ──

  if (error && !summary) {
    return (
      <div className="card text-center py-16 max-w-xl mx-auto">
        <AlertTriangle size={36} className="text-down mx-auto mb-3" />
        <p className="text-white font-medium">{error}</p>
        <button onClick={() => loadAll()} className="mt-4 text-sm text-brand hover:underline">Try again</button>
      </div>
    )
  }

  if (!summary) {
    return (
      <div className="max-w-[1600px] mx-auto space-y-5">
        <div className="h-16 w-72 bg-surface-card rounded-xl animate-pulse" />
        <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <div key={i} className="h-28 bg-surface-card rounded-xl border border-surface-border animate-pulse" />)}
        </div>
        <div className="h-80 bg-surface-card rounded-xl border border-surface-border animate-pulse" />
      </div>
    )
  }

  const s = summary
  const hasPositions = s.positions.length > 0
  const cashPct = s.total_value ? (s.cash / s.total_value) * 100 : 100
  const daysActive = Math.max(1, Math.ceil((Date.now() - new Date(asUTC(s.created_at)).getTime()) / 86_400_000))
  const isBacktest = range && range !== 'actual'
  const openTrade = (symbol = null, side = 'buy') => setTrade({ symbol, side })

  return (
    <div className="max-w-[1600px] mx-auto">

      {/* ── 1. Header ── */}
      <div className="flex items-end justify-between gap-4 mb-6 flex-wrap">
        <div>
          <div className="flex items-center gap-1.5 mb-1">
            <Briefcase size={12} className="text-brand" />
            <span className="text-[11px] text-brand font-medium uppercase tracking-wider">Paper Trading</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Portfolio</h1>
          <p className="text-sm text-slate-400 mt-1">
            Trade any tracked instrument at live prices with virtual money — no risk, real market moves.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setShowReset(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm text-slate-400 hover:text-white rounded-lg border border-surface-border hover:border-slate-500 transition-colors">
            <RotateCcw size={14} /> Reset
          </button>
          <button onClick={() => openTrade()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand hover:bg-brand-light rounded-lg transition-colors shadow-lg shadow-brand/20">
            <Plus size={15} /> New Trade
          </button>
        </div>
      </div>

      {/* ── 2. KPI row ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-5">
        <KpiCard label="Total Value" icon={Briefcase} accent={PORTFOLIO_COLOR}>
          <p className="text-2xl font-bold num text-white">{fmtUSD(s.total_value)}</p>
          <p className={`text-sm num mt-1 ${pnlClass(s.total_pnl)}`}>
            {s.total_pnl >= 0 ? <TrendingUp size={13} className="inline mr-1" /> : <TrendingDown size={13} className="inline mr-1" />}
            {fmtUSD(s.total_pnl, { sign: true })} <span className="opacity-80">({fmtPct(s.total_pnl_pct)})</span>
          </p>
          <p className="text-[11px] text-slate-600 mt-1">from {fmtUSD(s.starting_cash)} starting capital</p>
        </KpiCard>

        <KpiCard label="Today" icon={Activity} accent={s.day_pnl >= 0 ? '#10b981' : '#ef4444'}>
          <p className={`text-2xl font-bold num ${pnlClass(s.day_pnl)}`}>{fmtUSD(s.day_pnl, { sign: true })}</p>
          <p className={`text-sm num mt-1 ${pnlClass(s.day_pnl_pct)}`}>{fmtPct(s.day_pnl_pct)}</p>
          <p className="text-[11px] text-slate-600 mt-1">move since previous close</p>
        </KpiCard>

        <KpiCard label="Profit & Loss" icon={Target}>
          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-500">Unrealized</span>
              <span className={`text-lg font-semibold num ${pnlClass(s.unrealized_pnl)}`}>{fmtUSD(s.unrealized_pnl, { sign: true })}</span>
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xs text-slate-500">Realized</span>
              <span className={`text-lg font-semibold num ${pnlClass(s.realized_pnl)}`}>{fmtUSD(s.realized_pnl, { sign: true })}</span>
            </div>
          </div>
        </KpiCard>

        <KpiCard label="Buying Power" icon={Wallet}>
          <p className="text-2xl font-bold num text-white">{fmtUSD(s.cash)}</p>
          {/* Cash vs invested split bar */}
          <div className="flex h-1.5 rounded-full overflow-hidden bg-surface mt-3 gap-0.5">
            <div className="bg-brand rounded-full" style={{ width: `${100 - cashPct}%` }} />
            <div className="bg-slate-500 rounded-full" style={{ width: `${cashPct}%` }} />
          </div>
          <div className="flex justify-between text-[11px] mt-1.5">
            <span className="text-slate-400"><span className="text-brand">■</span> Invested {fmtUSD(s.invested_value, { compact: true })}</span>
            <span className="text-slate-400"><span className="text-slate-500">■</span> Cash {cashPct.toFixed(0)}%</span>
          </div>
        </KpiCard>
      </div>

      {/* ── 3. Equity curve + allocation ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5 mb-5">
        <div className="card xl:col-span-2">
          <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
            <div>
              <h3 className="text-sm font-medium text-slate-300">
                {isBacktest ? 'Current Holdings — Backtest' : 'Portfolio Value'}
              </h3>
              {/* Legend: two series, so name both — identity never by colour alone */}
              <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <span className="w-3 h-0.5 rounded" style={{ background: PORTFOLIO_COLOR }} /> Portfolio
                  {chartStats && <span className={`num ${pnlClass(chartStats.ret)}`}>{fmtPct(chartStats.ret)}</span>}
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="w-3 border-t border-dashed" style={{ borderColor: BENCHMARK_COLOR }} /> S&P 500
                  {chartStats?.bench != null && <span className={`num ${pnlClass(chartStats.bench)}`}>{fmtPct(chartStats.bench)}</span>}
                </span>
                {chartStats?.alpha != null && (
                  <span className={`px-1.5 py-0.5 rounded num ${chartStats.alpha >= 0 ? 'bg-up/10 text-up' : 'bg-down/10 text-down'}`}
                    title="Your return minus the S&P 500's return over the same window">
                    {chartStats.alpha >= 0 ? 'Beating' : 'Trailing'} by {Math.abs(chartStats.alpha).toFixed(2)} pts
                  </span>
                )}
              </div>
            </div>
            <div className="flex gap-1 bg-surface-border/40 rounded-lg p-0.5">
              {RANGES.map(r => (
                <button key={r.key} onClick={() => setRange(r.key)}
                  disabled={r.key !== 'actual' && !hasPositions}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-all disabled:opacity-30 ${
                    range === r.key ? 'bg-brand text-white' : 'text-slate-400 hover:text-white'
                  }`}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          {history === null
            ? <div className="h-[280px] bg-surface rounded-lg animate-pulse" />
            : history.length < 2
              ? (
                <div className="h-[280px] flex flex-col items-center justify-center text-center text-slate-500 text-sm gap-2">
                  <CalendarDays size={28} className="text-slate-700" />
                  <p>Your equity curve builds up day by day as markets move.</p>
                  {hasPositions && (
                    <button onClick={() => setRange('90')} className="text-brand hover:underline text-xs">
                      See how your current holdings performed over the last 3 months →
                    </button>
                  )}
                </div>
              )
              : <EquityChart data={history} startingCash={isBacktest ? null : s.starting_cash} height={280} />
          }

          {isBacktest && (
            <p className="text-[11px] text-slate-600 mt-2 flex items-center gap-1.5">
              <Info size={11} /> Hypothetical: today’s positions held unchanged over the selected window. Past performance isn’t a prediction.
            </p>
          )}
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-slate-300 mb-4">Allocation</h3>
          <AllocationDonut positions={s.positions} cash={s.cash} />

          {/* Top positions by weight — bar length is the share of the whole portfolio */}
          {hasPositions && (
            <div className="mt-5 pt-4 border-t border-surface-border">
              <p className="text-[11px] uppercase tracking-wider text-slate-500 mb-3">Top Positions</p>
              <div className="space-y-2.5">
                {s.positions.slice(0, 5).map(p => (
                  <button key={p.symbol} onClick={() => openTrade(p.symbol, 'buy')} className="w-full text-left group">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-slate-300 group-hover:text-white transition-colors truncate">{p.name}</span>
                      <span className="flex items-center gap-2 num flex-shrink-0">
                        <span className={pnlClass(p.unrealized_pct)}>{fmtPct(p.unrealized_pct)}</span>
                        <span className="text-slate-400 w-12 text-right">{p.weight.toFixed(1)}%</span>
                      </span>
                    </div>
                    <div className="h-1.5 bg-surface rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${p.weight}%`, background: CATEGORY_COLORS[p.category] }} />
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── 4. Holdings ── */}
      <div className="card mb-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-slate-300">
            Holdings <span className="text-slate-600 num text-xs ml-1">{s.positions.length}</span>
          </h3>
          {hasPositions && (
            <span className="text-xs text-slate-500">
              Cost basis <span className="num text-slate-300">{fmtUSD(s.cost_basis)}</span>
            </span>
          )}
        </div>

        {hasPositions
          ? <HoldingsTable positions={s.positions} onTrade={openTrade} />
          : (
            // Empty state with one-click starter ideas
            <div className="text-center py-10">
              <div className="w-14 h-14 rounded-2xl bg-brand/10 flex items-center justify-center mx-auto mb-4">
                <Briefcase size={26} className="text-brand" />
              </div>
              <h4 className="text-white font-semibold mb-1">You have {fmtUSD(s.cash)} to invest</h4>
              <p className="text-sm text-slate-400 mb-5 max-w-md mx-auto">
                Build a portfolio from stocks, crypto, commodities, forex and indices. Prices are live,
                so your positions will move with the real market.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mb-5">
                {STARTER_IDEAS.map(sym => {
                  const inst = instruments.find(i => i.symbol === sym)
                  if (!inst) return null
                  return (
                    <button key={sym} onClick={() => openTrade(sym, 'buy')}
                      className="px-3 py-1.5 rounded-lg bg-surface hover:bg-surface-hover border border-surface-border hover:border-brand/40 text-xs transition-colors">
                      <span className="text-white">{inst.name}</span>
                      <span className={`num ml-2 ${pnlClass(inst.change_percent)}`}>{fmtPct(inst.change_percent)}</span>
                    </button>
                  )
                })}
              </div>
              <button onClick={() => openTrade()}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-brand hover:bg-brand-light rounded-lg transition-colors">
                <Plus size={15} /> Make your first trade
              </button>
            </div>
          )
        }
      </div>

      {/* ── 5. Transactions + insights ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="card xl:col-span-2">
          <TransactionsList transactions={transactions} />
        </div>

        <div className="card">
          <h3 className="text-sm font-medium text-slate-300 mb-1">Insights</h3>
          <InsightRow icon={CalendarDays} label="Track record">
            <span className="num">{s.trade_count}</span> trade{s.trade_count === 1 ? '' : 's'} over{' '}
            <span className="num">{daysActive}</span> day{daysActive === 1 ? '' : 's'}
            {s.win_rate != null && (
              <span className="text-slate-400"> · win rate <span className={`num ${s.win_rate >= 50 ? 'text-up' : 'text-down'}`}>{s.win_rate.toFixed(0)}%</span></span>
            )}
          </InsightRow>

          {insights ? (
            <>
              <InsightRow icon={Trophy} iconClass="text-amber-400" label="Best performer">
                {insights.best.name} <span className={`num ${pnlClass(insights.best.unrealized_pct)}`}>{fmtPct(insights.best.unrealized_pct)}</span>
              </InsightRow>
              {insights.worst.symbol !== insights.best.symbol && (
                <InsightRow icon={TrendingDown} iconClass="text-down" label="Worst performer">
                  {insights.worst.name} <span className={`num ${pnlClass(insights.worst.unrealized_pct)}`}>{fmtPct(insights.worst.unrealized_pct)}</span>
                </InsightRow>
              )}
              {/* Simple concentration check — a first step toward risk management */}
              <InsightRow
                icon={insights.largest.weight > CONCENTRATION_LIMIT ? AlertTriangle : CheckCircle2}
                iconClass={insights.largest.weight > CONCENTRATION_LIMIT ? 'text-amber-400' : 'text-up'}
                label="Concentration"
              >
                {insights.largest.weight > CONCENTRATION_LIMIT
                  ? <>{insights.largest.name} is <span className="num text-amber-400">{insights.largest.weight.toFixed(1)}%</span> of your portfolio — consider diversifying (above {CONCENTRATION_LIMIT}%).</>
                  : <>Largest position is {insights.largest.name} at <span className="num">{insights.largest.weight.toFixed(1)}%</span> — well diversified.</>
                }
              </InsightRow>
            </>
          ) : (
            <p className="text-xs text-slate-600 italic pt-2">Insights appear once you hold positions.</p>
          )}

          {cashPct > 50 && hasPositions && (
            <InsightRow icon={Wallet} iconClass="text-sky-400" label="Idle cash">
              <span className="num">{cashPct.toFixed(0)}%</span> of your portfolio is uninvested.
            </InsightRow>
          )}
        </div>
      </div>

      {/* ── Modals & toast ── */}
      {trade && (
        <TradeModal
          instruments={instruments}
          positions={s.positions}
          cash={s.cash}
          totalValue={s.total_value}
          initialSymbol={trade.symbol}
          initialSide={trade.side}
          onClose={() => setTrade(null)}
          onExecuted={handleExecuted}
        />
      )}
      {showReset && <ResetModal current={s.starting_cash} onClose={() => setShowReset(false)} onConfirm={handleReset} />}
      {toast && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  )
}
