/**
 * NewsAnalyzer — AI-powered financial news sentiment page.
 *
 * Layout:
 *   1. Page header with title, description, and "Fetch Latest" button
 *   2. Stats row (total, bullish, bearish, neutral counts)
 *   3. Filter tabs (All / Bullish / Bearish / Neutral)
 *   4. News card feed — each card shows:
 *        - Sentiment-colored left border + badge with score
 *        - Headline, source, timestamp, summary excerpt
 *        - Expandable "AI Analysis" section with Claude's reasoning
 *        - Affected asset chips (↑ AAPL, ↓ GC=F …)
 *        - Tag pills
 *
 * State:
 *   articles    — full list from backend (all fetched + analyzed articles)
 *   loading     — true during initial page load
 *   refreshing  — true while "Fetch Latest" is running (can take 10–30s)
 *   filter      — "all" | "bullish" | "bearish" | "neutral"
 *   expandedIds — Set of article IDs whose AI analysis section is open
 *   search      — string typed into the ticker/name search box
 *   statusMsg   — short feedback message shown after a refresh
 *   error       — error string to display if something goes wrong
 */
import { useEffect, useState } from 'react'
import {
  Sparkles, RefreshCw, Loader2, TrendingUp, TrendingDown,
  Minus, Brain, Newspaper, ExternalLink, AlertTriangle,
  Search, X,
} from 'lucide-react'
import { fetchNews, refreshNews } from '../services/api'

// ── Tiny helper utilities ─────────────────────────────────────────────────────

/** How long ago was this date? Returns e.g. "3h ago", "2d ago". */
function timeAgo(dateStr) {
  if (!dateStr) return ''
  const diffMs = Date.now() - new Date(dateStr).getTime()
  const mins   = Math.floor(diffMs / 60_000)
  const hours  = Math.floor(diffMs / 3_600_000)
  const days   = Math.floor(diffMs / 86_400_000)
  if (mins < 1)   return 'just now'
  if (hours < 1)  return `${mins}m ago`
  if (days  < 1)  return `${hours}h ago`
  return `${days}d ago`
}

/** Format a sentiment score like "+0.73" or "−0.42". */
function fmtScore(score) {
  if (score == null) return ''
  return score > 0 ? `+${score.toFixed(2)}` : score.toFixed(2)
}

// ── Sub-components ────────────────────────────────────────────────────────────

/**
 * Sentiment badge — shows label + numeric score in the matching color.
 * bullish → green, bearish → red, neutral → slate.
 */
function SentimentBadge({ label, score }) {
  const cfg = {
    bullish: { cls: 'text-up bg-up/10',       Icon: TrendingUp   },
    bearish: { cls: 'text-down bg-down/10',    Icon: TrendingDown },
    neutral: { cls: 'text-slate-400 bg-slate-500/10', Icon: Minus },
  }
  const { cls, Icon } = cfg[label] ?? cfg.neutral

  return (
    <span className={`flex items-center gap-1 text-xs px-2 py-0.5 rounded font-medium num whitespace-nowrap ${cls}`}>
      <Icon size={10} />
      {label ? label.charAt(0).toUpperCase() + label.slice(1) : 'Unknown'}
      {score != null && <span className="ml-0.5 opacity-80">{fmtScore(score)}</span>}
    </span>
  )
}

/**
 * Thin horizontal bar visualizing the sentiment score from -1 to +1.
 * Center = neutral, right = bullish (green), left = bearish (red).
 */
