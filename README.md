# FinTech Dashboard

A real-time financial data dashboard built with FastAPI and React. Tracks stocks, crypto, forex, commodities, and market indices — all in one dark-mode UI.

![Stack](https://img.shields.io/badge/Backend-FastAPI-009688?style=flat-square) ![Stack](https://img.shields.io/badge/Frontend-React%20%2F%20Vite-61DAFB?style=flat-square) ![Stack](https://img.shields.io/badge/Data-yfinance-blue?style=flat-square)

---

## Features

- **5 asset categories** — Stocks, Crypto, Forex, Commodities, Indices
- **Live price data** refreshed every 5 minutes via [yfinance](https://github.com/ranaroussi/yfinance)
- **Interactive charts** — click any asset to open a price history chart
- **Period filters** — 1W / 1M / 3M / 6M / 1Y with per-period % change badge
- **Currency labels** — correct local currency per asset (USD, EUR, GBP, JPY, HKD)
- **Sortable tables** — sort by price, change, volume, market cap, and more
- SQLite database with 1 year of daily OHLCV history per asset

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python, FastAPI, SQLAlchemy, APScheduler |
| Data | yfinance |
| Database | SQLite |
| Frontend | React 18, Vite, Recharts, Tailwind CSS |

## Project Structure

```
fintech-dashboard/
├── backend/
│   ├── app/
│   │   ├── routers/        # API endpoints (stocks, crypto, forex, …)
│   │   ├── services/       # yfinance data fetching logic
│   │   ├── models.py       # SQLAlchemy models
│   │   ├── schemas.py      # Pydantic response schemas
│   │   ├── scheduler.py    # Background price refresh jobs
│   │   └── config.py       # Tracked asset symbols
│   └── requirements.txt
└── frontend/
    └── src/
        ├── pages/          # Stocks, Crypto, Forex, Commodities, Indices
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
```

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

Each detail endpoint returns `{ current: {...}, history: [{date, open, high, low, close, volume}] }`.
