"""
Background scheduler — runs data refresh jobs on a timer so the API always
serves cached data from SQLite instead of hitting yfinance on every request.
"""
import logging
import os
from apscheduler.schedulers.background import BackgroundScheduler
from .database import SessionLocal
from .services.market_data import refresh_current_prices, refresh_history, seed_assets

logger = logging.getLogger(__name__)

# Read config from .env (already loaded by main.py via python-dotenv)
PRICE_REFRESH_MINUTES = int(os.getenv("PRICE_REFRESH_MINUTES", "5"))
HISTORY_REFRESH_HOURS = int(os.getenv("HISTORY_REFRESH_HOURS", "24"))
HISTORY_DAYS          = int(os.getenv("HISTORY_DAYS", "365"))


def _run_price_refresh():
    """Wrapper that creates its own DB session — scheduler runs in a separate thread."""
    db = SessionLocal()
    try:
        refresh_current_prices(db)
    finally:
        db.close()


def _run_history_refresh():
    db = SessionLocal()
    try:
        refresh_history(db, days=HISTORY_DAYS)
    finally:
        db.close()


def _initial_load():
    """Called once on startup: seed assets, then fetch prices + history."""
    db = SessionLocal()
    try:
        seed_assets(db)
    finally:
        db.close()

    logger.info("Running initial price fetch...")
    _run_price_refresh()

    logger.info("Running initial history fetch (this may take a minute)...")
    _run_history_refresh()


def start_scheduler():
    """
    Start the background scheduler and trigger an immediate data load.
    FastAPI calls this from its lifespan startup hook.
    """
    scheduler = BackgroundScheduler()

    # Refresh current prices every N minutes
    scheduler.add_job(
        _run_price_refresh,
        trigger="interval",
        minutes=PRICE_REFRESH_MINUTES,
        id="price_refresh",
    )

    # Refresh history once per day
    scheduler.add_job(
        _run_history_refresh,
        trigger="interval",
        hours=HISTORY_REFRESH_HOURS,
        id="history_refresh",
    )

    scheduler.start()
    logger.info(f"Scheduler started — prices every {PRICE_REFRESH_MINUTES}m, history every {HISTORY_REFRESH_HOURS}h.")

    # Do the first load synchronously so data is ready before we serve requests.
    # Runs in the same startup thread — FastAPI won't accept connections until this finishes.
    _initial_load()
