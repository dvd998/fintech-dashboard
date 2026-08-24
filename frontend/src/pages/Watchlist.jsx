/**
 * Watchlist — personal shortlist of starred assets.
 *
 * For every watched asset, shows a compact price summary plus the
 * Claude-analyzed news articles that mention it (sentiment-badged,
 * newest to oldest). Assets are starred from anywhere in the app —
 * a table row or a price card — via WatchlistToggle.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Star, TrendingUp, TrendingDown, X, Newspaper, ExternalLink } from 'lucide-react'
import { useWatchlist } from '../context/WatchlistContext'
import {
  fetchWatchlistNews,
  fetchStockDetail, fetchCryptoDetail, fetchCommodityDetail, fetchForexDetail, fetchIndexDetail,
} from '../services/api'
import SentimentBadge, { sentimentBorder } from '../components/common/SentimentBadge'
import PriceAreaChart from '../components/charts/PriceAreaChart'
import { timeAgo } from '../utils/format'

// Each category's detail endpoint returns the same shape ({ history: [...] });
// dispatch to the right one by the asset's category, same as the market pages.
const DETAIL_FETCHERS = {
  stocks: fetchStockDetail,
  crypto: fetchCryptoDetail,
  commodities: fetchCommodityDetail,
  forex: fetchForexDetail,
  indices: fetchIndexDetail,
}

// Matches the accent color each market page uses for its own chart
const CATEGORY_COLORS = {
  stocks: '#6366f1',
  crypto: '#f59e0b',
  commodities: '#10b981',
  forex: '#38bdf8',
  indices: '#a78bfa',
}

const CHART_PERIODS = [
  { label: '1M', days: 30 },
  { label: '3M', days: 90 },
  { label: '1Y', days: 365 },
]

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

const CATEGORY_LABELS = {
  stocks: 'Stock', crypto: 'Crypto', commodities: 'Commodity', forex: 'Forex', indices: 'Index',
}

/** One related-news row — a compact variant of NewsAnalyzer's card, sized for a per-asset list. */
function RelatedNewsItem({ article }) {
  const dateStr = article.published_at ?? article.fetched_at
  return (
    <a
      href={article.url}
      target="_blank"
      rel="noreferrer"
      className={[
        'flex items-start justify-between gap-3 px-3 py-2.5 rounded-lg',
        'bg-surface hover:bg-surface-hover transition-colors group',
        sentimentBorder(article.sentiment_label),
      ].join(' ')}
    >
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          {article.source && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
              {article.source}
            </span>
          )}
          <span className="text-[11px] text-slate-600">{timeAgo(dateStr)}</span>
        </div>
        <p className="text-sm text-slate-200 leading-snug line-clamp-2 group-hover:text-white transition-colors">
          {article.title}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
        {article.sentiment_label && (
          <SentimentBadge label={article.sentiment_label} score={article.sentiment_score} />
        )}
        <ExternalLink size={11} className="text-slate-600 group-hover:text-slate-400 transition-colors" />
      </div>
    </a>
  )
}

