"""
CoinGecko free API integration for crypto price data.
Fetches current prices and daily history — replaces yfinance for the crypto category.
"""
import httpx
import logging
import time
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from ..models import Asset, CurrentPrice, PriceHistory
from ..config import ASSETS

logger = logging.getLogger(__name__)

BASE_URL = "https://api.coingecko.com/api/v3"

# symbol → CoinGecko coin ID (e.g. "BTC-USD" → "bitcoin")
COINGECKO_ID_MAP: dict[str, str] = {
    a["symbol"]: a["coingecko_id"]
    for a in ASSETS["crypto"]
}


def _get(path: str, params: dict) -> dict | list | None:
    # Retry once on 429 — wait 65s so the per-minute quota resets
    for attempt in range(2):
        try:
            resp = httpx.get(f"{BASE_URL}{path}", params=params, timeout=15)
            if resp.status_code == 429:
                wait = 65
                logger.warning(f"CoinGecko rate-limited on {path}, waiting {wait}s...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            return resp.json()
        except Exception as e:
            logger.error(f"CoinGecko request failed ({path}): {e}")
            return None
    return None


def refresh_crypto_prices(db: Session) -> None:
    """
    Fetch the latest price snapshot for all crypto assets in a single API call.
    Maps CoinGecko market data → CurrentPrice rows in SQLite.
    """
    crypto_assets = db.query(Asset).filter(Asset.category == "crypto").all()
    if not crypto_assets:
        return

    coin_ids = ",".join(
        COINGECKO_ID_MAP[a.symbol]
        for a in crypto_assets
        if a.symbol in COINGECKO_ID_MAP
    )

    data = _get("/coins/markets", {
        "vs_currency": "usd",
        "ids": coin_ids,
        "order": "market_cap_desc",
        "sparkline": "false",
        "price_change_percentage": "24h",
    })
    if not data:
        return

    by_id = {coin["id"]: coin for coin in data}

    for asset in crypto_assets:
        cg_id = COINGECKO_ID_MAP.get(asset.symbol)
        coin = by_id.get(cg_id)
        if not coin:
            logger.warning(f"No CoinGecko data returned for {asset.symbol} (id={cg_id})")
            continue

        price = coin.get("current_price")
        change = coin.get("price_change_24h")
        change_pct = coin.get("price_change_percentage_24h")
        # CoinGecko doesn't expose yesterday's close directly;
        # derive it from the absolute 24h change: prev_close = price - change
        prev_close = (price - change) if price is not None and change is not None else None

        vals = dict(
            price=price,
            open=None,               # not available from this endpoint
            high=coin.get("high_24h"),
            low=coin.get("low_24h"),
            prev_close=prev_close,
            change=change,
            change_percent=change_pct,
            volume=coin.get("total_volume"),
            market_cap=coin.get("market_cap"),
            updated_at=datetime.now(timezone.utc),
        )

        row = db.query(CurrentPrice).filter(CurrentPrice.asset_id == asset.id).first()
        if row:
            for k, v in vals.items():
                setattr(row, k, v)
        else:
            db.add(CurrentPrice(asset_id=asset.id, **vals))

    db.commit()
    logger.info("Crypto current prices updated via CoinGecko.")


def refresh_crypto_history(db: Session, days: int = 365) -> None:
    """
    Fetch daily close price + volume for each crypto via /coins/{id}/market_chart.
    Stores close in PriceHistory; open/high/low are left null (chart only uses close).
    Commits per coin so a single failure doesn't roll back the others.
    Sleeps 3s between requests to stay under the free-tier limit (~30 req/min).
    """
    crypto_assets = db.query(Asset).filter(Asset.category == "crypto").all()
    logger.info(f"Refreshing crypto history for {len(crypto_assets)} assets ({days} days)...")

    for asset in crypto_assets:
        cg_id = COINGECKO_ID_MAP.get(asset.symbol)
        if not cg_id:
            continue

        data = _get(f"/coins/{cg_id}/market_chart", {
            "vs_currency": "usd",
            "days": days,
            "interval": "daily",
        })
        if not data:
            time.sleep(3)
            continue

        prices = data.get("prices", [])          # [[timestamp_ms, close], ...]
        volumes = data.get("total_volumes", [])  # [[timestamp_ms, volume], ...]
        vol_by_ts = {int(v[0]): v[1] for v in volumes}

        latest_stored = (
            db.query(PriceHistory)
            .filter(PriceHistory.asset_id == asset.id)
            .order_by(PriceHistory.date.desc())
            .first()
        )
        cutoff = latest_stored.date if latest_stored else None

        # CoinGecko's last point uses the current timestamp (not midnight), so
        # normalizing all points to midnight can produce duplicate dates.
        # Use a dict keyed by date so the latest value for each day wins.
        daily: dict[datetime, tuple[int, float]] = {}
        for ts_ms, close in prices:
            dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc).replace(
                tzinfo=None, hour=0, minute=0, second=0, microsecond=0
            )
            daily[dt] = (int(ts_ms), close)  # later timestamp overwrites earlier same-day entry

        inserted = 0
        for dt, (ts_ms, close) in daily.items():
            if cutoff and dt <= cutoff:
                continue
            db.add(PriceHistory(
                asset_id=asset.id,
                date=dt,
                open=None,
                high=None,
                low=None,
                close=close,
                volume=vol_by_ts.get(ts_ms),
            ))
            inserted += 1

        try:
            db.commit()
            logger.info(f"  {asset.symbol}: {inserted} new candles saved.")
        except Exception as e:
            logger.error(f"  {asset.symbol}: commit failed — {e}")
            db.rollback()

        time.sleep(3)  # 3s gap → max 20 req/min, well under the free-tier 30 req/min cap

    logger.info("Crypto history refresh complete.")
