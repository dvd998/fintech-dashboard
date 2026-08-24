/**
 * WatchlistToggle — star button that adds/removes an asset from the watchlist.
 * Dropped into PriceTable rows and PriceCard so any asset, in any category,
 * can be starred from wherever it's already shown.
 */
import { Star } from 'lucide-react'
import { useWatchlist } from '../../context/WatchlistContext'

export default function WatchlistToggle({ asset, size = 16, className = '' }) {
  const { symbols, toggle } = useWatchlist()
  const watched = symbols.has(asset.symbol)

  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggle(asset) }}
      title={watched ? 'Remove from watchlist' : 'Add to watchlist'}
      className={[
        'transition-colors',
        watched ? 'text-amber-400 hover:text-amber-300' : 'text-slate-600 hover:text-amber-400',
        className,
      ].join(' ')}
    >
      <Star size={size} fill={watched ? 'currentColor' : 'none'} />
    </button>
  )
}