/** Compact price-history chart with a period filter, sized for a grid card. */
function PriceHistorySection({ symbol, category }) {
  const [detail, setDetail] = useState(null)   // null while loading
  const [period, setPeriod] = useState('3M')
  const color = CATEGORY_COLORS[category] ?? '#6366f1'

  useEffect(() => {
    let cancelled = false
    setDetail(null)
    const fetchDetail = DETAIL_FETCHERS[category]
    if (!fetchDetail) { setDetail({ history: [] }); return }
    fetchDetail(symbol)
      .then(data => { if (!cancelled) setDetail(data) })
      .catch(() => { if (!cancelled) setDetail({ history: [] }) })
    return () => { cancelled = true }
  }, [symbol, category])

  const filteredHistory = useMemo(() => {
    if (!detail?.history?.length) return []
    const days = CHART_PERIODS.find(p => p.label === period)?.days ?? 90
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - days)
    return detail.history.filter(row => new Date(row.date) >= cutoff)
  }, [detail, period])

  return (
    <div className="pt-3 border-t border-surface-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] text-slate-600 uppercase tracking-wider">Price History</p>
        <div className="flex gap-1 bg-surface-border/40 rounded-lg p-0.5">
          {CHART_PERIODS.map(p => (
            <button
              key={p.label}
              onClick={() => setPeriod(p.label)}
              className={`px-2 py-0.5 text-[11px] rounded font-medium transition-all ${
                period === p.label ? 'bg-brand text-white' : 'text-slate-400 hover:text-white'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {detail
        ? filteredHistory.length > 0
          ? <PriceAreaChart data={filteredHistory} color={color} height={140} />
          : <div className="h-24 flex items-center justify-center text-slate-500 text-xs">No data for this period</div>
        : <div className="h-[140px] bg-surface rounded-lg animate-pulse" />
      }
    </div>
  )
}

/** One watched asset: price summary header, price chart, and related news list, newest first. */
function WatchlistAssetCard({ item }) {
  const [news, setNews] = useState(null)   // null while loading
  const { toggle } = useWatchlist()
  const isUp = item.change_percent >= 0

  useEffect(() => {
    let cancelled = false
    fetchWatchlistNews(item.symbol)
      .then(data => { if (!cancelled) setNews(data) })
      .catch(() => { if (!cancelled) setNews([]) })
    return () => { cancelled = true }
  }, [item.symbol])

  return (
    <div className="card">
      {/* ── Header: name/symbol/category (left) | price + remove (right) ── */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold text-white">{item.name}</h3>
            <span className="text-[10px] uppercase tracking-wider text-slate-500 bg-surface-hover px-1.5 py-0.5 rounded">
              {CATEGORY_LABELS[item.category] ?? item.category}
            </span>
          </div>
          <p className="text-xs num text-slate-500 mt-0.5">{item.symbol}</p>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <p className="text-lg font-semibold num text-white">
              {formatPrice(item.price, item.symbol)}
            </p>
            <p className={`text-xs num ${isUp ? 'text-up' : 'text-down'}`}>
              {isUp
                ? <TrendingUp size={10} className="inline mr-1" />
                : <TrendingDown size={10} className="inline mr-1" />
              }
              {item.change_percent != null ? `${isUp ? '+' : ''}${item.change_percent.toFixed(2)}%` : '—'}
            </p>
          </div>
          <button
            onClick={() => toggle(item)}
            title="Remove from watchlist"
            className="text-slate-500 hover:text-down transition-colors p-1"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* ── Price history chart, filterable by period ── */}
      <PriceHistorySection symbol={item.symbol} category={item.category} />

      {/* ── Related news, sorted newest to oldest ── */}
      <div className="pt-3 mt-3 border-t border-surface-border">
        <p className="text-[11px] text-slate-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
          <Newspaper size={11} />
          Related News
          {news?.length > 0 && <span className="text-slate-700">· {news.length}</span>}
        </p>

        {news === null && (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <div key={i} className="h-12 bg-surface rounded-lg animate-pulse" />
            ))}
          </div>
        )}

        {news?.length === 0 && (
          <p className="text-xs text-slate-600 italic py-1.5">
            No analyzed news mentions this asset yet.
          </p>
        )}

        {news?.length > 0 && (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {news.map(article => <RelatedNewsItem key={article.id} article={article} />)}
          </div>
        )}
      </div>
    </div>
  )
}

export default function Watchlist() {
  const { items, loading } = useWatchlist()
  const navigate = useNavigate()

  return (
    <div className="max-w-[1600px] mx-auto">
      {/* ── Page header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 mb-1">
          <Star size={12} className="text-amber-400" fill="currentColor" />
          <span className="text-[11px] text-amber-400 font-medium uppercase tracking-wider">
            Personal
          </span>
        </div>
        <h1 className="text-2xl font-bold text-white">Watchlist</h1>
        <p className="text-sm text-slate-400 mt-1">
          Assets you're tracking, with price history, related news and AI sentiment
        </p>
      </div>

      {/* ── Loading skeleton ── */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-96 bg-surface-card rounded-xl border border-surface-border animate-pulse" />
          ))}
        </div>
      )}

      {/* ── Empty state ── */}
      {!loading && items.length === 0 && (
        <div className="card text-center py-16">
          <Star size={44} className="text-slate-700 mx-auto mb-4" />
          <h3 className="text-white font-semibold mb-2">Your watchlist is empty</h3>
          <p className="text-slate-400 text-sm mb-5 max-w-sm mx-auto">
            Click the star icon next to any asset — in a table row or on a price
            card — to add it here and follow the news that moves it.
          </p>
          <button
            onClick={() => navigate('/stocks')}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand/10 hover:bg-brand/20 text-brand border border-brand/30 rounded-lg text-sm font-medium transition-colors"
          >
            Browse Stocks
          </button>
        </div>
      )}

      {/* ── Watched assets ── */}
      {!loading && items.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5 items-start">
          {items.map(item => <WatchlistAssetCard key={item.symbol} item={item} />)}
        </div>
      )}
    </div>
  )
}
