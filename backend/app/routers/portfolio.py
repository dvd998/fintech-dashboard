"""
Portfolio router — paper-trading simulator.
The user starts with virtual cash (default $100k) and can buy/sell any tracked
instrument at the current price. All valuation logic lives in services/portfolio.py.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Asset
from ..schemas import (
    EquityPointSchema, MarginOpenRequest, MarginResultSchema, MarginUpdateRequest,
    PortfolioSummarySchema, ResetRequest, TradeRequest, TradeResultSchema, TransactionSchema,
)
from ..services import margin as margin_svc
from ..services import portfolio as svc

router = APIRouter()


@router.get("/", response_model=PortfolioSummarySchema)
def get_portfolio(db: Session = Depends(get_db)):
    """Cash, totals, P&L and every open position valued at live prices."""
    return svc.build_summary(db)


@router.get("/instruments")
def get_instruments(db: Session = Depends(get_db)):
    """Every tradable asset with its live price and quote currency — feeds the trade picker."""
    assets = db.query(Asset).options(joinedload(Asset.current_price)).order_by(Asset.category, Asset.symbol).all()
    return [
        {
            "symbol": a.symbol, "name": a.name, "category": a.category,
            "currency": svc.quote_currency(a.symbol),
            "price": a.current_price.price if a.current_price else None,
            "change_percent": a.current_price.change_percent if a.current_price else None,
            "max_leverage": margin_svc.max_leverage(a.category),
        }
        for a in assets
    ]


@router.post("/trade", response_model=TradeResultSchema)
def trade(req: TradeRequest, db: Session = Depends(get_db)):
    """Execute a market order at the current price."""
    tx = svc.execute_trade(db, req.symbol, req.side, req.amount_usd, req.units)
    verb = "Bought" if tx.side == "buy" else "Sold"
    return {
        "message": f"{verb} {tx.units:.6g} {tx.asset.symbol} for ${tx.amount_usd:,.2f}",
        "transaction": svc.serialize_transaction(tx),
    }


@router.get("/transactions", response_model=list[TransactionSchema])
def get_transactions(limit: int = 200, db: Session = Depends(get_db)):
    """Trade log (spot trades + margin open/close events), newest first."""
    return svc.list_transactions(db, limit)


# ── Margin (leveraged Long / Short) ──────────────────────────────────────────

def _fmt_lev(x: float) -> str:
    return f"{x:g}x"


@router.post("/margin/open", response_model=MarginResultSchema)
def open_margin(req: MarginOpenRequest, db: Session = Depends(get_db)):
    """Open a leveraged Long or Short at the current price."""
    mp = margin_svc.open_margin_position(
        db, req.symbol, req.side, req.leverage, req.margin_usd, req.stop_loss, req.take_profit,
    )
    return {
        "message": f"Opened {mp.side} {_fmt_lev(mp.leverage)} {mp.asset.symbol} "
                   f"with ${mp.margin_usd:,.2f} margin",
        "position_id": mp.id,
    }


@router.post("/margin/{position_id}/close", response_model=MarginResultSchema)
def close_margin(position_id: int, db: Session = Depends(get_db)):
    """Close a margin position at the current price."""
    mp = margin_svc.close_margin_position(db, position_id)
    sign = "+" if mp.realized_pnl >= 0 else "-"
    return {
        "message": f"Closed {mp.side} {mp.asset.symbol} · P&L {sign}${abs(mp.realized_pnl):,.2f}",
        "position_id": mp.id,
    }


@router.patch("/margin/{position_id}", response_model=MarginResultSchema)
def update_margin(position_id: int, req: MarginUpdateRequest, db: Session = Depends(get_db)):
    """Set or clear the stop-loss / take-profit of an open margin position."""
    mp = margin_svc.update_sl_tp(db, position_id, req.stop_loss, req.take_profit)
    return {"message": f"Updated stop-loss / take-profit for {mp.asset.symbol}", "position_id": mp.id}


@router.get("/history", response_model=list[EquityPointSchema])
def get_history(mode: str = "actual", days: int = 90, db: Session = Depends(get_db)):
    """Daily portfolio value plus an S&P 500 benchmark. mode = actual | backtest."""
    return svc.build_equity_curve(db, mode=mode, days=days)


@router.post("/reset", response_model=PortfolioSummarySchema)
def reset(req: ResetRequest, db: Session = Depends(get_db)):
    """Close everything, clear the trade log and re-fund the account."""
    svc.reset_portfolio(db, req.starting_cash)
    return svc.build_summary(db)
