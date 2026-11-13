"""
Margin trading — leveraged Long / Short positions (CFD-style, isolated margin).

Each position is its own row: the user posts `margin_usd` and picks a leverage L.

    notional = margin × L                     (market exposure, USD)
    units    = notional / (entry_price × fx)  (fx = USD per 1 unit of quote currency)
    dir      = +1 for long, −1 for short
    pnl      = dir × units × (price − entry) × fx_now
    equity   = margin + pnl

Risk rules
----------
* Close-out: when equity falls to CLOSE_OUT_LEVEL (50%) of the posted margin the
  position is force-closed ("liquidated") — the EU retail (ESMA) margin rule.
  The payout is max(equity, 0), so a loss can never exceed the posted margin.
* Leverage is capped per asset class, using ESMA retail limits.
* Optional stop-loss / take-profit levels close the position automatically.

The engine (check_margin_positions) runs after every scheduled price refresh
and whenever the portfolio is loaded. Prices only update every few minutes,
so auto-closes fill at the *observed* price, not exactly at the trigger level —
the same "slippage on a gap" a real broker would give you.
"""
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from ..models import Asset, MarginPosition
from .portfolio import (
    get_or_create_portfolio, live_price_lookup, prev_close, quote_currency, usd_per,
)

# ESMA retail leverage limits per asset class
LEVERAGE_CAPS = {
    "forex":       30,
    "indices":     20,
    "commodities": 10,
    "stocks":       5,
    "crypto":       2,
}

CLOSE_OUT_LEVEL = 0.5   # liquidate when equity <= 50% of margin

SIDES = ("long", "short")


def _dir(side: str) -> int:
    return 1 if side == "long" else -1


def max_leverage(category: str) -> int:
    return LEVERAGE_CAPS.get(category, 1)


# ── Valuation ────────────────────────────────────────────────────────────────

def position_pnl(side: str, units: float, entry: float, price: float | None, fx: float) -> float:
    """USD P&L of a margin position at `price` (0 when there is no price)."""
    if price is None:
        return 0.0
    return _dir(side) * units * (price - entry) * fx


def liquidation_price(side: str, units: float, entry: float, margin: float, fx: float) -> float:
    """Price at which equity hits the close-out level (at the current FX rate)."""
    loss_allowed = margin * (1 - CLOSE_OUT_LEVEL)
    return entry - _dir(side) * loss_allowed / (units * fx)


def value_margin_position(mp: MarginPosition, price: float | None, fx: float) -> dict:
    """P&L, equity, return on margin and liquidation figures for one open position."""
    pnl = position_pnl(mp.side, mp.units, mp.entry_price, price, fx)
    equity = mp.margin_usd + pnl
    liq = liquidation_price(mp.side, mp.units, mp.entry_price, mp.margin_usd, fx)
    # How far price can still move against us before close-out, as % of the current price
    distance = (_dir(mp.side) * (price - liq) / price * 100) if price else None
    return {
        "pnl": pnl,
        "equity": equity,
        "roe_pct": pnl / mp.margin_usd * 100 if mp.margin_usd else 0.0,
        "liquidation_price": liq,
        "liq_distance_pct": distance,
        "notional": mp.units * price * fx if price else mp.margin_usd * mp.leverage,
    }


# ── Validation helpers ───────────────────────────────────────────────────────

def _validate_levels(side: str, price: float, stop_loss: float | None, take_profit: float | None):
    """Stop-loss must be on the losing side of the current price, take-profit on the winning side."""
    if stop_loss is not None:
        if stop_loss <= 0:
            raise HTTPException(status_code=400, detail="Stop-loss must be a positive price.")
        if side == "long" and stop_loss >= price:
            raise HTTPException(status_code=400, detail="For a long, the stop-loss must be below the current price.")
        if side == "short" and stop_loss <= price:
            raise HTTPException(status_code=400, detail="For a short, the stop-loss must be above the current price.")
    if take_profit is not None:
        if take_profit <= 0:
            raise HTTPException(status_code=400, detail="Take-profit must be a positive price.")
        if side == "long" and take_profit <= price:
            raise HTTPException(status_code=400, detail="For a long, the take-profit must be above the current price.")
        if side == "short" and take_profit >= price:
            raise HTTPException(status_code=400, detail="For a short, the take-profit must be below the current price.")


