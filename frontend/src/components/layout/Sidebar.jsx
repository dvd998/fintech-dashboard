/**
 * Sidebar — fixed left navigation.
 * Uses React Router's <NavLink> which automatically adds an 'active' class
 * when the current URL matches the link's destination.
 */
import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  TrendingUp,
  Bitcoin,
  Layers,
  DollarSign,
  BarChart2,
} from 'lucide-react'

// Each nav item: where it goes and which icon to show
const NAV_ITEMS = [
  { to: '/',            label: 'Dashboard',   icon: LayoutDashboard },
  { to: '/stocks',      label: 'Stocks',      icon: TrendingUp      },
  { to: '/crypto',      label: 'Crypto',      icon: Bitcoin         },
  { to: '/commodities', label: 'Commodities', icon: Layers          },
  { to: '/forex',       label: 'Forex',       icon: DollarSign      },
  { to: '/indices',     label: 'Indices',     icon: BarChart2       },
]

export default function Sidebar() {
  return (
    <aside className="fixed top-0 left-0 h-screen w-56 bg-surface-card border-r border-surface-border flex flex-col z-30">
      {/* Logo / brand */}
      <div className="px-5 py-5 border-b border-surface-border">
        <span className="text-lg font-bold text-brand">Fin</span>
        <span className="text-lg font-bold text-white">Dash</span>
        <p className="text-xs text-slate-500 mt-0.5">Market Intelligence</p>
      </div>

      {/* Navigation links */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}   // 'end' means only match exactly '/', not '/stocks' etc.
            className={({ isActive }) =>
              [
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand/10 text-brand'            // active: highlighted
                  : 'text-slate-400 hover:text-white hover:bg-surface-hover', // inactive
              ].join(' ')
            }
          >
            <Icon size={18} />
            {label}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-4 border-t border-surface-border">
        <p className="text-xs text-slate-600">Data via yfinance</p>
        <p className="text-xs text-slate-600">Delayed ~15 min</p>
      </div>
    </aside>
  )
}
