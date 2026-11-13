"""
Portfolio simulator — paper trading at live prices.

Valuation model
---------------
Every instrument is priced in its *quote currency* (USD for US stocks/crypto/
commodities, GBP for the FTSE, JPY for USD/JPY, …). The account itself is in USD.

For each position we store:
    units, avg_price (quote ccy), cost_basis_usd (USD actually paid)

and value it as:
    market_value_usd = cost_basis_usd + units * (price_now - avg_price) * fx_now

where fx_now = USD per 1 unit of quote currency. For USD-quoted assets this is
simply units * price_now. For foreign-quoted assets the price *move* is
converted to USD at today's rate (a currency-hedged position) — so buying
$10k of the Nikkei or of USD/JPY really ties up $10k of cash, and the P&L
tracks the instrument, not an accidental currency bet on the principal.
"""
from bisect import bisect_right
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy.orm import Session, joinedload

from ..models import Asset, CurrentPrice, Portfolio, Position, PriceHistory, Transaction

DEFAULT_STARTING_CASH = 100_000.0
DEFAULT_PORTFOLIO_ID  = 1
BENCHMARK_SYMBOL      = "^GSPC"

# Indices trade in local currencies (mirrors DetailPanel.jsx on the frontend)
INDEX_CURRENCIES = {
    "^FTSE": "GBP", "^N225": "JPY", "^GDAXI": "EUR", "^HSI": "HKD",
}

# Currencies we don't track a USD pair for. HKD is pegged to USD in a
# 7.75–7.85 band, so a constant is accurate to well under 1%.
FALLBACK_USD_PER = {"HKD": 1 / 7.8}

# Residual position smaller than this (in USD) after a sell is treated as fully closed
DUST_USD = 0.01


# ── Currency helpers ─────────────────────────────────────────────────────────

def quote_currency(symbol: str) -> str:
    """Currency an instrument's price is quoted in."""
    if symbol in INDEX_CURRENCIES:
        return INDEX_CURRENCIES[symbol]
    if symbol.endswith("=X"):                   # EURUSD=X → USD, USDJPY=X → JPY
        return symbol[:-2][-3:]
    return "USD"


def fx_pair_symbols(currencies: set[str]) -> set[str]:
    """Forex symbols that might be needed to convert these currencies to USD."""
    out = set()
    for ccy in currencies - {"USD"}:
        out.add(f"{ccy}USD=X")
        out.add(f"USD{ccy}=X")
    return out


def usd_per(ccy: str, price_of) -> float:
    """
    USD value of 1 unit of `ccy`. `price_of(symbol)` returns a price or None —
    it's a callback so the same logic works for live prices and history.
    """
    if ccy == "USD":
        return 1.0
    direct = price_of(f"{ccy}USD=X")            # e.g. EURUSD = USD per EUR
    if direct:
        return direct
    inverse = price_of(f"USD{ccy}=X")           # e.g. USDJPY = JPY per USD
    if inverse:
        return 1.0 / inverse
    if ccy in FALLBACK_USD_PER:
        return FALLBACK_USD_PER[ccy]
    raise HTTPException(status_code=503, detail=f"No FX rate available for {ccy}.")


def live_price_lookup(db: Session):
    """Return a symbol → current price callback backed by one DB query."""
    rows = (
        db.query(Asset.symbol, CurrentPrice.price)
        .join(CurrentPrice, CurrentPrice.asset_id == Asset.id)
        .all()
    )
    prices = {sym: p for sym, p in rows if p}
    return prices.get


def position_value(pos_units: float, avg_price: float, cost_usd: float,
                   price: float | None, fx: float) -> float:
    """USD market value of a position (see module docstring)."""
    if price is None:
        return cost_usd                          # no price yet → carry at cost
    return cost_usd + pos_units * (price - avg_price) * fx


# ── Portfolio access ─────────────────────────────────────────────────────────

def get_or_create_portfolio(db: Session) -> Portfolio:
    portfolio = db.get(Portfolio, DEFAULT_PORTFOLIO_ID)
    if not portfolio:
        portfolio = Portfolio(
            id=DEFAULT_PORTFOLIO_ID,
            name="Main Portfolio",
            starting_cash=DEFAULT_STARTING_CASH,
            cash=DEFAULT_STARTING_CASH,
        )
        db.add(portfolio)
        db.commit()
        db.refresh(portfolio)
    return portfolio


