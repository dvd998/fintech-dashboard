/**
 * App — root component.
 * Sets up the router, layout (Sidebar + Header), and renders the current page.
 *
 * React Router works like this:
 *   <BrowserRouter> — wraps everything and enables URL-based routing
 *   <Routes>        — looks at the current URL and renders the matching <Route>
 *   <Route>         — maps a URL path to a component
 */
import { useState } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/layout/Sidebar'
import Header  from './components/layout/Header'
import Dashboard   from './pages/Dashboard'
import Stocks      from './pages/Stocks'
import Crypto      from './pages/Crypto'
import Commodities from './pages/Commodities'
import Forex       from './pages/Forex'
import Indices     from './pages/Indices'

export default function App() {
  // lastUpdated is set by each page after it finishes loading data
  // and is passed to the Header to display "Updated 14:32"
  const [lastUpdated, setLastUpdated] = useState(null)
  const [refreshKey,  setRefreshKey]  = useState(0)  // increment to force pages to re-fetch

  function handleRefresh() {
    setRefreshKey(k => k + 1)
  }

  return (
    // BrowserRouter must wrap everything that uses routing hooks
    <BrowserRouter>
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
              <Route path="/"            element={<Dashboard   key={refreshKey} onDataLoaded={setLastUpdated} />} />
              <Route path="/stocks"      element={<Stocks      key={refreshKey} onDataLoaded={setLastUpdated} />} />
              <Route path="/crypto"      element={<Crypto      key={refreshKey} onDataLoaded={setLastUpdated} />} />
              <Route path="/commodities" element={<Commodities key={refreshKey} onDataLoaded={setLastUpdated} />} />
              <Route path="/forex"       element={<Forex       key={refreshKey} onDataLoaded={setLastUpdated} />} />
              <Route path="/indices"     element={<Indices     key={refreshKey} onDataLoaded={setLastUpdated} />} />
            </Routes>
          </main>
        </div>
      </div>
    </BrowserRouter>
  )
}
