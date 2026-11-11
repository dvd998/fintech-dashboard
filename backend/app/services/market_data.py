"""
All yfinance interaction lives here.
The rest of the app never imports yfinance directly — only this module does.
"""
import yfinance as yf
import logging
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from ..models import Asset, CurrentPrice, PriceHistory
from ..config import ASSETS

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Asset seeding — run once on startup to populate the assets table
# ---------------------------------------------------------------------------

def seed_assets(db: Session) -> None:
    """Insert all configured assets into the DB if they don't exist yet."""
    for category, assets in ASSETS.items():
        for asset_def in assets:
            exists = db.query(Asset).filter(Asset.symbol == asset_def["symbol"]).first()
            if not exists:
                db.add(Asset(
                    symbol=asset_def["symbol"],
                    name=asset_def["name"],
                    category=category,
                ))
    db.commit()
    logger.info("Assets seeded.")


# ---------------------------------------------------------------------------
# Current prices
# ---------------------------------------------------------------------------

def refresh_current_prices(db: Session) -> None:
    """
    Fetch the latest price snapshot for non-crypto assets using yfinance.
    Crypto is handled separately by coingecko.refresh_crypto_prices.
    """
    assets = db.query(Asset).filter(Asset.category != "crypto").all()
    if not assets:
        return

    symbols = [a.symbol for a in assets]
    logger.info(f"Refreshing current prices for {len(symbols)} symbols...")

    # One batched download of the last few daily candles for every symbol.
    # The last candle is today's (live, while the market is open) and the one
    # before it is the previous session — that's where price/prev_close come from.
    # fast_info.previous_close is NOT used: it returns stale/wrong values for
    # many tickers (e.g. AMZN showing +6% on a day it fell 1.4%).
    try:
        batch = yf.download(
            symbols, period="10d", interval="1d", group_by="ticker",
            auto_adjust=True, progress=False, threads=True,
        )
    except Exception as e:
        logger.error(f"refresh_current_prices download failed: {e}")
        return

    try:
        for asset in assets:
            try:
                # Batched frames share one date index across all tickers, so drop
                # the empty rows for days this particular market didn't trade
                candles = batch[asset.symbol].dropna(subset=["Close"])
                if len(candles) < 2:
                    logger.warning(f"Not enough recent candles for {asset.symbol}")
                    continue
                last, prev = candles.iloc[-1], candles.iloc[-2]

                price          = float(last["Close"])
                prev_close     = float(prev["Close"])
                open_          = float(last["Open"])
                high           = float(last["High"])
                low            = float(last["Low"])
                volume         = float(last["Volume"])
                # Only stocks have a market cap; fast_info is fine for this field
                market_cap     = (
                    getattr(yf.Ticker(asset.symbol).fast_info, "market_cap", None)
                    if asset.category == "stocks" else None
                )

                change         = price - prev_close
                change_percent = (change / prev_close * 100) if prev_close else None

                # Upsert: update if row exists, insert if not
                row = db.query(CurrentPrice).filter(CurrentPrice.asset_id == asset.id).first()
                if row:
                    row.price          = price
                    row.open           = open_
                    row.high           = high
                    row.low            = low
                    row.prev_close     = prev_close
                    row.change         = change
                    row.change_percent = change_percent
                    row.volume         = volume
                    row.market_cap     = market_cap
                    row.updated_at     = datetime.now(timezone.utc)
                else:
                    db.add(CurrentPrice(
                        asset_id=asset.id,
                        price=price,
                        open=open_,
                        high=high,
                        low=low,
                        prev_close=prev_close,
                        change=change,
                        change_percent=change_percent,
                        volume=volume,
                        market_cap=market_cap,
                    ))
            except Exception as e:
                logger.warning(f"Failed to fetch current price for {asset.symbol}: {e}")

        db.commit()
        logger.info("Current prices updated.")
    except Exception as e:
        logger.error(f"refresh_current_prices failed: {e}")
        db.rollback()


# ---------------------------------------------------------------------------
# Historical OHLCV data
# ---------------------------------------------------------------------------

# Candles this many days before the latest stored one are re-written on every
# refresh, so a candle saved mid-session gets corrected to the day's final close.
OVERLAP_DAYS = 3


def recent_candles(db: Session, asset_id: int) -> tuple[datetime | None, dict]:
    """
    Return (cutoff, rows) for an incremental history refresh:
    candles dated before cutoff are final and can be skipped; rows maps
    date → stored PriceHistory for the overlap window, to be updated in place.
    cutoff is None when the asset has no history yet (insert everything).
    """
    latest = (
        db.query(PriceHistory.date)
        .filter(PriceHistory.asset_id == asset_id)
        .order_by(PriceHistory.date.desc())
        .first()
    )
    if not latest:
        return None, {}
    cutoff = latest[0] - timedelta(days=OVERLAP_DAYS)
    rows = (
        db.query(PriceHistory)
        .filter(PriceHistory.asset_id == asset_id, PriceHistory.date >= cutoff)
        .all()
    )
    return cutoff, {r.date: r for r in rows}


def upsert_candle(db: Session, asset_id: int, existing: dict, dt: datetime, **vals) -> None:
    """Update the stored candle for dt if there is one, otherwise insert a new row."""
    row = existing.get(dt)
    if row:
        for k, v in vals.items():
            setattr(row, k, v)
    else:
        db.add(PriceHistory(asset_id=asset_id, date=dt, **vals))

def refresh_history(db: Session, days: int = 365) -> None:
    """
    Fetch daily OHLCV history for non-crypto assets using yfinance.
    Crypto history is handled separately by coingecko.refresh_crypto_history.
    """
    assets = db.query(Asset).filter(Asset.category != "crypto").all()
    logger.info(f"Refreshing history for {len(assets)} assets ({days} days)...")

    period = f"{days}d"

    for asset in assets:
        try:
            ticker = yf.Ticker(asset.symbol)
            hist   = ticker.history(period=period, interval="1d")

            if hist.empty:
                logger.warning(f"No history returned for {asset.symbol}")
                continue

            # Only touch new candles plus the last few stored ones (see OVERLAP_DAYS)
            cutoff, existing = recent_candles(db, asset.id)

            for ts, row in hist.iterrows():
                # ts is a pandas Timestamp — convert to plain datetime
                dt = ts.to_pydatetime().replace(tzinfo=None)

                # Older candles are final — skip them
                if cutoff and dt < cutoff:
                    continue

                upsert_candle(
                    db, asset.id, existing, dt,
                    open=row.get("Open"),
                    high=row.get("High"),
                    low=row.get("Low"),
                    close=row.get("Close"),
                    volume=row.get("Volume"),
                )

        except Exception as e:
            logger.warning(f"Failed to fetch history for {asset.symbol}: {e}")

    try:
        db.commit()
        logger.info("History updated.")
    except Exception as e:
        logger.error(f"History commit failed: {e}")
        db.rollback()