def reset_portfolio(db: Session, starting_cash: float) -> Portfolio:
    """Wipe all positions and trades and re-fund the account."""
    if starting_cash <= 0 or starting_cash > 1e9:
        raise HTTPException(status_code=400, detail="Starting cash must be between $1 and $1B.")
    portfolio = get_or_create_portfolio(db)
    db.query(Position).filter(Position.portfolio_id == portfolio.id).delete()
    db.query(Transaction).filter(Transaction.portfolio_id == portfolio.id).delete()
    portfolio.starting_cash = starting_cash
    portfolio.cash = starting_cash
    portfolio.created_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(portfolio)
    return portfolio


# ── Summary ──────────────────────────────────────────────────────────────────

def _prev_close(cp: CurrentPrice | None) -> float | None:
    """Previous close, derived from change_percent when prev_close isn't stored."""
    if not cp or cp.price is None:
        return None
    if cp.prev_close:
        return cp.prev_close
    if cp.change_percent is not None:
        return cp.price / (1 + cp.change_percent / 100)
    return None


def build_summary(db: Session) -> dict:
    portfolio = get_or_create_portfolio(db)
    price_of = live_price_lookup(db)

    positions = (
        db.query(Position)
        .filter(Position.portfolio_id == portfolio.id)
        .options(joinedload(Position.asset).joinedload(Asset.current_price))
        .all()
    )

    today = datetime.now(timezone.utc).date()
    rows = []
    for pos in positions:
        asset = pos.asset
        cp = asset.current_price
        price = cp.price if cp else None
        ccy = quote_currency(asset.symbol)
        fx = usd_per(ccy, price_of)
        value = position_value(pos.units, pos.avg_price, pos.cost_basis_usd, price, fx)

        # Day P&L: move since previous close, or since entry if opened today
        opened_today = pos.opened_at and pos.opened_at.date() >= today
        ref = pos.avg_price if opened_today else _prev_close(cp)
        day_pnl = pos.units * (price - ref) * fx if (price is not None and ref) else 0.0

        rows.append({
            "symbol": asset.symbol, "name": asset.name, "category": asset.category,
            "currency": ccy,
            "units": pos.units,
            "avg_price": pos.avg_price,
            "current_price": price,
            "change_percent": cp.change_percent if cp else None,
            "cost_basis": pos.cost_basis_usd,
            "market_value": value,
            "unrealized_pnl": value - pos.cost_basis_usd,
            "unrealized_pct": ((value / pos.cost_basis_usd) - 1) * 100 if pos.cost_basis_usd else 0.0,
            "day_pnl": day_pnl,
            "weight": 0.0,          # filled in below once the total is known
            "opened_at": pos.opened_at,
        })

    invested = sum(r["market_value"] for r in rows)
    total = portfolio.cash + invested
    for r in rows:
        r["weight"] = (r["market_value"] / total * 100) if total else 0.0
    rows.sort(key=lambda r: r["market_value"], reverse=True)

    sells = (
        db.query(Transaction.realized_pnl)
        .filter(Transaction.portfolio_id == portfolio.id, Transaction.side == "sell")
        .all()
    )
    realized = sum(s[0] or 0 for s in sells)
    # Break-even sells (price didn't move) count as neither a win nor a loss
    decided = [s[0] for s in sells if abs(s[0] or 0) >= 0.01]
    wins = sum(1 for p in decided if p > 0)
    trade_count = db.query(Transaction).filter(Transaction.portfolio_id == portfolio.id).count()

    cost_basis = sum(r["cost_basis"] for r in rows)
    day_pnl = sum(r["day_pnl"] for r in rows)
    start_of_day = total - day_pnl

    return {
        "name": portfolio.name,
        "starting_cash": portfolio.starting_cash,
        "cash": portfolio.cash,
        "invested_value": invested,
        "total_value": total,
        "cost_basis": cost_basis,
        "unrealized_pnl": invested - cost_basis,
        "realized_pnl": realized,
        "total_pnl": total - portfolio.starting_cash,
        "total_pnl_pct": (total / portfolio.starting_cash - 1) * 100,
        "day_pnl": day_pnl,
        "day_pnl_pct": (day_pnl / start_of_day * 100) if start_of_day else 0.0,
        "trade_count": trade_count,
        "win_rate": (wins / len(decided) * 100) if decided else None,
        "created_at": portfolio.created_at,
        "positions": rows,
    }


# ── Trading ──────────────────────────────────────────────────────────────────

