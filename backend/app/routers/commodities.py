from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from ..database import get_db
from ..models import Asset, CurrentPrice, PriceHistory
from ..schemas import CurrentPriceSchema, AssetDetailSchema, HistoryPointSchema

router = APIRouter()


@router.get("/", response_model=list[CurrentPriceSchema])
def get_commodities(db: Session = Depends(get_db)):
    assets = (
        db.query(Asset)
        .filter(Asset.category == "commodities")
        .options(joinedload(Asset.current_price))
        .all()
    )
    result = []
    for asset in assets:
        cp = asset.current_price
        result.append(CurrentPriceSchema(
            symbol=asset.symbol, name=asset.name, category=asset.category,
            price=cp.price if cp else None,
            open=cp.open if cp else None,
            high=cp.high if cp else None,
            low=cp.low if cp else None,
            prev_close=cp.prev_close if cp else None,
            change=cp.change if cp else None,
            change_percent=cp.change_percent if cp else None,
            volume=cp.volume if cp else None,
            market_cap=cp.market_cap if cp else None,
            updated_at=cp.updated_at if cp else None,
        ))
    return result


@router.get("/{symbol:path}", response_model=AssetDetailSchema)
def get_commodity_detail(symbol: str, db: Session = Depends(get_db)):
    # :path allows symbols with special chars like GC=F or CL=F
    asset = db.query(Asset).filter(
        Asset.symbol == symbol.upper(),
        Asset.category == "commodities",
    ).first()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Commodity '{symbol}' not found.")

    cp = asset.current_price
    history_rows = (
        db.query(PriceHistory)
        .filter(PriceHistory.asset_id == asset.id)
        .order_by(PriceHistory.date.asc())
        .all()
    )
    return AssetDetailSchema(
        symbol=asset.symbol, name=asset.name, category=asset.category,
        current=CurrentPriceSchema(
            symbol=asset.symbol, name=asset.name, category=asset.category,
            price=cp.price if cp else None,
            open=cp.open if cp else None,
            high=cp.high if cp else None,
            low=cp.low if cp else None,
            prev_close=cp.prev_close if cp else None,
            change=cp.change if cp else None,
            change_percent=cp.change_percent if cp else None,
            volume=cp.volume if cp else None,
            market_cap=cp.market_cap if cp else None,
            updated_at=cp.updated_at if cp else None,
        ) if cp else None,
        history=[
            HistoryPointSchema(date=h.date, open=h.open, high=h.high, low=h.low, close=h.close, volume=h.volume)
            for h in history_rows
        ],
    )
