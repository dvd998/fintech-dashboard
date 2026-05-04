/**
 * PriceAreaChart — draws a filled area line chart for price history.
 * Uses Recharts: https://recharts.org/en-US/api
 *
 * Props:
 *   data   — array of { date, close } objects (from the /history endpoint)
 *   color  — line + fill color (defaults to brand purple)
 *   height — chart height in px
 */
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

// Custom tooltip shown when hovering over the chart
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-card border border-surface-border rounded-lg px-3 py-2 text-sm shadow-xl">
      <p className="text-slate-400 text-xs mb-1">{label}</p>
      <p className="num font-semibold text-white">
        {payload[0].value?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
      </p>
    </div>
  )
}

export default function PriceAreaChart({ data = [], color = '#6366f1', height = 260 }) {
  // Format raw history rows into what Recharts expects
  const chartData = data.map(row => ({
    // Show only the month+day for X axis labels
    date:  new Date(row.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    close: row.close,
  }))

  // Determine Y axis domain with a little padding so the line doesn't hug the edges
  const values  = chartData.map(d => d.close).filter(Boolean)
  const minVal  = Math.min(...values)
  const maxVal  = Math.max(...values)
  const padding = (maxVal - minVal) * 0.05
  const domain  = [minVal - padding, maxVal + padding]

  // Y axis: compact labels (e.g. "150K" instead of "150,000")
  function formatY(val) {
    if (val >= 1e6) return `${(val / 1e6).toFixed(1)}M`
    if (val >= 1e3) return `${(val / 1e3).toFixed(1)}K`
    return val.toFixed(2)
  }

  return (
    // ResponsiveContainer fills the parent's width automatically
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
        {/* Gradient fill definition */}
        <defs>
          <linearGradient id={`gradient-${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%"  stopColor={color} stopOpacity={0.25} />
            <stop offset="95%" stopColor={color} stopOpacity={0}    />
          </linearGradient>
        </defs>

        {/* Subtle grid lines */}
        <CartesianGrid strokeDasharray="3 3" stroke="#2a2d3d" vertical={false} />

        {/* X axis — show every ~30th label to avoid crowding */}
        <XAxis
          dataKey="date"
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          interval="preserveStartEnd"
        />

        {/* Y axis */}
        <YAxis
          domain={domain}
          tickFormatter={formatY}
          tick={{ fill: '#64748b', fontSize: 11 }}
          tickLine={false}
          axisLine={false}
          width={55}
        />

        <Tooltip content={<CustomTooltip />} />

        {/* The actual area + line */}
        <Area
          type="monotone"
          dataKey="close"
          stroke={color}
          strokeWidth={2}
          fill={`url(#gradient-${color})`}
          dot={false}          // no dots on every data point — too noisy
          activeDot={{ r: 4, fill: color, strokeWidth: 0 }}
        />
      </AreaChart>
    </ResponsiveContainer>
  )
}
