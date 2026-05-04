/**
 * Dashboard — overview page showing top movers across all categories.
 * Fetches data from all endpoints and displays the most interesting cards.
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { fetchStocks, fetchCrypto, fetchCommodities, fetchForex, fetchIndices } from '../services/api'
import PriceCard from '../components/common/PriceCard'
import PriceTable from '../components/common/PriceTable'

// Loading skeleton — shown while data is being fetched
function SkeletonCard() {
  return (
    <div className="card animate-pulse">
      <div className="h-3 bg-surface-border rounded w-16 mb-3" />
      <div className="h-7 bg-surface-border rounded w-28 mb-2" />
      <div className="h-3 bg-surface-border rounded w-12" />
    </div>
  )
}

// A labeled section with a "View all" link
function Section({ title, to, children }) {
  const navigate = useNavigate()
  return (
    <div className="mb-8">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">{title}</h2>
        <button
          onClick={() => navigate(to)}
          className="text-xs text-brand hover:text-brand-light transition-colors"
        >
          View all →
        </button>
      </div>
      {children}
    </div>
  )
}

export default function Dashboard({ onDataLoaded }) {
  const navigate = useNavigate()

  // One state object per data source
  const [stocks,      setStocks]      = useState([])
  const [crypto,      setCrypto]      = useState([])
  const [commodities, setCommodities] = useState([])
  const [indices,     setIndices]     = useState([])
  const [loading,     setLoading]     = useState(true)

  async function loadAll() {
    setLoading(true)
    try {
      // Fetch all categories at the same time (parallel)
      const [s, c, com, idx] = await Promise.all([
        fetchStocks(),
        fetchCrypto(),
        fetchCommodities(),
        fetchIndices(),
      ])
      setStocks(s)
      setCrypto(c)
      setCommodities(com)
      setIndices(idx)
      onDataLoaded?.(new Date())
    } catch (err) {
      console.error('Dashboard fetch failed:', err)
    } finally {
      setLoading(false)
    }
  }

  // Load on mount
  useEffect(() => { loadAll() }, [])

  // Sort by absolute % change and take top N
  function topMovers(list, n = 6) {
    return [...list]
      .filter(a => a.change_percent != null)
      .sort((a, b) => Math.abs(b.change_percent) - Math.abs(a.change_percent))
      .slice(0, n)
  }

  return (
    <div>
      {/* ── Indices strip ─────────────────────────────────────────────────── */}
      <Section title="Global Indices" to="/indices">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
          {loading
            ? Array(7).fill(0).map((_, i) => <SkeletonCard key={i} />)
            : indices.map(a => (
                <PriceCard
                  key={a.symbol}
                  asset={a}
                  onClick={() => navigate(`/indices`)}
                />
              ))
          }
        </div>
      </Section>

      {/* ── Top stock movers ──────────────────────────────────────────────── */}
      <Section title="Top Stock Movers" to="/stocks">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {loading
            ? Array(6).fill(0).map((_, i) => <SkeletonCard key={i} />)
            : topMovers(stocks).map(a => (
                <PriceCard
                  key={a.symbol}
                  asset={a}
                  onClick={() => navigate(`/stocks`)}
                />
              ))
          }
        </div>
      </Section>

      {/* ── Crypto ────────────────────────────────────────────────────────── */}
      <Section title="Crypto" to="/crypto">
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3">
          {loading
            ? Array(8).fill(0).map((_, i) => <SkeletonCard key={i} />)
            : crypto.map(a => (
                <PriceCard
                  key={a.symbol}
                  asset={a}
                  onClick={() => navigate(`/crypto`)}
                />
              ))
          }
        </div>
      </Section>

      {/* ── Commodities table ─────────────────────────────────────────────── */}
      <Section title="Commodities" to="/commodities">
        {loading
          ? <div className="h-40 bg-surface-card rounded-xl animate-pulse" />
          : <PriceTable assets={commodities} />
        }
      </Section>
    </div>
  )
}
