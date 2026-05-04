import { useEffect, useState } from 'react'
import { fetchCommodities, fetchCommodityDetail } from '../services/api'
import PriceTable from '../components/common/PriceTable'
import PriceCard from '../components/common/PriceCard'
import DetailPanel from '../components/common/DetailPanel'

export default function Commodities({ onDataLoaded }) {
  const [assets,   setAssets]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)
  const [detail,   setDetail]   = useState(null)

  async function load() {
    setLoading(true)
    try {
      const data = await fetchCommodities()
      setAssets(data)
      onDataLoaded?.(new Date())
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleSelect(asset) {
    setSelected(asset)
    setDetail(null)
    try {
      const d = await fetchCommodityDetail(asset.symbol)
      setDetail(d)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
        {loading
          ? Array(7).fill(0).map((_, i) => <div key={i} className="card animate-pulse h-24" />)
          : assets.map(a => <PriceCard key={a.symbol} asset={a} onClick={() => handleSelect(a)} />)
        }
      </div>

      {!loading && <PriceTable assets={assets} onRowClick={handleSelect} />}

      {selected && (
        <DetailPanel
          key={selected.symbol}
          selected={selected}
          detail={detail}
          color="#10b981"
          onClose={() => { setSelected(null); setDetail(null) }}
        />
      )}
    </div>
  )
}
