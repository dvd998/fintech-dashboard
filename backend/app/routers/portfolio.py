"""
Portfolio router — paper-trading simulator.
The user starts with virtual cash (default $100k) and can buy/sell any tracked
instrument at the current price. All valuation logic lives in services/portfolio.py.
"""
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Asset, Transaction
from ..schemas import (
    EquityPointSchema, PortfolioSummarySchema, ResetRequest,
    TradeRequest, TradeResultSchema, TransactionSchema,
)
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
    """Trade log, newest first."""
    portfolio = svc.get_or_create_portfolio(db)
    rows = (
        db.query(Transaction)
        .filter(Transaction.portfolio_id == portfolio.id)
        .options(joinedload(Transaction.asset))
        .order_by(Transaction.executed_at.desc(), Transaction.id.desc())
        .limit(limit)
        .all()
    )
    return [svc.serialize_transaction(t) for t in rows]


@router.get("/history", response_model=list[EquityPointSchema])
def get_history(mode: str = "actual", days: int = 90, db: Session = Depends(get_db)):
    """Daily portfolio value plus an S&P 500 benchmark. mode = actual | backtest."""
    return svc.build_equity_curve(db, mode=mode, days=days)


@router.post("/reset", response_model=PortfolioSummarySchema)
def reset(req: ResetRequest, db: Session = Depends(get_db)):
    """Close everything, clear the trade log and re-fund the account."""
    svc.reset_portfolio(db, req.starting_cash)
    return svc.build_summary(db)
