/**
 * PriceCard — compact card showing one asset's current price and daily change.
 * Used on the Dashboard overview and as a highlight at the top of detail pages.
 */
import { TrendingUp, TrendingDown } from 'lucide-react'

/**
 * Format a number as a price string.
 * - High-value assets (stocks, commodities): 2 decimal places
 * - Forex / low-value crypto: 4–6 decimal places
 */
function formatPrice(value, symbol = '') {
  if (value == null) return '—'
  const isForex = symbol.includes('=X')
  const isCheap = value < 1
  const decimals = isForex || isCheap ? 4 : 2
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })
}

function formatChange(value) {
  if (value == null) return '—'
  const sign = value >= 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}%`
}

export default function PriceCard({ asset, onClick }) {
  const isUp = asset.change_percent >= 0

  return (
    <div
      onClick={onClick}
      className={[
        'card cursor-pointer transition-all duration-150',
        'hover:border-brand/40 hover:shadow-lg hover:shadow-brand/5',
        onClick ? 'active:scale-[0.98]' : '',
      ].join(' ')}
    >
      {/* Top row: symbol + change badge */}
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-xs text-slate-500 font-medium uppercase tracking-wider">
            {asset.symbol}
          </p>
          <p className="text-sm text-slate-300 mt-0.5 truncate max-w-[130px]">
            {asset.name}
          </p>
        </div>

        {/* Up / down indicator */}
        <span className={isUp ? 'badge-up' : 'badge-down'}>
          {isUp
            ? <TrendingUp size={10} className="inline mr-1" />
            : <TrendingDown size={10} className="inline mr-1" />
          }
          {formatChange(asset.change_percent)}
        </span>
      </div>

      {/* Price */}
      <p className="text-2xl font-semibold num text-white">
        {formatPrice(asset.price, asset.symbol)}
      </p>

      {/* Absolute change */}
      <p className={`text-xs num mt-1 ${isUp ? 'text-up' : 'text-down'}`}>
        {asset.change != null
          ? `${asset.change >= 0 ? '+' : ''}${formatPrice(asset.change, asset.symbol)}`
          : '—'
        }
      </p>
    </div>
  )
}