function ScoreBar({ score }) {
  if (score == null) return null
  // Normalize: -1 → 0%, 0 → 50%, +1 → 100%
  const pct   = Math.round(((score + 1) / 2) * 100)
  const color  = score > 0.15 ? 'bg-up' : score < -0.15 ? 'bg-down' : 'bg-slate-500'
  return (
    <div className="flex items-center gap-2 mt-1.5">
      {/* Bar fills from left; visual center reference not shown to keep it minimal */}
      <div className="w-20 h-1 bg-surface-hover rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/**
 * Chip for one affected asset.
 * Shows an up/down/neutral arrow, the symbol, and a tooltip with Claude's reason.
 */
function AssetChip({ asset }) {
  const cfg = {
    positive: { cls: 'text-up border-up/40',       arrow: '↑' },
    negative: { cls: 'text-down border-down/40',   arrow: '↓' },
    neutral:  { cls: 'text-slate-400 border-slate-600', arrow: '→' },
  }
  const { cls, arrow } = cfg[asset.impact] ?? cfg.neutral

  return (
    /* title gives a native tooltip showing Claude's one-line reason */
    <span
      title={asset.reason}
      className={`text-[10px] border px-1.5 py-0.5 rounded num cursor-help ${cls}`}
    >
      {arrow} {asset.symbol}
    </span>
  )
}

/**
 * The colored left border width/color depends on sentiment.
 * We return a className string used on the card wrapper.
 */
function sentimentBorder(label) {
  return {
    bullish: 'border-l-[3px] border-l-up/60',
    bearish: 'border-l-[3px] border-l-down/60',
    neutral: 'border-l-[3px] border-l-slate-600',
  }[label] ?? 'border-l-[3px] border-l-surface-border'
}

/**
 * Single news article card.
 * The "AI Analysis" section is collapsed by default; clicking the toggle reveals it.
 */
function NewsCard({ article, expanded, onToggle }) {
  const hasAnalysis = !!article.reasoning
  const dateStr     = article.published_at ?? article.fetched_at

  return (
    <article
      className={[
        'card mb-3 transition-all duration-200',
        sentimentBorder(article.sentiment_label),
      ].join(' ')}
    >
      {/* ── Top row: source + time (left) | sentiment badge (right) ── */}
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Source tag */}
          {article.source && (
            <span className="text-[10px] font-medium uppercase tracking-wider text-slate-500 bg-surface-hover px-2 py-0.5 rounded">
              {article.source}
            </span>
          )}
          {/* Timestamp */}
          <span className="text-[11px] text-slate-600">{timeAgo(dateStr)}</span>
        </div>

        {/* Sentiment badge — only shown when analysis exists */}
        {article.sentiment_label && (
          <div className="flex-shrink-0">
            <SentimentBadge label={article.sentiment_label} score={article.sentiment_score} />
            <ScoreBar score={article.sentiment_score} />
          </div>
        )}
      </div>

      {/* ── Headline ── */}
      <a
        href={article.url}
        target="_blank"
        rel="noreferrer"
        className="group"
      >
        <h3 className="text-sm font-semibold text-white leading-snug mb-1.5 group-hover:text-brand transition-colors">
          {article.title}
          <ExternalLink size={10} className="inline ml-1.5 opacity-0 group-hover:opacity-50 transition-opacity" />
        </h3>
      </a>

      {/* ── Summary excerpt ── */}
      {article.summary && (
        <p className="text-xs text-slate-400 leading-relaxed line-clamp-2 mb-3">
          {article.summary}
        </p>
      )}

      {/* ── AI Analysis expandable section ── */}
      {hasAnalysis && (
        <div className="mt-1">
          {/* Toggle button */}
          <button
            onClick={onToggle}
            className="flex items-center gap-1.5 text-[11px] text-slate-500 hover:text-brand transition-colors"
          >
            <Brain size={12} />
            AI Analysis
            <span className="ml-0.5 opacity-60">{expanded ? '▲' : '▼'}</span>
          </button>

          {/* Expanded panel */}
          {expanded && (
            <div className="mt-2 p-3 bg-surface rounded-lg border border-surface-border space-y-3">
              {/* Claude's reasoning paragraph */}
              <p className="text-xs text-slate-300 leading-relaxed">
                {article.reasoning}
              </p>

              {/* Affected assets chips */}
              {article.affected_assets?.length > 0 && (
                <div>
                  <p className="text-[10px] text-slate-600 uppercase tracking-wider mb-1.5">
                    Affected Assets
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {article.affected_assets.map(asset => (
                      <AssetChip key={asset.symbol} asset={asset} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tags row ── */}
      {article.tags?.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-3">
          {article.tags.map(tag => (
            <span
              key={tag}
              className="text-[10px] text-slate-600 bg-surface-hover px-1.5 py-0.5 rounded"
            >
              #{tag}
            </span>
          ))}
        </div>
      )}
    </article>
  )
}

// ── Filter tab config ─────────────────────────────────────────────────────────

const FILTER_TABS = [
  { key: 'all',     label: 'All'     },
  { key: 'bullish', label: 'Bullish' },
  { key: 'bearish', label: 'Bearish' },
  { key: 'neutral', label: 'Neutral' },
]

// ── Main page component ───────────────────────────────────────────────────────

export default function NewsAnalyzer() {
  const [articles,    setArticles]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [refreshing,  setRefreshing]  = useState(false)
  const [filter,      setFilter]      = useState('all')
  const [expandedIds, setExpandedIds] = useState(new Set())
  const [search,      setSearch]      = useState('')     // ticker / name search
  const [statusMsg,   setStatusMsg]   = useState(null)  // success feedback
  const [error,       setError]       = useState(null)

  // ── Load cached articles on mount ──
  async function load() {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchNews()
      setArticles(data)
    } catch {
      setError('Failed to load articles. Is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // ── Refresh: fetch RSS + run Claude analysis ──
  async function handleRefresh() {
    setRefreshing(true)
    setStatusMsg(null)
    setError(null)
    try {
      const result = await refreshNews()
      setStatusMsg(result.message)
      // Reload the article list to show new results
      const data = await fetchNews()
      setArticles(data)
    } catch (err) {
      const detail = err.response?.data?.detail
      if (detail?.includes('ANTHROPIC_API_KEY')) {
        setError('ANTHROPIC_API_KEY is not set — add it to backend/.env and restart.')
      } else {
        setError(detail ?? 'Refresh failed. Check the server logs.')
      }
    } finally {
      setRefreshing(false)
    }
  }

  // ── Toggle expanded AI analysis panel for one article ──
  function toggleExpand(id) {
    setExpandedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else              next.add(id)
      return next
    })
  }

  // ── Compute stats + filtered list ──
  const counts = {
    all:     articles.length,
    bullish: articles.filter(a => a.sentiment_label === 'bullish').length,
    bearish: articles.filter(a => a.sentiment_label === 'bearish').length,
    neutral: articles.filter(a => a.sentiment_label === 'neutral').length,
  }

  // Apply sentiment tab filter first, then the ticker/name search on top of it.
  // Search matches against affected_assets symbol (e.g. "AAPL") or name (e.g. "Apple").
  const q = search.trim().toLowerCase()
  const filtered = articles
    .filter(a => filter === 'all' || a.sentiment_label === filter)
    .filter(a => {
      if (!q) return true
      return a.affected_assets?.some(
        asset =>
          asset.symbol.toLowerCase().includes(q) ||
          asset.name.toLowerCase().includes(q)
      )
    })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-3xl mx-auto">

      {/* ── Page header ── */}
      <div className="flex items-start justify-between mb-6">
        <div>
          {/* Breadcrumb-style label */}
          <div className="flex items-center gap-1.5 mb-1">
            <Sparkles size={12} className="text-brand" />
            <span className="text-[11px] text-brand font-medium uppercase tracking-wider">
              AI Labs
            </span>
          </div>
          <h1 className="text-2xl font-bold text-white">News Analyzer</h1>
          <p className="text-sm text-slate-400 mt-1">
            Financial headlines analyzed for market sentiment by Claude AI
          </p>
        </div>

        {/* Fetch / Refresh button */}
        <button
          onClick={handleRefresh}
          disabled={refreshing || loading}
          className={[
            'flex items-center gap-2 text-sm px-4 py-2 rounded-lg border font-medium transition-all',
            refreshing
              ? 'border-brand/50 text-brand bg-brand/5 cursor-not-allowed'
              : 'border-surface-border text-slate-300 hover:border-brand/50 hover:text-brand hover:bg-brand/5',
          ].join(' ')}
        >
          {refreshing
            ? <><Loader2 size={14} className="animate-spin" /> Analyzing…</>
            : <><RefreshCw size={14} /> Fetch Latest</>
          }
        </button>
      </div>

      {/* ── Status / error banners ── */}
      {statusMsg && (
        <div className="flex items-center gap-2 text-xs text-up bg-up/10 border border-up/20 rounded-lg px-4 py-2.5 mb-4">
          <Sparkles size={12} />
          {statusMsg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 text-xs text-down bg-down/10 border border-down/20 rounded-lg px-4 py-2.5 mb-4">
          <AlertTriangle size={12} />
          {error}
        </div>
      )}

      {/* ── Stats row ── */}
      {!loading && articles.length > 0 && (
        <div className="grid grid-cols-4 gap-3 mb-6">
          {[
            { label: 'Total',   value: counts.all,     color: 'text-white'      },
            { label: 'Bullish', value: counts.bullish,  color: 'text-up'        },
            { label: 'Bearish', value: counts.bearish,  color: 'text-down'      },
            { label: 'Neutral', value: counts.neutral,  color: 'text-slate-400' },
          ].map(stat => (
            <div key={stat.label} className="card text-center py-3">
              <p className={`text-xl font-bold num ${stat.color}`}>{stat.value}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Filter tabs + search row ── */}
      {!loading && articles.length > 0 && (
        <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">

          {/* Sentiment filter tabs */}
          <div className="flex items-center gap-1">
            {FILTER_TABS.map(tab => (
              <button
                key={tab.key}
                onClick={() => setFilter(tab.key)}
                className={[
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors',
                  filter === tab.key
                    ? 'bg-brand/15 text-brand border border-brand/30'
                    : 'text-slate-400 hover:text-white hover:bg-surface-hover border border-transparent',
                ].join(' ')}
              >
                {tab.label}
                {/* Show count badge on the active tab */}
                {filter === tab.key && (
                  <span className="ml-1.5 text-brand/60 num">{counts[tab.key]}</span>
                )}
              </button>
            ))}
          </div>

          {/* Ticker / name search input */}
          <div className="relative flex items-center">
            <Search
              size={13}
              className="absolute left-3 text-slate-500 pointer-events-none"
            />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search ticker or name…"
              className="
                w-52 bg-surface-card border border-surface-border rounded-lg
                pl-8 pr-8 py-1.5 text-xs text-slate-200 placeholder-slate-600
                focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20
                transition-colors
              "
            />
            {/* Clear button — only shown when something is typed */}
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-2.5 text-slate-500 hover:text-slate-300 transition-colors"
              >
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Content ── */}

      {/* Skeleton loader while initial fetch is in progress */}
      {loading && (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-28 bg-surface-card rounded-xl border border-surface-border animate-pulse" />
          ))}
        </div>
      )}

      {/* Empty state — no articles fetched yet */}
      {!loading && articles.length === 0 && (
        <div className="card text-center py-16">
          <Newspaper size={44} className="text-slate-700 mx-auto mb-4" />
          <h3 className="text-white font-semibold mb-2">No articles yet</h3>
          <p className="text-slate-400 text-sm mb-5 max-w-xs mx-auto">
            Click "Fetch Latest" to pull financial headlines from RSS feeds and
            analyze them with Claude AI.
          </p>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand/10 hover:bg-brand/20 text-brand border border-brand/30 rounded-lg text-sm font-medium transition-colors"
          >
            <Sparkles size={14} />
            Fetch Latest News
          </button>
        </div>
      )}

      {/* Empty filter/search state — articles exist but none match the current filters */}
      {!loading && articles.length > 0 && filtered.length === 0 && (
        <div className="card text-center py-10">
          <Search size={32} className="text-slate-700 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">
            No articles match
            {q && <span className="text-white font-medium"> "{search}"</span>}
            {filter !== 'all' && (
              <span> with <span className="text-white font-medium">{filter}</span> sentiment</span>
            )}.
          </p>
          {/* Quick-clear actions */}
          <div className="flex items-center justify-center gap-2 mt-3">
            {q && (
              <button
                onClick={() => setSearch('')}
                className="text-xs text-brand hover:underline"
              >
                Clear search
              </button>
            )}
            {filter !== 'all' && (
              <button
                onClick={() => setFilter('all')}
                className="text-xs text-brand hover:underline"
              >
                Show all sentiments
              </button>
            )}
          </div>
        </div>
      )}

      {/* Article cards */}
      {!loading && filtered.length > 0 && (
        <div>
          {filtered.map(article => (
            <NewsCard
              key={article.id}
              article={article}
              expanded={expandedIds.has(article.id)}
              onToggle={() => toggleExpand(article.id)}
            />
          ))}
        </div>
      )}
    </div>
  )
}
