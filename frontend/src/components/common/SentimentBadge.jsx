/**
 * SentimentBadge — shows a sentiment label + numeric score in the matching color.
 * bullish → green, bearish → red, neutral → slate.
 * Shared by NewsAnalyzer and the Watchlist's per-asset news feed.
 */
import { TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { fmtScore } from '../../utils/format'

/** Left-border color for a news card, matching its sentiment. */
export function sentimentBorder(label) {
  return {
    bullish: 'border-l-[3px] border-l-up/60',
    bearish: 'border-l-[3px] border-l-down/60',
    neutral: 'border-l-[3px] border-l-slate-600',
  }[label] ?? 'border-l-[3px] border-l-surface-border'
}

export default function SentimentBadge({ label, score }) {
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
