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
