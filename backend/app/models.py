from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, UniqueConstraint, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from .database import Base


class Asset(Base):
    """One row per tracked instrument (e.g. AAPL, BTC-USD, GC=F)."""
    __tablename__ = "assets"

    id       = Column(Integer, primary_key=True, index=True)
    symbol   = Column(String, unique=True, index=True, nullable=False)
    name     = Column(String, nullable=False)
    category = Column(String, nullable=False)  # stocks | crypto | commodities | forex | indices

    # Relationships — one asset has one current price row and many history rows
    current_price = relationship("CurrentPrice", back_populates="asset", uselist=False)
    history       = relationship("PriceHistory",  back_populates="asset")


class CurrentPrice(Base):
    """Latest snapshot for each asset — refreshed every few minutes by the scheduler."""
    __tablename__ = "current_prices"

    id             = Column(Integer, primary_key=True, index=True)
    asset_id       = Column(Integer, ForeignKey("assets.id"), unique=True, nullable=False)
    price          = Column(Float)
    open           = Column(Float)
    high           = Column(Float)
    low            = Column(Float)
    prev_close     = Column(Float)
    change         = Column(Float)   # price - prev_close
    change_percent = Column(Float)   # percentage change
    volume         = Column(Float, nullable=True)
    market_cap     = Column(Float, nullable=True)
    updated_at     = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    asset = relationship("Asset", back_populates="current_price")


class PriceHistory(Base):
    """Daily OHLCV candles — used to draw price charts."""
    __tablename__ = "price_history"

    id       = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), nullable=False)
    date     = Column(DateTime, nullable=False)
    open     = Column(Float)
    high     = Column(Float)
    low      = Column(Float)
    close    = Column(Float)
    volume   = Column(Float, nullable=True)

    asset = relationship("Asset", back_populates="history")

    # Prevent duplicate candles for the same asset+date
    __table_args__ = (UniqueConstraint("asset_id", "date", name="uq_asset_date"),)


class NewsArticle(Base):
    """One row per fetched news article — analysis fields filled by Claude after fetch."""
    __tablename__ = "news_articles"

    id           = Column(Integer, primary_key=True, index=True)
    url          = Column(String, unique=True, index=True, nullable=False)
    title        = Column(String, nullable=False)
    source       = Column(String, nullable=True)
    published_at = Column(DateTime, nullable=True)
    summary      = Column(Text, nullable=True)
    fetched_at   = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    # Claude analysis results (null when analysis failed or not yet run)
    sentiment_label  = Column(String, nullable=True)   # bullish | bearish | neutral
    sentiment_score  = Column(Float, nullable=True)    # -1.0 to +1.0
    affected_assets  = Column(Text, nullable=True)     # JSON array string
    reasoning        = Column(Text, nullable=True)
    tags             = Column(Text, nullable=True)     # JSON array string
    analyzed_at      = Column(DateTime, nullable=True)


class WatchlistItem(Base):
    """One row per asset the user has starred onto their personal watchlist."""
    __tablename__ = "watchlist_items"

    id       = Column(Integer, primary_key=True, index=True)
    asset_id = Column(Integer, ForeignKey("assets.id"), unique=True, nullable=False)
    added_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    asset = relationship("Asset")


# ── Portfolio simulator ──────────────────────────────────────────────────────

class Portfolio(Base):
    """
    A paper-trading account. The app currently uses a single portfolio (id=1),
    but the schema supports several so we can add multi-portfolio later.
    """
    __tablename__ = "portfolios"

    id            = Column(Integer, primary_key=True, index=True)
    name          = Column(String, nullable=False, default="Main Portfolio")
    starting_cash = Column(Float, nullable=False)          # USD the account was funded with
    cash          = Column(Float, nullable=False)          # USD currently uninvested
    created_at    = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    positions    = relationship("Position",    back_populates="portfolio", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="portfolio", cascade="all, delete-orphan")


class Position(Base):
    """An open holding — one row per (portfolio, asset). Removed when fully sold."""
    __tablename__ = "positions"

    id             = Column(Integer, primary_key=True, index=True)
    portfolio_id   = Column(Integer, ForeignKey("portfolios.id"), nullable=False)
    asset_id       = Column(Integer, ForeignKey("assets.id"), nullable=False)
    units          = Column(Float, nullable=False)         # fractional units allowed
    avg_price      = Column(Float, nullable=False)         # average entry, in the asset's quote currency
    cost_basis_usd = Column(Float, nullable=False)         # USD paid for the units still held
    opened_at      = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    portfolio = relationship("Portfolio", back_populates="positions")
    asset     = relationship("Asset")

    __table_args__ = (UniqueConstraint("portfolio_id", "asset_id", name="uq_portfolio_asset"),)


class Transaction(Base):
    """Immutable trade log — every buy/sell ever executed in a portfolio."""
    __tablename__ = "transactions"

    id           = Column(Integer, primary_key=True, index=True)
    portfolio_id = Column(Integer, ForeignKey("portfolios.id"), nullable=False)
    asset_id     = Column(Integer, ForeignKey("assets.id"), nullable=False)
    side         = Column(String, nullable=False)           # buy | sell
    units        = Column(Float, nullable=False)
    price        = Column(Float, nullable=False)            # execution price, quote currency
    fx_rate      = Column(Float, nullable=False, default=1) # USD per 1 unit of quote currency at execution
    amount_usd   = Column(Float, nullable=False)            # cash out (buy) / cash in (sell)
    realized_pnl = Column(Float, nullable=True)             # USD, sells only
    executed_at  = Column(DateTime, default=lambda: datetime.now(timezone.utc))

    portfolio = relationship("Portfolio", back_populates="transactions")
    asset     = relationship("Asset")
