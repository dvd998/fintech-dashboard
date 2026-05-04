import { useEffect, useState } from 'react'
import { fetchCrypto, fetchCryptoDetail } from '../services/api'
import PriceTable from '../components/common/PriceTable'
import PriceCard from '../components/common/PriceCard'
import DetailPanel from '../components/common/DetailPanel'

export default function Crypto({ onDataLoaded }) {
  const [assets,   setAssets]   = useState([])
  const [loading,  setLoading]  = useState(true)
  const [selected, setSelected] = useState(null)
  const [detail,   setDetail]   = useState(null)

  async function load() {
    setLoading(true)
    try {
      const data = await fetchCrypto()
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
      const d = await fetchCryptoDetail(asset.symbol)
      setDetail(d)
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div>
      {/* Cards grid at top for a visual overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-3 mb-6">
        {loading
          ? Array(8).fill(0).map((_, i) => (
              <div key={i} className="card animate-pulse h-24" />
            ))
          : assets.map(a => (
              <PriceCard key={a.symbol} asset={a} onClick={() => handleSelect(a)} />
            ))
        }
      </div>

      {/* Full table */}
      {!loading && <PriceTable assets={assets} onRowClick={handleSelect} />}

      {selected && (
        <DetailPanel
          key={selected.symbol}
          selected={selected}
          detail={detail}
          color="#f59e0b"
          onClose={() => { setSelected(null); setDetail(null) }}
        />
      )}
    </div>
  )
}
