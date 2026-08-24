/**
 * Stocks page — full table of tracked stocks + a chart drawer when a row is clicked.
 */
import { useEffect, useState } from 'react'
import { fetchStocks, fetchStockDetail } from '../services/api'
import PriceTable from '../components/common/PriceTable'
import PriceCard from '../components/common/PriceCard'
import DetailPanel from '../components/common/DetailPanel'

// Stocks list is long, so the card strip only surfaces the highest-value names
// (unlike the other tabs, which are short enough to card up in full).
const TOP_N = 5

export default function Stocks({ onDataLoaded }) {
  const [assets,   setAssets]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)   // the asset the user clicked
  const [detail,   setDetail]   = useState(null)   // full detail (incl. history) for selected

  async function load() {
    setLoading(true)
    try {
      const data = await fetchStocks()
      setAssets(data)
      onDataLoaded?.(new Date())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // When user clicks a row, fetch the detail (history) for that asset
  async function handleSelect(asset) {
    setSelected(asset)
    setDetail(null)   // clear old detail while loading
    try {
      const d = await fetchStockDetail(asset.symbol)
      setDetail(d)
    } catch (e) {
      console.error(e)
    }
  }

  // Highest-value names for the card strip up top
  const topStocks = [...assets]
    .filter(a => a.price != null)
    .sort((a, b) => b.price - a.price)
    .slice(0, TOP_N)

  return (
    <div>
      {/* Cards strip — top 5 stocks by price, for a visual overview */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        {loading
          ? Array(TOP_N).fill(0).map((_, i) => <div key={i} className="card animate-pulse h-24" />)
          : topStocks.map(a => (
              <PriceCard key={a.symbol} asset={a} onClick={() => handleSelect(a)} />
            ))
        }
      </div>

      {/* Main table */}
      {loading
        ? <div className="h-64 bg-surface-card rounded-xl animate-pulse" />
        : <PriceTable assets={assets} onRowClick={handleSelect} />
      }

      {selected && (
        <DetailPanel
          key={selected.symbol}
          selected={selected}
          detail={detail}
          color="#6366f1"
          onClose={() => { setSelected(null); setDetail(null) }}
        />
      )}
    </div>
  )
}
