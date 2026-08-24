/**
 * WatchlistContext — global watchlist state shared across the whole app.
 * Loaded once on startup; star toggles in tables/cards anywhere in the app
 * and the Watchlist page itself all read and write through this so they
 * stay in sync without each needing their own fetch.
 */
import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { fetchWatchlist, addToWatchlist, removeFromWatchlist } from '../services/api'

const WatchlistContext = createContext(null)

export function WatchlistProvider({ children }) {
  const [items,   setItems]   = useState([])
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await fetchWatchlist())
    } catch (e) {
      console.error('Failed to load watchlist:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const symbols = new Set(items.map(i => i.symbol))

  // Add or remove an asset. Updates local state immediately (optimistic) so
  // stars flip instantly, then syncs with the backend in the background.
  async function toggle(asset) {
    const isWatched = symbols.has(asset.symbol)

    if (isWatched) {
      setItems(prev => prev.filter(i => i.symbol !== asset.symbol))
    } else {
      setItems(prev => [{ ...asset, added_at: new Date().toISOString() }, ...prev])
    }

    try {
      if (isWatched) await removeFromWatchlist(asset.symbol)
      else           await addToWatchlist(asset.symbol)
    } catch (e) {
      console.error('Watchlist toggle failed:', e)
      refresh()   // resync with the server if the optimistic update was wrong
    }
  }

  return (
    <WatchlistContext.Provider value={{ items, symbols, loading, toggle, refresh }}>
      {children}
    </WatchlistContext.Provider>
  )
}

export function useWatchlist() {
  const ctx = useContext(WatchlistContext)
  if (!ctx) throw new Error('useWatchlist must be used within a WatchlistProvider')
  return ctx
}
