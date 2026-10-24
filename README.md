# FinTech Dashboard

A real-time financial data dashboard built with FastAPI and React. Tracks stocks, crypto, forex, commodities, and market indices — all in one dark-mode UI.

![Stack](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square) ![Stack](https://img.shields.io/badge/Frontend-React%20%2F%20Vite-61DAFB?style=flat-square) ![Stack](https://img.shields.io/badge/Data-yfinance-blue?style=flat-square) ![Stack](https://img.shields.io/badge/AI-Claude%20Haiku-8B5CF6?style=flat-square)

---

## Features

- **5 asset categories** — Stocks, Crypto, Forex, Commodities, Indices
- **Dashboard overview** — top movers pulled from every category in one glance
- **Live price data** refreshed every 5 minutes via [yfinance](https://github.com/ranaroussi/yfinance)
- **Interactive charts** — click any asset to open a price history chart
- **Period filters** — 1W / 1M / 3M / 6M / 1Y with per-period % change badge
- **Currency labels** — correct local currency per asset (USD, EUR, GBP, JPY, HKD)
- **Sortable tables** — sort by price, change, volume, market cap, and more
- SQLite database with 1 year of daily OHLCV history per asset
- **Watchlist** — star any asset from a table row or price card; each watched asset gets its own filterable price chart (1W/1M/3M/1Y, with the % change recalculated for the selected period) and a feed of the AI-analyzed news mentioning it
- **AI News Analyzer** — financial headlines fetched from RSS feeds and Finnhub, filtered for market relevance, and analyzed by Claude AI for sentiment — including a **Market Impact Since Release** chart showing how each affected asset actually moved after the news broke

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI, SQLAlchemy, APScheduler |
| Data | yfinance, CoinGecko, feedparser (RSS), Finnhub |
| AI | Claude Haiku (Anthropic) |
| Database | SQLite |
| Frontend | React 18, Vite, Recharts, Tailwind CSS |

## Project Structure

```
fintech-dashboard/
├── backend/
│   ├── app/
│   │   ├── routers/        # API endpoints (stocks, crypto, forex, watchlist, news, …)
│   │   ├── services/       # yfinance + CoinGecko + Finnhub data fetching, news + AI analysis
│   │   ├── models.py       # SQLAlchemy models
│   │   ├── schemas.py      # Pydantic response schemas
│   │   ├── scheduler.py    # Background price refresh jobs
│   │   └── config.py       # Tracked asset symbols
│   ├── scripts/            # One-off maintenance scripts (e.g. news cleanup)
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/          # Dashboard, Stocks, Crypto, Forex, Commodities, Indices, Watchlist, NewsAnalyzer
        ├── components/     # PriceCard, PriceTable, DetailPanel, WatchlistToggle, SentimentBadge, charts
        ├── context/        # WatchlistContext — shares starred assets across the app
        ├── utils/          # formatting helpers, shared asset-detail fetchers
        └── services/       # axios API client
```

## Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # macOS / Linux

pip install -r requirements.txt
uvicorn app.main:app --reload
```

The API will be available at `http://localhost:8000`. On first run it seeds the asset list and fetches a full year of price history.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` in your browser.

### Environment variables

Create `backend/.env` to override defaults:

```env
PRICE_REFRESH_MINUTES=5    # how often to refresh current prices
HISTORY_REFRESH_HOURS=24   # how often to refresh historical data
HISTORY_DAYS=365            # days of history to store

# Required for the AI News Analyzer
ANTHROPIC_API_KEY=your_key_here

# Optional — adds Finnhub as a second, more market-focused news source.
# Free tier at https://finnhub.io/register. Refresh works fine without it,
# just using the RSS feeds alone.
FINNHUB_API_KEY=your_key_here
```

## Watchlist

Star any asset — from a table row or a price card, anywhere in the app — to pin it to the **Watchlist** page. Each watched asset gets:

- Its own price chart with independent period filters (1W / 1M / 3M / 1Y) — the header's % change recalculates for whichever period is selected, instead of always showing the daily change
- A feed of the Claude-analyzed news articles that name it among their affected assets, newest first
- A one-click remove, and starring/unstarring is shared live across every page via `WatchlistContext`

## AI News Analyzer

The **News Analyzer** page (under *AI Labs* in the sidebar) pulls financial headlines from four RSS feeds plus Finnhub, filters out articles that aren't genuinely market-relevant, and runs the rest through **Claude Haiku** for structured sentiment analysis.

### How it works

1. RSS feeds are polled from Yahoo Finance, CNBC, BBC Business, and MarketWatch, plus Finnhub's `general` news category (if `FINNHUB_API_KEY` is set) — Finnhub's categorized endpoint stays market-focused where the general RSS feeds often mix in lifestyle/advice content.
2. New articles (not yet in the DB) are deduplicated by URL.
3. Each article is sent to Claude Haiku with a system prompt that includes the full list of tracked assets, so the model only references symbols the dashboard actually displays.
4. Up to 5 Claude calls run in parallel (ThreadPoolExecutor) to keep refresh times short.
5. Articles Claude flags as **not market-relevant** (personal-finance advice columns, lifestyle pieces, etc. — not genuine market/economic/company news) are skipped entirely, not persisted.
6. The rest are stored in the `news_articles` SQLite table and served via the `/api/playground/news` API. A one-time cleanup script, `backend/scripts/cleanup_irrelevant_news.py`, is also available to retroactively remove old irrelevant articles stored before this filter existed (preview-first, `--confirm` to actually delete).

### What Claude returns per article

| Field | Description |
|---|---|
| `is_market_relevant` | Boolean — false for personal-finance/lifestyle content with no real market tie; such articles are dropped before storage |
| `sentiment_label` | `bullish` / `bearish` / `neutral` |
| `sentiment_score` | Float from −1.0 (very bearish) to +1.0 (very bullish) |
| `affected_assets` | Array of `{symbol, name, category, impact, reason}` |
| `reasoning` | 2–3 sentence market-impact explanation |
| `tags` | Short keyword tags e.g. `["Fed", "Tech", "Oil"]` |

### Prompt caching

The large static system prompt (tracked asset list + instructions, ~2 KB) is marked with `cache_control: ephemeral`. Anthropic caches it for 5 minutes, so only the first request in a refresh window pays the full input-token cost — subsequent parallel calls hit the cache and are significantly cheaper.

### UI features

- Sentiment-colored card borders and score badges (green = bullish, red = bearish)
- Visual score bar from −1 to +1
- Expandable **AI Analysis** panel per article with Claude's reasoning and affected asset chips
- **Market Impact Since Release** — below the AI analysis, a chart + % change showing how an affected asset moved in the 1D/1W/1M/3M after the article was published (switchable between assets when an article names more than one)
- Filter tabs (All / Bullish / Bearish / Neutral) and a ticker/name search box
- Stats row showing total, bullish, bearish, and neutral counts

## API Endpoints

All routes are mounted under `/api`.

| Method | Path | Description |
|---|---|---|
| GET | `/api/stocks/` | All tracked stocks (current price) |
| GET | `/api/stocks/{symbol}` | Single stock + 1-year history |
| GET | `/api/crypto/` | All crypto assets |
| GET | `/api/crypto/{symbol}` | Single crypto + history |
| GET | `/api/commodities/` | All commodities |
| GET | `/api/commodities/{symbol}` | Single commodity + history |
| GET | `/api/forex/` | All forex pairs |
| GET | `/api/forex/{symbol}` | Single forex pair + history |
| GET | `/api/indices/` | All market indices |
| GET | `/api/indices/{symbol}` | Single index + history |
| GET | `/api/watchlist/` | All watched assets with their latest price snapshot |
| POST | `/api/watchlist/{symbol}` | Add an asset to the watchlist (idempotent) |
| DELETE | `/api/watchlist/{symbol}` | Remove an asset from the watchlist |
| GET | `/api/watchlist/{symbol}/news` | Analyzed news articles naming this symbol as affected |
| GET | `/api/playground/news` | All stored news articles with AI analysis (optional `limit`) |
| POST | `/api/playground/news/refresh` | Fetch latest RSS + Finnhub articles and run Claude analysis |

Each detail endpoint returns `{ current: {...}, history: [{date, open, high, low, close, volume}] }`.
