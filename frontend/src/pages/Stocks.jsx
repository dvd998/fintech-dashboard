/**
 * Stocks page — full table of tracked stocks + a chart drawer when a row is clicked.
 */
import { useEffect, useState } from 'react'
import { fetchStocks, fetchStockDetail } from '../services/api'
import PriceTable from '../components/common/PriceTable'
import DetailPanel from '../components/common/DetailPanel'

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

  return (
    <div>
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
