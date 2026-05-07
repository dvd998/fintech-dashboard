# All tracked assets grouped by category.
# yfinance uses these symbols directly to fetch data.

ASSETS = {
    "stocks": [
        {"symbol": "AAPL",  "name": "Apple Inc."},
        {"symbol": "MSFT",  "name": "Microsoft Corp."},
        {"symbol": "GOOGL", "name": "Alphabet Inc."},
        {"symbol": "AMZN",  "name": "Amazon.com Inc."},
        {"symbol": "NVDA",  "name": "NVIDIA Corp."},
        {"symbol": "META",  "name": "Meta Platforms Inc."},
        {"symbol": "TSLA",  "name": "Tesla Inc."},
        {"symbol": "BRK-B", "name": "Berkshire Hathaway"},
        {"symbol": "JPM",   "name": "JPMorgan Chase"},
        {"symbol": "V",     "name": "Visa Inc."},
        {"symbol": "JNJ",   "name": "Johnson & Johnson"},
        {"symbol": "WMT",   "name": "Walmart Inc."},
    ],
    "crypto": [
        {"symbol": "BTC-USD",  "name": "Bitcoin",   "coingecko_id": "bitcoin"},
        {"symbol": "ETH-USD",  "name": "Ethereum",  "coingecko_id": "ethereum"},
        {"symbol": "BNB-USD",  "name": "BNB",       "coingecko_id": "binancecoin"},
        {"symbol": "SOL-USD",  "name": "Solana",    "coingecko_id": "solana"},
        {"symbol": "XRP-USD",  "name": "XRP",       "coingecko_id": "ripple"},
        {"symbol": "ADA-USD",  "name": "Cardano",   "coingecko_id": "cardano"},
        {"symbol": "AVAX-USD", "name": "Avalanche", "coingecko_id": "avalanche-2"},
        {"symbol": "DOGE-USD", "name": "Dogecoin",  "coingecko_id": "dogecoin"},
    ],
    "commodities": [
        {"symbol": "GC=F", "name": "Gold"},
        {"symbol": "SI=F", "name": "Silver"},
        {"symbol": "CL=F", "name": "Crude Oil (WTI)"},
        {"symbol": "NG=F", "name": "Natural Gas"},
        {"symbol": "HG=F", "name": "Copper"},
        {"symbol": "ZW=F", "name": "Wheat"},
        {"symbol": "ZC=F", "name": "Corn"},
    ],
    "forex": [
        {"symbol": "EURUSD=X", "name": "EUR / USD"},
        {"symbol": "GBPUSD=X", "name": "GBP / USD"},
        {"symbol": "USDJPY=X", "name": "USD / JPY"},
        {"symbol": "AUDUSD=X", "name": "AUD / USD"},
        {"symbol": "USDCAD=X", "name": "USD / CAD"},
        {"symbol": "USDCHF=X", "name": "USD / CHF"},
        {"symbol": "USDCNY=X", "name": "USD / CNY"},
    ],
    "indices": [
        {"symbol": "^GSPC", "name": "S&P 500"},
        {"symbol": "^DJI",  "name": "Dow Jones"},
        {"symbol": "^IXIC", "name": "NASDAQ"},
        {"symbol": "^FTSE", "name": "FTSE 100"},
        {"symbol": "^N225", "name": "Nikkei 225"},
        {"symbol": "^GDAXI","name": "DAX"},
        {"symbol": "^HSI",  "name": "Hang Seng"},
    ],
}

# Flat list of all symbols → used by the scheduler for batch fetching
ALL_SYMBOLS = [
    asset["symbol"]
    for assets in ASSETS.values()
    for asset in assets
]