def serialize_transaction(tx: Transaction) -> dict:
    return {
        "id": tx.id,
        "symbol": tx.asset.symbol, "name": tx.asset.name, "category": tx.asset.category,
        "side": tx.side, "units": tx.units, "price": tx.price,
        "currency": quote_currency(tx.asset.symbol),
        "amount_usd": tx.amount_usd, "realized_pnl": tx.realized_pnl,
        "executed_at": tx.executed_at,
    }


def execute_trade(db: Session, symbol: str, side: str,
                  amount_usd: float | None, units: float | None) -> Transaction:
    side = side.lower()
    if side not in ("buy", "sell"):
        raise HTTPException(status_code=400, detail="Side must be 'buy' or 'sell'.")
    if (amount_usd is None) == (units is None):
        raise HTTPException(status_code=400, detail="Provide exactly one of amount_usd or units.")
    if (amount_usd is not None and amount_usd <= 0) or (units is not None and units <= 0):
        raise HTTPException(status_code=400, detail="Trade size must be positive.")

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

    portfolio = get_or_create_portfolio(db)
    fx = usd_per(quote_currency(asset.symbol), live_price_lookup(db))
    pos = (
        db.query(Position)
        .filter(Position.portfolio_id == portfolio.id, Position.asset_id == asset.id)
        .first()
    )

    if side == "buy":
        if units is not None:
            amount_usd = units * price * fx
        units = amount_usd / (price * fx)
        # Allow a hair of float slack so "buy with all cash" never fails on rounding
        if amount_usd > portfolio.cash + 1e-6:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient cash: need ${amount_usd:,.2f}, have ${portfolio.cash:,.2f}.",
            )
        amount_usd = min(amount_usd, portfolio.cash)

        if pos:
            pos.avg_price = (pos.units * pos.avg_price + units * price) / (pos.units + units)
            pos.units += units
            pos.cost_basis_usd += amount_usd
        else:
            db.add(Position(
                portfolio_id=portfolio.id, asset_id=asset.id,
                units=units, avg_price=price, cost_basis_usd=amount_usd,
            ))
        portfolio.cash -= amount_usd
        realized = None

    else:  # sell
        if not pos:
            raise HTTPException(status_code=400, detail=f"You don't hold any {asset.symbol}.")
        value = position_value(pos.units, pos.avg_price, pos.cost_basis_usd, price, fx)
        if value <= 0:
            raise HTTPException(status_code=400, detail="Position has no market value to sell.")

        if amount_usd is not None:
            units = pos.units * amount_usd / value
        # Selling slightly more than held (rounding from the UI) just closes the position
        if units > pos.units * (1 + 1e-9):
            raise HTTPException(
                status_code=400,
                detail=f"You only hold {pos.units:.6g} units of {asset.symbol}.",
            )
        units = min(units, pos.units)

        fraction = units / pos.units
        amount_usd = value * fraction
        cost_released = pos.cost_basis_usd * fraction
        realized = amount_usd - cost_released

        remaining_value = value - amount_usd
        if remaining_value < DUST_USD:
            # Close out completely — sweep any dust into this trade
            units = pos.units
            amount_usd = value
            realized = value - pos.cost_basis_usd
            db.delete(pos)
        else:
            pos.units -= units
            pos.cost_basis_usd -= cost_released
        portfolio.cash += amount_usd

    tx = Transaction(
        portfolio_id=portfolio.id, asset_id=asset.id, side=side,
        units=units, price=price, fx_rate=fx,
        amount_usd=amount_usd, realized_pnl=realized,
    )
    db.add(tx)
    db.commit()
    db.refresh(tx)
    return tx


# ── Equity curve ─────────────────────────────────────────────────────────────

class _CloseBook:
    """Daily closes for a set of assets with forward-filled lookups by date."""

    def __init__(self, db: Session, symbols: set[str], start: date):
        assets = db.query(Asset).filter(Asset.symbol.in_(symbols)).all() if symbols else []
        id_to_sym = {a.id: a.symbol for a in assets}
        self._series: dict[str, tuple[list[date], list[float]]] = {}
        if not id_to_sym:
            return
        # Load a little before `start` so the first day can be forward-filled
        rows = (
            db.query(PriceHistory.asset_id, PriceHistory.date, PriceHistory.close)
            .filter(
                PriceHistory.asset_id.in_(id_to_sym.keys()),
                PriceHistory.date >= datetime.combine(start - timedelta(days=10), datetime.min.time()),
                PriceHistory.close.isnot(None),
            )
            .order_by(PriceHistory.date.asc())
            .all()
        )
        grouped = defaultdict(lambda: ([], []))
        for asset_id, dt, close in rows:
            dates, closes = grouped[id_to_sym[asset_id]]
            dates.append(dt.date())
            closes.append(close)
        self._series = dict(grouped)

    def close_on(self, symbol: str, d: date) -> float | None:
        """Latest close on or before d."""
        series = self._series.get(symbol)
        if not series:
            return None
        dates, closes = series
        i = bisect_right(dates, d) - 1
        return closes[i] if i >= 0 else None


