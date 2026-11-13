"""
Pydantic schemas define the shape of data that the API sends to the frontend.
They are separate from SQLAlchemy models — models talk to the DB, schemas talk to the client.
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class CurrentPriceSchema(BaseModel):
    symbol:         str
    name:           str
    category:       str
    price:          Optional[float]
    open:           Optional[float]
    high:           Optional[float]
    low:            Optional[float]
    prev_close:     Optional[float]
    change:         Optional[float]
    change_percent: Optional[float]
    volume:         Optional[float]
    market_cap:     Optional[float]
    updated_at:     Optional[datetime]

    # Tell Pydantic it can read attributes from SQLAlchemy ORM objects directly
    model_config = {"from_attributes": True}


class HistoryPointSchema(BaseModel):
    date:   datetime
    open:   Optional[float]
    high:   Optional[float]
    low:    Optional[float]
    close:  Optional[float]
    volume: Optional[float]

    model_config = {"from_attributes": True}


class AssetDetailSchema(BaseModel):
    """Single asset with its full price history — used for the detail/chart view."""
    symbol:   str
    name:     str
    category: str
    current:  Optional[CurrentPriceSchema]
    history:  list[HistoryPointSchema]

    model_config = {"from_attributes": True}


# ── AI Playground — News Analyzer ───────────────────────────────────────────

class AffectedAssetSchema(BaseModel):
    """One asset that Claude identified as likely affected by a news article."""
    symbol:   str
    name:     str
    category: str
    impact:   str   # positive | negative | neutral
    reason:   str   # one-sentence explanation


class NewsArticleSchema(BaseModel):
    """A news article with its Claude-generated sentiment analysis."""
    id:              int
    url:             str
    title:           str
    source:          Optional[str]
    published_at:    Optional[datetime]
    summary:         Optional[str]
    fetched_at:      datetime
    sentiment_label: Optional[str]         # bullish | bearish | neutral
    sentiment_score: Optional[float]       # -1.0 to +1.0
    affected_assets: list[AffectedAssetSchema] = []
    reasoning:       Optional[str]
    tags:            list[str] = []
    analyzed_at:     Optional[datetime]


class NewsRefreshResponse(BaseModel):
    """Response from the news refresh endpoint."""
    new_articles: int
    message:      str


# ── Watchlist ────────────────────────────────────────────────────────────────

class WatchlistItemSchema(BaseModel):
    """A watched asset with its latest price snapshot."""
    symbol:         str
    name:           str
    category:       str
    price:          Optional[float]
    open:           Optional[float]
    high:           Optional[float]
    low:            Optional[float]
    prev_close:     Optional[float]
    change:         Optional[float]
    change_percent: Optional[float]
    volume:         Optional[float]
    market_cap:     Optional[float]
    updated_at:     Optional[datetime]
    added_at:       datetime

    model_config = {"from_attributes": True}


# ── Portfolio simulator ─────────────────────────────────────────────────────

class TradeRequest(BaseModel):
    """
    Buy or sell at the current market price.
    Give exactly one of amount_usd (how many dollars to trade) or units.
    """
    symbol:     str
    side:       str                     # buy | sell
    amount_usd: Optional[float] = None
    units:      Optional[float] = None


class ResetRequest(BaseModel):
    starting_cash: float = 100_000


class PositionSchema(BaseModel):
    symbol:          str
    name:            str
    category:        str
    currency:        str                # quote currency of the instrument
    units:           float
    avg_price:       float              # quote currency
    current_price:   Optional[float]    # quote currency
    change_percent:  Optional[float]    # today's move of the instrument
    cost_basis:      float              # USD
    market_value:    float              # USD
    unrealized_pnl:  float              # USD
    unrealized_pct:  float
    day_pnl:         float              # USD, approximate move since previous close
    weight:          float              # % of total portfolio value
    opened_at:       datetime


class TransactionSchema(BaseModel):
    id:           int
    symbol:       str
    name:         str
    category:     str
    side:         str
    units:        float
    price:        float
    currency:     str
    amount_usd:   float
    realized_pnl: Optional[float]
    executed_at:  datetime


class PortfolioSummarySchema(BaseModel):
    name:             str
    starting_cash:    float
    cash:             float
    invested_value:   float     # market value of all positions, USD
    total_value:      float     # cash + invested
    cost_basis:       float
    unrealized_pnl:   float
    realized_pnl:     float
    total_pnl:        float     # total_value - starting_cash
    total_pnl_pct:    float
    day_pnl:          float
    day_pnl_pct:      float
    trade_count:      int
    win_rate:         Optional[float]   # % of non-break-even sells that were profitable
    created_at:       datetime
    positions:        list[PositionSchema]


class EquityPointSchema(BaseModel):
    date:      str             # YYYY-MM-DD
    value:     float           # portfolio value, USD
    benchmark: Optional[float] # benchmark rebased to the portfolio's first value


class TradeResultSchema(BaseModel):
    message:     str
    transaction: TransactionSchema