def _get_open(db: Session, position_id: int) -> MarginPosition:
    portfolio = get_or_create_portfolio(db)
    mp = (
        db.query(MarginPosition)
        .filter(MarginPosition.id == position_id, MarginPosition.portfolio_id == portfolio.id)
        .options(joinedload(MarginPosition.asset).joinedload(Asset.current_price))
        .first()
    )
    if not mp:
        raise HTTPException(status_code=404, detail="Margin position not found.")
    if mp.status != "open":
        raise HTTPException(status_code=400, detail="This position is already closed.")
    return mp


# ── Actions ──────────────────────────────────────────────────────────────────

def open_margin_position(db: Session, symbol: str, side: str, leverage: float, margin_usd: float,
                         stop_loss: float | None = None, take_profit: float | None = None) -> MarginPosition:
    side = side.lower()
    if side not in SIDES:
        raise HTTPException(status_code=400, detail="Side must be 'long' or 'short'.")
    if margin_usd is None or margin_usd <= 0:
        raise HTTPException(status_code=400, detail="Margin must be positive.")

    asset = (
        db.query(Asset)
        .filter(Asset.symbol == symbol.upper())
        .options(joinedload(Asset.current_price))
        .first()
    )
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset '{symbol}' not found.")
    price = asset.current_price.price if asset.current_price else None
    if not price:
        raise HTTPException(status_code=503, detail=f"No live price for {asset.symbol} yet.")

    cap = max_leverage(asset.category)
    if leverage is None or leverage < 1 or leverage > cap:
        raise HTTPException(
            status_code=400,
            detail=f"Leverage for {asset.category} must be between 1x and {cap}x.",
        )
    _validate_levels(side, price, stop_loss, take_profit)

    portfolio = get_or_create_portfolio(db)
    if margin_usd > portfolio.cash + 1e-6:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient cash: need ${margin_usd:,.2f} margin, have ${portfolio.cash:,.2f}.",
        )
    margin_usd = min(margin_usd, portfolio.cash)

    fx = usd_per(quote_currency(asset.symbol), live_price_lookup(db))
    units = margin_usd * leverage / (price * fx)

    mp = MarginPosition(
        portfolio_id=portfolio.id, asset_id=asset.id, side=side, leverage=leverage,
        margin_usd=margin_usd, units=units, entry_price=price, entry_fx=fx,
        stop_loss=stop_loss, take_profit=take_profit, status="open",
    )
    portfolio.cash -= margin_usd
    db.add(mp)
    db.commit()
    db.refresh(mp)
    return mp


def _close(db: Session, mp: MarginPosition, price: float, fx: float, reason: str) -> None:
    """Settle a position at `price`: return max(equity, 0) to cash. Caller commits."""
    pnl = position_pnl(mp.side, mp.units, mp.entry_price, price, fx)
    payout = max(mp.margin_usd + pnl, 0.0)
    mp.status = "closed"
    mp.closed_at = datetime.now(timezone.utc)
    mp.close_price = price
    mp.close_fx = fx
    mp.realized_pnl = payout - mp.margin_usd
    mp.close_reason = reason
    mp.portfolio.cash += payout


def close_margin_position(db: Session, position_id: int) -> MarginPosition:
    mp = _get_open(db, position_id)
    price = mp.asset.current_price.price if mp.asset.current_price else None
    if not price:
        raise HTTPException(status_code=503, detail=f"No live price for {mp.asset.symbol} yet.")
    fx = usd_per(quote_currency(mp.asset.symbol), live_price_lookup(db))
    _close(db, mp, price, fx, "manual")
    db.commit()
    db.refresh(mp)
    return mp


