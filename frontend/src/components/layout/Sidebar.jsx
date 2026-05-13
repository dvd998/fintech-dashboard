/**
 * Sidebar — fixed left navigation.
 * Split into two sections:
 *   Markets  — the original price-data pages
 *   AI Labs  — AI-powered tools (AI Playground, News Analyzer, ...)
 *
 * NavLink from React Router automatically applies an 'active' style when
 * the current URL matches the link's path.
 */
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  TrendingUp,
  Bitcoin,
  Layers,
  DollarSign,
  BarChart2,
  Sparkles,
  Newspaper,
} from 'lucide-react'

// Market data pages
const MARKET_ITEMS = [
  { to: '/',            label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/stocks',      label: 'Stocks',      icon: TrendingUp      },
  { to: '/crypto',      label: 'Crypto',      icon: Bitcoin         },
  { to: '/commodities', label: 'Commodities', icon: Layers          },
  { to: '/forex',       label: 'Forex',       icon: DollarSign      },
  { to: '/indices',     label: 'Indices',     icon: BarChart2       },
]

// AI Playground sub-pages — add more here as features ship
const AI_ITEMS = [
  { to: '/ai-playground/news', label: 'News Analyzer', icon: Newspaper },
]

// Shared NavLink class builder — same style for both sections
function navClass({ isActive }) {
  return [
    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
    isActive
      ? 'bg-brand/10 text-brand'
      : 'text-slate-400 hover:text-white hover:bg-surface-hover',
  ].join(' ')
}

export default function Sidebar() {
  return (
    <aside className="fixed top-0 left-0 h-screen w-56 bg-surface-card border-r border-surface-border flex flex-col z-30">

      {/* Logo / brand */}
      <div className="px-5 py-5 border-b border-surface-border">
        <span className="text-lg font-bold text-brand">Fin</span>
        <span className="text-lg font-bold text-white">Dash</span>
        <p className="text-xs text-slate-500 mt-0.5">Market Intelligence</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">

        {/* ── Markets section ── */}
        <p className="text-[10px] uppercase tracking-widest text-slate-600 px-3 mb-2 font-semibold">
          Markets
        </p>
        {MARKET_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}   /* 'end' prevents '/' from matching every route */
            className={navClass}
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}

        {/* Divider between sections */}
        <div className="border-t border-surface-border my-3 mx-1" />

        {/* ── AI Labs section ── */}
        <div className="flex items-center gap-1.5 px-3 mb-2">
          {/* Subtle gradient dot to mark this as something special */}
          <Sparkles size={10} className="text-brand" />
          <p className="text-[10px] uppercase tracking-widest text-slate-600 font-semibold">
            AI Labs
          </p>
        </div>
        {AI_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} className={navClass}>
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-surface-border">
        <p className="text-xs text-slate-600">Data via yfinance · CoinGecko</p>
        <p className="text-xs text-slate-600">AI via Claude Haiku</p>
      </div>
    </aside>
  )
}