def _day_range(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days + 1)]


def _value_holdings(holdings: dict, cash: float, book: _CloseBook, d: date) -> float:
    """Value {symbol: (units, avg, cost)} on day d using historical closes + FX."""
    lookup = lambda s: book.close_on(s, d)
    total = cash
    for sym, (units, avg, cost) in holdings.items():
        try:
            fx = usd_per(quote_currency(sym), lookup)
        except HTTPException:
            fx = 1.0
        total += position_value(units, avg, cost, lookup(sym), fx)
    return total


def build_equity_curve(db: Session, mode: str = "actual", days: int = 90) -> list[dict]:
    """
    mode="actual"   — replay every trade day by day since the portfolio was
                      created: what the account was really worth each day.
    mode="backtest" — hold today's positions fixed and value them over the last
                      `days` days: how the current allocation would have behaved.

    Both include the S&P 500 rebased to the first point, as a benchmark.
    """
    summary = build_summary(db)
    portfolio = get_or_create_portfolio(db)
    today = datetime.now(timezone.utc).date()

    txs = (
        db.query(Transaction)
        .filter(Transaction.portfolio_id == portfolio.id)
        .options(joinedload(Transaction.asset))
        .order_by(Transaction.executed_at.asc(), Transaction.id.asc())
        .all()
    )

    if mode == "backtest":
        start = today - timedelta(days=max(7, min(days, 365)))
        symbols = {p["symbol"] for p in summary["positions"]}
    else:
        start = portfolio.created_at.date() if portfolio.created_at else today
        symbols = {t.asset.symbol for t in txs}

    currencies = {quote_currency(s) for s in symbols}
    book = _CloseBook(db, symbols | fx_pair_symbols(currencies) | {BENCHMARK_SYMBOL}, start)

    points = []
    if mode == "backtest":
        holdings = {
            p["symbol"]: (p["units"], p["avg_price"], p["cost_basis"])
            for p in summary["positions"]
        }
        for d in _day_range(start, today - timedelta(days=1)):
            points.append((d, _value_holdings(holdings, summary["cash"], book, d)))
    else:
        cash = portfolio.starting_cash
        holdings: dict[str, tuple[float, float, float]] = {}
        i = 0
        for d in _day_range(start, today - timedelta(days=1)):
            # Apply every trade executed up to the end of day d
            while i < len(txs) and txs[i].executed_at.date() <= d:
                t = txs[i]
                sym = t.asset.symbol
                units, avg, cost = holdings.get(sym, (0.0, 0.0, 0.0))
                if t.side == "buy":
                    new_units = units + t.units
                    avg = (units * avg + t.units * t.price) / new_units
                    holdings[sym] = (new_units, avg, cost + t.amount_usd)
                    cash -= t.amount_usd
                else:
                    released = cost * (t.units / units) if units else 0.0
                    left = units - t.units
                    if left <= units * 1e-9:
                        holdings.pop(sym, None)
                    else:
                        holdings[sym] = (left, avg, cost - released)
                    cash += t.amount_usd
                i += 1
            points.append((d, _value_holdings(holdings, cash, book, d)))

    # Final point is always the live value
    points.append((today, summary["total_value"]))

    # Benchmark rebased so it starts at the same dollar value as the portfolio
    base_value = points[0][1]
    base_bench = book.close_on(BENCHMARK_SYMBOL, points[0][0])
    live_bench = live_price_lookup(db)(BENCHMARK_SYMBOL)

    out = []
    for d, value in points:
        bench = live_bench if d == today else book.close_on(BENCHMARK_SYMBOL, d)
        out.append({
            "date": d.isoformat(),
            "value": round(value, 2),
            "benchmark": round(base_value * bench / base_bench, 2) if (bench and base_bench) else None,
        })
    return out
