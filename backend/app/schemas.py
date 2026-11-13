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
    """
    One line in the trade log. Spot trades: kind="spot", side=buy|sell.
    Margin events: kind="margin", side=long|short, action=open|close.
    """
    id:           str             # "s12" for spot trades, "m7-open" / "m7-close" for margin events
    kind:         str             # spot | margin
    symbol:       str
    name:         str
    category:     str
    side:         str
    action:       Optional[str] = None     # margin only: open | close
    leverage:     Optional[float] = None   # margin only
    close_reason: Optional[str] = None     # margin close only: manual | stop_loss | take_profit | liquidated
    position_id:  Optional[int] = None     # margin only
    units:        float
    price:        float
    currency:     str
    amount_usd:   float           # cash out (buy / margin posted) or cash in (sell / payout)
    realized_pnl: Optional[float]
    executed_at:  datetime


class MarginPositionSchema(BaseModel):
    """An open leveraged Long/Short position valued at the live price."""
    id:                int
    symbol:            str
    name:              str
    category:          str
    currency:          str
    side:              str               # long | short
    leverage:          float
    max_leverage:      int
    margin:            float             # USD posted
    units:             float
    notional:          float             # current exposure, USD
    entry_price:       float
    current_price:     Optional[float]
    change_percent:    Optional[float]
    stop_loss:         Optional[float]
    take_profit:       Optional[float]
    liquidation_price: float
    liq_distance_pct:  Optional[float]   # % the price can still move against you before close-out
    pnl:               float             # USD
    roe_pct:           float             # return on margin
    equity:            float             # margin + pnl (floored at 0)
    day_pnl:           float
    weight:            float             # equity as % of total portfolio value
    exposure_pct:      float             # notional as % of total portfolio value
    opened_at:         datetime


class MarginOpenRequest(BaseModel):
    symbol:      str
    side:        str                     # long | short
    leverage:    float
    margin_usd:  float
    stop_loss:   Optional[float] = None
    take_profit: Optional[float] = None


class MarginUpdateRequest(BaseModel):
    """Replaces both levels; send null to remove one."""
    stop_loss:   Optional[float] = None
    take_profit: Optional[float] = None


class MarginResultSchema(BaseModel):
    message:     str
    position_id: int


class PortfolioSummarySchema(BaseModel):
    name:             str
    starting_cash:    float
    cash:             float
    invested_value:   float     # market value of spot (Invest) positions, USD
    total_value:      float     # cash + invested + margin equity
    cost_basis:       float
    unrealized_pnl:   float
    realized_pnl:     float
    total_pnl:        float     # total_value - starting_cash
    total_pnl_pct:    float
    day_pnl:          float
    day_pnl_pct:      float
    trade_count:      int
    win_rate:         Optional[float]   # % of non-break-even closing trades that were profitable
    created_at:       datetime
    positions:        list[PositionSchema]
    # Margin trading
    margin_positions:   list[MarginPositionSchema] = []
    margin_used:        float = 0       # USD posted across open margin positions
    margin_equity:      float = 0       # margin + unrealized P&L across them
    gross_exposure:     float = 0       # spot value + |notional| of every margin position
    net_exposure:       float = 0       # spot value + long notional − short notional
    effective_leverage: float = 0       # gross exposure ÷ total value


class EquityPointSchema(BaseModel):
    date:      str             # YYYY-MM-DD
    value:     float           # portfolio value, USD
    benchmark: Optional[float] # benchmark rebased to the portfolio's first value


class TradeResultSchema(BaseModel):
    message:     str
    transaction: TransactionSchema