def update_sl_tp(db: Session, position_id: int,
                 stop_loss: float | None, take_profit: float | None) -> MarginPosition:
    """Replace both levels (None clears one). Validated against the current price."""
    mp = _get_open(db, position_id)
    price = mp.asset.current_price.price if mp.asset.current_price else None
    if not price:
        raise HTTPException(status_code=503, detail=f"No live price for {mp.asset.symbol} yet.")
    _validate_levels(mp.side, price, stop_loss, take_profit)
    mp.stop_loss = stop_loss
    mp.take_profit = take_profit
    db.commit()
    db.refresh(mp)
    return mp


# ── Auto-close engine ────────────────────────────────────────────────────────

def check_margin_positions(db: Session) -> list[MarginPosition]:
    """
    Close every open position that has hit its close-out level, stop-loss or
    take-profit (checked in that order). Returns the positions it closed.
    """
    open_positions = (
        db.query(MarginPosition)
        .filter(MarginPosition.status == "open")
        .options(joinedload(MarginPosition.asset).joinedload(Asset.current_price),
                 joinedload(MarginPosition.portfolio))
        .all()
    )
    if not open_positions:
        return []

    price_of = live_price_lookup(db)
    closed = []
    for mp in open_positions:
        price = mp.asset.current_price.price if mp.asset.current_price else None
        if not price:
            continue
        try:
            fx = usd_per(quote_currency(mp.asset.symbol), price_of)
        except HTTPException:
            continue

        equity = mp.margin_usd + position_pnl(mp.side, mp.units, mp.entry_price, price, fx)
        is_long = mp.side == "long"
        reason = None
        if equity <= mp.margin_usd * CLOSE_OUT_LEVEL:
            reason = "liquidated"
        elif mp.stop_loss is not None and (price <= mp.stop_loss if is_long else price >= mp.stop_loss):
            reason = "stop_loss"
        elif mp.take_profit is not None and (price >= mp.take_profit if is_long else price <= mp.take_profit):
            reason = "take_profit"

        if reason:
            _close(db, mp, price, fx, reason)
            closed.append(mp)

    if closed:
        db.commit()
    return closed


# ── Serialization for the summary ────────────────────────────────────────────

def summarize_open_positions(db: Session, portfolio_id: int, price_of, today) -> list[dict]:
    """Open margin positions valued at live prices (weights are filled in by the caller)."""
    rows = []
    positions = (
        db.query(MarginPosition)
        .filter(MarginPosition.portfolio_id == portfolio_id, MarginPosition.status == "open")
        .options(joinedload(MarginPosition.asset).joinedload(Asset.current_price))
        .order_by(MarginPosition.opened_at.desc())
        .all()
    )
    for mp in positions:
        asset = mp.asset
        cp = asset.current_price
        price = cp.price if cp else None
        ccy = quote_currency(asset.symbol)
        fx = usd_per(ccy, price_of)
        v = value_margin_position(mp, price, fx)

        # Day P&L: since previous close, or since entry if opened today
        opened_today = mp.opened_at and mp.opened_at.date() >= today
        ref = mp.entry_price if opened_today else prev_close(cp)
        day_pnl = position_pnl(mp.side, mp.units, ref, price, fx) if ref else 0.0

        rows.append({
            "id": mp.id,
            "symbol": asset.symbol, "name": asset.name, "category": asset.category,
            "currency": ccy,
            "side": mp.side,
            "leverage": mp.leverage,
            "max_leverage": max_leverage(asset.category),
            "margin": mp.margin_usd,
            "units": mp.units,
            "notional": v["notional"],
            "entry_price": mp.entry_price,
            "current_price": price,
            "change_percent": cp.change_percent if cp else None,
            "stop_loss": mp.stop_loss,
            "take_profit": mp.take_profit,
            "liquidation_price": v["liquidation_price"],
            "liq_distance_pct": v["liq_distance_pct"],
            "pnl": v["pnl"],
            "roe_pct": v["roe_pct"],
            "equity": max(v["equity"], 0.0),
            "day_pnl": day_pnl,
            "weight": 0.0,
            "exposure_pct": 0.0,
            "opened_at": mp.opened_at,
        })
    return rows
