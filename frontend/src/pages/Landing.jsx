/**
 * Landing — the first screen shown when the app starts (route "/").
 * Rendered full-screen, outside the Sidebar/Header layout.
 *
 * Sections:
 *   1. Live ticker tape — a scrolling strip of index + crypto prices
 *   2. Hero            — brand, tagline and the "Enter Dashboard" button
 *   3. Feature grid    — short overview of what the app offers
 */
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowRight,
  LineChart,
  Star,
  Newspaper,
  Globe2,
} from 'lucide-react'
import { fetchIndices, fetchCrypto } from '../services/api'

// Feature cards shown under the hero
const FEATURES = [
  {
    icon: Globe2,
    title: 'Every market, one place',
    text:  'Stocks, crypto, commodities, forex and indices — refreshed automatically.',
  },
  {
    icon: LineChart,
    title: 'Price history',
    text:  'Open any asset to see its chart and daily move at a glance.',
  },
  {
    icon: Star,
    title: 'Personal watchlist',
    text:  'Star the assets you care about and follow their news.',
  },
  {
    icon: Newspaper,
    title: 'AI News Analyzer',
    text:  'Claude scores market news sentiment and tracks how prices reacted.',
  },
]

// One item in the scrolling ticker tape
function TickerItem({ asset }) {
  const isUp = asset.change_percent >= 0
  return (
    <span className="flex items-center gap-2 px-6 whitespace-nowrap">
      <span className="text-xs font-medium text-slate-400">{asset.name ?? asset.symbol}</span>
      <span className="text-xs num text-white">
        {asset.price?.toLocaleString('en-US', { maximumFractionDigits: 2 })}
      </span>
      <span className={`text-xs num ${isUp ? 'text-up' : 'text-down'}`}>
        {isUp ? '▲' : '▼'} {Math.abs(asset.change_percent ?? 0).toFixed(2)}%
      </span>
    </span>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const [tickers, setTickers] = useState([])

  // Load a handful of prices for the ticker tape.
  // Failures are ignored on purpose — the landing page works fine without it.
  useEffect(() => {
    Promise.allSettled([fetchIndices(), fetchCrypto()]).then(([idx, cry]) => {
      const indices = idx.status === 'fulfilled' ? idx.value : []
      const crypto  = cry.status === 'fulfilled' ? cry.value.slice(0, 5) : []
      setTickers([...indices, ...crypto].filter(a => a.price != null))
    })
  }, [])

  return (
    <div className="relative min-h-screen flex flex-col overflow-hidden bg-surface">

      {/* Soft brand glow + faint grid in the background (purely decorative) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            'radial-gradient(ellipse 60% 45% at 50% 30%, rgba(99,102,241,0.18), transparent 70%),' +
            'linear-gradient(rgba(42,45,61,0.35) 1px, transparent 1px),' +
            'linear-gradient(90deg, rgba(42,45,61,0.35) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 48px 48px, 48px 48px',
          maskImage: 'radial-gradient(ellipse 80% 70% at 50% 35%, black 40%, transparent 100%)',
        }}
      />

      {/* ── 1. Ticker tape ── only rendered once prices have loaded */}
      {tickers.length > 0 && (
        <div className="relative z-10 border-b border-surface-border bg-surface-card/60 backdrop-blur-sm py-2 overflow-hidden">
          {/* The list is rendered twice so the -50% scroll loops seamlessly */}
          <div className="flex w-max animate-ticker hover:[animation-play-state:paused]">
            {[...tickers, ...tickers].map((a, i) => (
              <TickerItem key={`${a.symbol}-${i}`} asset={a} />
            ))}
          </div>
        </div>
      )}

      {/* ── 2. Hero ── */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <p className="text-xs uppercase tracking-[0.25em] text-brand-light font-semibold mb-5">
          Market Intelligence
        </p>

        <h1 className="text-5xl sm:text-6xl font-bold tracking-tight">
          <span className="text-brand">Fin</span>
          <span className="text-white">Dash</span>
        </h1>

        <p className="mt-5 max-w-xl text-base sm:text-lg text-slate-400 leading-relaxed">
          Live prices across global markets, a personal watchlist, and AI-scored
          news — all in one dashboard.
        </p>

        <button
          onClick={() => navigate('/dashboard')}
          className="group mt-10 inline-flex items-center gap-2 rounded-xl bg-brand px-7 py-3.5 text-sm font-semibold text-white shadow-lg shadow-brand/25 transition-all hover:bg-brand-light hover:shadow-brand/40 active:scale-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-light focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
        >
          Enter Dashboard
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
        </button>

        {/* ── 3. Feature grid ── */}
        <div className="mt-20 grid w-full max-w-5xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 text-left">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div key={title} className="card hover:border-brand/40 transition-colors">
              <div className="mb-3 inline-flex h-9 w-9 items-center justify-center rounded-lg bg-brand/10 text-brand">
                <Icon size={18} />
              </div>
              <h3 className="text-sm font-semibold text-white">{title}</h3>
              <p className="mt-1.5 text-xs text-slate-400 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </main>

      {/* Footer — same credits as the sidebar */}
      <footer className="relative z-10 py-5 text-center text-xs text-slate-600">
        Data via yfinance · CoinGecko · AI via Claude Haiku
      </footer>
    </div>
  )
}
