/**
 * All backend API calls go through this file.
 * axios is like the browser's fetch() but with nicer error handling and defaults.
 */
import axios from 'axios'

// Base URL — in dev the Vite proxy forwards /api/* to FastAPI on port 8000
const api = axios.create({ baseURL: '/api' })

// ── Stocks ──────────────────────────────────────────────────────────────────
export const fetchStocks      = () => api.get('/stocks/').then(r => r.data)
export const fetchStockDetail = (symbol) => api.get(`/stocks/${symbol}`).then(r => r.data)

// ── Crypto ──────────────────────────────────────────────────────────────────
export const fetchCrypto      = () => api.get('/crypto/').then(r => r.data)
export const fetchCryptoDetail = (symbol) => api.get(`/crypto/${symbol}`).then(r => r.data)

// ── Commodities ──────────────────────────────────────────────────────────────
export const fetchCommodities       = () => api.get('/commodities/').then(r => r.data)
export const fetchCommodityDetail   = (symbol) => api.get(`/commodities/${symbol}`).then(r => r.data)

// ── Forex ────────────────────────────────────────────────────────────────────
export const fetchForex       = () => api.get('/forex/').then(r => r.data)
export const fetchForexDetail = (symbol) => api.get(`/forex/${symbol}`).then(r => r.data)

// ── Indices ──────────────────────────────────────────────────────────────────
export const fetchIndices      = () => api.get('/indices/').then(r => r.data)
export const fetchIndexDetail  = (symbol) => api.get(`/indices/${symbol}`).then(r => r.data)

// ── AI Playground — News Analyzer ───────────────────────────────────────────
// fetchNews: returns cached analyzed articles from the DB (all of them, unless limit is passed)
export const fetchNews         = (limit) => api.get('/playground/news', { params: limit ? { limit } : {} }).then(r => r.data)
// refreshNews: triggers RSS fetch + Claude analysis for new articles
export const refreshNews       = () => api.post('/playground/news/refresh').then(r => r.data)

// ── Watchlist ────────────────────────────────────────────────────────────────
export const fetchWatchlist      = () => api.get('/watchlist/').then(r => r.data)
export const addToWatchlist      = (symbol) => api.post(`/watchlist/${symbol}`).then(r => r.data)
export const removeFromWatchlist = (symbol) => api.delete(`/watchlist/${symbol}`).then(r => r.data)
export const fetchWatchlistNews  = (symbol) => api.get(`/watchlist/${symbol}/news`).then(r => r.data)

// ── Portfolio simulator ──────────────────────────────────────────────────────
// fetchPortfolio: cash, totals, P&L and every open position at live prices
export const fetchPortfolio        = () => api.get('/portfolio/').then(r => r.data)
// fetchInstruments: every tradable asset with live price + quote currency
export const fetchInstruments      = () => api.get('/portfolio/instruments').then(r => r.data)
export const fetchTransactions     = () => api.get('/portfolio/transactions').then(r => r.data)
// mode: 'actual' (real trade replay) | 'backtest' (current holdings over the last `days`)
export const fetchPortfolioHistory = (mode = 'actual', days = 90) =>
  api.get('/portfolio/history', { params: { mode, days } }).then(r => r.data)
// trade: { symbol, side: 'buy'|'sell', amount_usd } or { symbol, side, units }
export const executeTrade          = (trade) => api.post('/portfolio/trade', trade).then(r => r.data)
export const resetPortfolio        = (startingCash) =>
  api.post('/portfolio/reset', { starting_cash: startingCash }).then(r => r.data)

// ── Margin trading (leveraged Long / Short) ──────────────────────────────────
// body: { symbol, side: 'long'|'short', leverage, margin_usd, stop_loss?, take_profit? }
export const openMarginPosition   = (body) => api.post('/portfolio/margin/open', body).then(r => r.data)
export const closeMarginPosition  = (id) => api.post(`/portfolio/margin/${id}/close`).then(r => r.data)
// levels: { stop_loss, take_profit } — null clears a level
export const updateMarginPosition = (id, levels) => api.patch(`/portfolio/margin/${id}`, levels).then(r => r.data)
