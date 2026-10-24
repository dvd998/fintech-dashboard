/**
 * Shared helpers for fetching per-category asset price history and keeping
 * chart colors consistent across pages (Watchlist, NewsAnalyzer, market pages).
 */
import {
  fetchStockDetail, fetchCryptoDetail, fetchCommodityDetail, fetchForexDetail, fetchIndexDetail,
} from '../services/api'

// Each category's detail endpoint returns the same shape ({ history: [...] });
// dispatch to the right one by the asset's category.
export const DETAIL_FETCHERS = {
  stocks: fetchStockDetail,
  crypto: fetchCryptoDetail,
  commodities: fetchCommodityDetail,
  forex: fetchForexDetail,
  indices: fetchIndexDetail,
}

// Matches the accent color each market page uses for its own chart
export const CATEGORY_COLORS = {
  stocks: '#6366f1',
  crypto: '#f59e0b',
  commodities: '#10b981',
  forex: '#38bdf8',
  indices: '#a78bfa',
}
