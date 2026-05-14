# FinTech Dashboard

A real-time financial data dashboard built with FastAPI and React. Tracks stocks, crypto, forex, commodities, and market indices — all in one dark-mode UI.

![Stack](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square) ![Stack](https://img.shields.io/badge/Frontend-React%20%2F%20Vite-61DAFB?style=flat-square) ![Stack](https://img.shields.io/badge/Data-yfinance-blue?style=flat-square) ![Stack](https://img.shields.io/badge/AI-Claude%20Haiku-8B5CF6?style=flat-square)

---

## Features

- **5 asset categories** — Stocks, Crypto, Forex, Commodities, Indices
- **Live price data** refreshed every 5 minutes via [yfinance](https://github.com/ranaroussi/yfinance)
- **Interactive charts** — click any asset to open a price history chart
- **Period filters** — 1W / 1M / 3M / 6M / 1Y with per-period % change badge
- **Currency labels** — correct local currency per asset (USD, EUR, GBP, JPY, HKD)
- **Sortable tables** — sort by price, change, volume, market cap, and more
- SQLite database with 1 year of daily OHLCV history per asset
- **AI News Analyzer** — financial headlines fetched from RSS feeds and analyzed by Claude AI for market sentiment

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI, SQLAlchemy, APScheduler |
| Data | yfinance, CoinGecko, feedparser (RSS) |
| AI | Claude Haiku (Anthropic) |
| Database | SQLite |
| Frontend | React 18, Vite, Recharts, Tailwind CSS |

## Project Structure

```
fintech-dashboard/
├── backend/
│   ├── app/
│   │   ├── routers/        # API endpoints (stocks, crypto, forex, news, …)
│   │   ├── services/       # yfinance + CoinGecko data fetching, news + AI analysis
│   │   ├── models.py       # SQLAlchemy models
│   │   ├── schemas.py      # Pydantic response schemas
│   │   ├── scheduler.py    # Background price refresh jobs
│   │   └── config.py       # Tracked asset symbols
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/          # Stocks, Crypto, Forex, Commodities, Indices, NewsAnalyzer
        ├── components/     # PriceCard, PriceTable, DetailPanel, charts
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
```

## AI News Analyzer

The **News Analyzer** page (under *AI Labs* in the sidebar) pulls financial headlines from four RSS feeds and runs each article through **Claude Haiku** for structured sentiment analysis.

### How it works

1. RSS feeds are polled from Yahoo Finance, CNBC, BBC Business, and MarketWatch.
2. New articles (not yet in the DB) are deduplicated by URL.
3. Each article is sent to Claude Haiku with a system prompt that includes the full list of tracked assets, so the model only references symbols the dashboard actually displays.
4. Up to 5 Claude calls run in parallel (ThreadPoolExecutor) to keep refresh times short.
5. Results are stored in the `news_articles` SQLite table and served via the `/news/` API.

### What Claude returns per article

| Field | Description |
|---|---|
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
- Filter tabs (All / Bullish / Bearish / Neutral) and a ticker/name search box
- Stats row showing total, bullish, bearish, and neutral counts

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/stocks/` | All tracked stocks (current price) |
| GET | `/stocks/{symbol}` | Single stock + 1-year history |
| GET | `/crypto/` | All crypto assets |
| GET | `/crypto/{symbol}` | Single crypto + history |
| GET | `/commodities/` | All commodities |
| GET | `/forex/` | All forex pairs |
| GET | `/indices/` | All market indices |
| GET | `/news/` | All stored news articles with AI analysis |
| POST | `/news/refresh` | Fetch latest RSS articles and run Claude analysis |

Each detail endpoint returns `{ current: {...}, history: [{date, open, high, low, close, volume}] }`.
