/**
 * App — root component.
 * Sets up the router. "/" shows the full-screen Landing page; every other
 * route is rendered inside the main layout (Sidebar + Header).
 *
 * React Router works like this:
 *   <BrowserRouter> — wraps everything and enables URL-based routing
 *   <Routes>        — looks at the current URL and renders the matching <Route>
 *   <Route>         — maps a URL path to a component
 */
import { useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { WatchlistProvider } from './context/WatchlistContext'
import Sidebar from './components/layout/Sidebar'
import Header  from './components/layout/Header'
import Landing      from './pages/Landing'
import Dashboard    from './pages/Dashboard'
import Watchlist    from './pages/Watchlist'
import Stocks       from './pages/Stocks'
import Crypto       from './pages/Crypto'
import Commodities  from './pages/Commodities'
import Forex        from './pages/Forex'
import Indices      from './pages/Indices'
import NewsAnalyzer from './pages/NewsAnalyzer'

export default function App() {
  // lastUpdated is set by each page after it finishes loading data
  // and is passed to the Header to display "Updated 14:32"
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshKey,  setRefreshKey]  = useState(0)  // increment to force pages to re-fetch

  function handleRefresh() {
    setRefreshKey(k => k + 1)
  }

  // The app shell (Sidebar + Header + page) used by every route except "/"
  const appLayout = (
    <div className="flex min-h-screen">
      {/* Fixed sidebar — always visible */}
      <Sidebar />

      {/* Main content area — offset left to clear the sidebar */}
      <div className="ml-56 flex-1 flex flex-col min-h-screen">
        {/* Sticky header */}
        <Header onRefresh={handleRefresh} lastUpdated={lastUpdated} />

        {/* Page content — padded */}
        <main className="flex-1 p-6">
          {/*
            key={refreshKey} on each page forces React to unmount and remount
            the component when the user clicks Refresh, which re-runs useEffect
            and fetches fresh data.
          */}
          <Routes>
            <Route path="/dashboard"   element={<Dashboard   key={refreshKey} onDataLoaded={setLastUpdated} />} />
            <Route path="/watchlist"   element={<Watchlist   key={refreshKey} />} />
            <Route path="/stocks"      element={<Stocks      key={refreshKey} onDataLoaded={setLastUpdated} />} />
            <Route path="/crypto"      element={<Crypto      key={refreshKey} onDataLoaded={setLastUpdated} />} />
            <Route path="/commodities" element={<Commodities key={refreshKey} onDataLoaded={setLastUpdated} />} />
            <Route path="/forex"       element={<Forex       key={refreshKey} onDataLoaded={setLastUpdated} />} />
            <Route path="/indices"             element={<Indices      key={refreshKey} onDataLoaded={setLastUpdated} />} />
            <Route path="/ai-playground/news" element={<NewsAnalyzer key={refreshKey} />} />
            {/* Unknown URLs fall back to the Dashboard */}
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )

  return (
    // BrowserRouter must wrap everything that uses routing hooks
    <BrowserRouter>
      {/* WatchlistProvider loads the starred-assets list once and shares it
          with every star toggle (tables, cards) and the Watchlist page */}
      <WatchlistProvider>
        <Routes>
          {/* Landing page — full-screen, no sidebar/header */}
          <Route path="/"  element={<Landing />} />
          {/* Everything else — "/*" lets the nested <Routes> above match the rest */}
          <Route path="/*" element={appLayout} />
        </Routes>
      </WatchlistProvider>
    </BrowserRouter>
  )
}
