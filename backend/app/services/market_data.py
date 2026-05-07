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

    # yf.download with group_by='ticker' is the fastest way to get many quotes at once
    try:
        # fast_info gives us the latest price without downloading full history
        for asset in assets:
            try:
                ticker = yf.Ticker(asset.symbol)
                fi = ticker.fast_info  # lightweight — just current price data

                price          = getattr(fi, "last_price", None)
                prev_close     = getattr(fi, "previous_close", None)
                open_          = getattr(fi, "open", None)
                high           = getattr(fi, "day_high", None)
                low            = getattr(fi, "day_low", None)
                volume         = getattr(fi, "three_month_average_volume", None)
                market_cap     = getattr(fi, "market_cap", None)

                change         = (price - prev_close) if price and prev_close else None
                change_percent = (change / prev_close * 100) if change and prev_close else None

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

            # Find the latest date already stored so we only insert new rows
            latest_stored = (
                db.query(PriceHistory)
                .filter(PriceHistory.asset_id == asset.id)
                .order_by(PriceHistory.date.desc())
                .first()
            )
            cutoff = latest_stored.date if latest_stored else None

            for ts, row in hist.iterrows():
                # ts is a pandas Timestamp — convert to plain datetime
                dt = ts.to_pydatetime().replace(tzinfo=None)

                # Skip rows we already have
                if cutoff and dt <= cutoff:
                    continue

                db.add(PriceHistory(
                    asset_id=asset.id,
                    date=dt,
                    open=row.get("Open"),
                    high=row.get("High"),
                    low=row.get("Low"),
                    close=row.get("Close"),
                    volume=row.get("Volume"),
                ))

        except Exception as e:
            logger.warning(f"Failed to fetch history for {asset.symbol}: {e}")

    try:
        db.commit()
        logger.info("History updated.")
    except Exception as e:
        logger.error(f"History commit failed: {e}")
        db.rollback()
