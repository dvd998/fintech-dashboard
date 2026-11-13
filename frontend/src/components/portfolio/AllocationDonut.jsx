/**
 * AllocationDonut — how the portfolio is split across asset classes + cash.
 *
 * The donut's slices are directly labelled in the legend list beside it (name,
 * % and $), so identity never relies on colour alone. Slices are separated by
 * a 2px gap in the card colour.
 *
 * Props:
 *   positions        — open Invest positions (each with category + market_value)
 *   marginPositions  — open margin positions; counted at their equity (margin ± P&L),
 *                      since that's the money actually tied up in them
 *   cash             — uninvested USD
 */
import { useMemo, useState } from 'react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { CATEGORY_COLORS } from '../../utils/assetDetail'
import { CATEGORY_ORDER, CATEGORY_LABELS, CASH_COLOR } from '../../utils/portfolio'
import { fmtUSD } from '../../utils/format'

function SliceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const s = payload[0].payload
  return (
    <div className="bg-surface-card border border-surface-border rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-white font-medium mb-0.5">{s.label}</p>
      <p className="num text-slate-300">{fmtUSD(s.value)} · {s.pct.toFixed(1)}%</p>
      {s.count > 0 && <p className="text-slate-500">{s.count} position{s.count > 1 ? 's' : ''}</p>}
    </div>
  )
}

export default function AllocationDonut({ positions, marginPositions = [], cash }) {
  const [hovered, setHovered] = useState(null)

  const slices = useMemo(() => {
    const holdings = [
      ...positions.map(p => ({ category: p.category, value: p.market_value })),
      ...marginPositions.map(m => ({ category: m.category, value: m.equity })),
    ]
    const total = cash + holdings.reduce((s, h) => s + h.value, 0)
    const byCat = CATEGORY_ORDER.map(cat => {
      const inCat = holdings.filter(h => h.category === cat)
      return {
        key: cat, label: CATEGORY_LABELS[cat], color: CATEGORY_COLORS[cat],
        value: inCat.reduce((s, h) => s + h.value, 0), count: inCat.length,
      }
    }).filter(s => s.value > 0)
    const all = [...byCat, { key: 'cash', label: 'Cash', color: CASH_COLOR, value: cash, count: 0 }]
      .filter(s => s.value > 0.005)
    return all.map(s => ({ ...s, pct: total ? (s.value / total) * 100 : 0 }))
  }, [positions, marginPositions, cash])

  const investedPct = slices.filter(s => s.key !== 'cash').reduce((a, s) => a + s.pct, 0)
  const focus = slices.find(s => s.key === hovered)

  return (
    <div className="flex items-center gap-5">
      {/* Donut with a centre readout (invested %, or the hovered slice) */}
      <div className="relative w-40 h-40 flex-shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius="68%"
              outerRadius="100%"
              startAngle={90}
              endAngle={-270}
              paddingAngle={slices.length > 1 ? 1.5 : 0}
              stroke="#1a1d27"
              strokeWidth={2}
              onMouseEnter={(_, i) => setHovered(slices[i]?.key)}
              onMouseLeave={() => setHovered(null)}
              isAnimationActive={false}
            >
              {slices.map(s => (
                <Cell key={s.key} fill={s.color} opacity={hovered && hovered !== s.key ? 0.35 : 1} />
              ))}
            </Pie>
            <Tooltip content={<SliceTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <span className="text-xl font-semibold num text-white">
            {(focus ? focus.pct : investedPct).toFixed(0)}%
          </span>
          <span className="text-[10px] uppercase tracking-wider text-slate-500">
            {focus ? focus.label : 'Invested'}
          </span>
        </div>
      </div>

      {/* Legend with direct values — doubles as hover target */}
      <ul className="flex-1 space-y-1.5 min-w-0">
        {slices.map(s => (
          <li
            key={s.key}
            onMouseEnter={() => setHovered(s.key)}
            onMouseLeave={() => setHovered(null)}
            className={`flex items-center justify-between gap-2 text-xs px-2 py-1 rounded-md transition-colors cursor-default ${
              hovered === s.key ? 'bg-surface-hover' : ''
            }`}
          >
            <span className="flex items-center gap-2 text-slate-300 min-w-0">
              <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: s.color }} />
              <span className="truncate">{s.label}</span>
            </span>
            <span className="num text-slate-400 flex-shrink-0">
              <span className="text-white">{s.pct.toFixed(1)}%</span>
              <span className="ml-2 hidden 2xl:inline">{fmtUSD(s.value, { compact: true })}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
