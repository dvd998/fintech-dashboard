/**
 * EquityChart — portfolio value over time vs. the S&P 500.
 *
 * Both series are in USD on ONE axis: the benchmark is rebased by the backend
 * so it starts at the portfolio's first value ("what if I'd put the same money
 * into the S&P 500 instead?"). A dashed reference line marks starting capital.
 *
 * Props:
 *   data          — [{ date: 'YYYY-MM-DD', value, benchmark }]
 *   startingCash  — draws the break-even reference line
 *   height        — chart height in px
 */
import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { fmtUSD, fmtPct } from '../../utils/format'

const PORTFOLIO_COLOR = '#6366f1'   // brand indigo
const BENCHMARK_COLOR = '#94a3b8'   // slate-400 — recessive, it's context not the subject

function shortDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

// Hover tooltip: date, both values, and how far ahead/behind the benchmark you are
function EquityTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  const diff = row.benchmark ? ((row.value / row.benchmark) - 1) * 100 : null
  return (
    <div className="bg-surface-card border border-surface-border rounded-lg px-3 py-2 text-xs shadow-xl min-w-[180px]">
      <p className="text-slate-400 mb-1.5">
        {new Date(label + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
      </p>
      <div className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-1.5 text-slate-300">
          <span className="w-2.5 h-0.5 rounded" style={{ background: PORTFOLIO_COLOR }} /> Portfolio
        </span>
        <span className="num font-semibold text-white">{fmtUSD(row.value)}</span>
      </div>
      {row.benchmark != null && (
        <div className="flex items-center justify-between gap-4 mt-0.5">
          <span className="flex items-center gap-1.5 text-slate-300">
            <span className="w-2.5 h-0 border-t border-dashed" style={{ borderColor: BENCHMARK_COLOR }} /> S&P 500
          </span>
          <span className="num text-slate-300">{fmtUSD(row.benchmark)}</span>
        </div>
      )}
      {diff != null && (
        <p className="mt-1.5 pt-1.5 border-t border-surface-border text-slate-400">
          vs. benchmark <span className={`num ${diff >= 0 ? 'text-up' : 'text-down'}`}>{fmtPct(diff)}</span>
        </p>
      )}
    </div>
  )
}

export default function EquityChart({ data = [], startingCash, height = 280 }) {
  const values = data.flatMap(d => [d.value, d.benchmark]).filter(v => v != null)
  if (startingCash) values.push(startingCash)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const pad = Math.max((max - min) * 0.08, max * 0.002)   // never a zero-height domain

  function formatY(v) {
    if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(2)}M`
    if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(1)}K`
    return `$${v.toFixed(0)}`
  }

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
        <defs>
          <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={PORTFOLIO_COLOR} stopOpacity={0.28} />
            <stop offset="95%" stopColor={PORTFOLIO_COLOR} stopOpacity={0} />
          </linearGradient>
        </defs>

        <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3d" vertical={false} />
        <XAxis
          dataKey="date"
          tickFormatter={shortDate}
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          minTickGap={40}
        />
        <YAxis
          domain={[min - pad, max + pad]}
          tickFormatter={formatY}
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={64}
        />
        <Tooltip content={<EquityTooltip />} cursor={{ stroke: '#475569', strokeDasharray: '3 3' }} />

        {/* Break-even line at starting capital */}
        {startingCash && (
          <ReferenceLine y={startingCash} stroke="#475569" strokeDasharray="4 4"
            label={{ value: 'Start', position: 'insideTopLeft', fill: '#64748b', fontSize: 10 }} />
        )}

        <Line
          type="monotone" dataKey="benchmark" stroke={BENCHMARK_COLOR} strokeWidth={1.5}
          strokeDasharray="5 4" dot={false} activeDot={{ r: 4, fill: BENCHMARK_COLOR, stroke: '#1a1d27', strokeWidth: 2 }}
          connectNulls isAnimationActive={false}
        />
        <Area
          type="monotone" dataKey="value" stroke={PORTFOLIO_COLOR} strokeWidth={2}
          fill="url(#equity-fill)" dot={false} isAnimationActive={false}
          activeDot={{ r: 5, fill: PORTFOLIO_COLOR, stroke: '#1a1d27', strokeWidth: 2 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  )
}

export { PORTFOLIO_COLOR, BENCHMARK_COLOR }
