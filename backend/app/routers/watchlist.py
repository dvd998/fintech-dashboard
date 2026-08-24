"""
Watchlist router.
Lets the user star assets from any category onto a personal shortlist, and
surfaces the Claude-analyzed news specifically related to each watched asset.
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from ..database import get_db
from ..models import Asset, NewsArticle, WatchlistItem
from ..schemas import NewsArticleSchema, WatchlistItemSchema
from ..services.news_service import serialize_article

router = APIRouter()


def _serialize_item(item: WatchlistItem) -> WatchlistItemSchema:
    asset = item.asset
    cp = asset.current_price
    return WatchlistItemSchema(
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
        added_at=item.added_at,
    )


@router.get("/", response_model=list[WatchlistItemSchema])
def get_watchlist(db: Session = Depends(get_db)):
    """Return every watched asset with its latest price snapshot, most recently added first."""
    items = (
        db.query(WatchlistItem)
        .options(joinedload(WatchlistItem.asset).joinedload(Asset.current_price))
        .order_by(WatchlistItem.added_at.desc())
        .all()
    )
    return [_serialize_item(i) for i in items]


@router.post("/{symbol}", response_model=WatchlistItemSchema)
def add_to_watchlist(symbol: str, db: Session = Depends(get_db)):
    """Add an asset to the watchlist. Idempotent — starring an already-watched asset is a no-op."""
    asset = db.query(Asset).filter(Asset.symbol == symbol.upper()).first()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset '{symbol}' not found.")

    item = db.query(WatchlistItem).filter(WatchlistItem.asset_id == asset.id).first()
    if not item:
        item = WatchlistItem(asset_id=asset.id)
        db.add(item)
        db.commit()
        db.refresh(item)

    return _serialize_item(item)


@router.delete("/{symbol}", status_code=204)
def remove_from_watchlist(symbol: str, db: Session = Depends(get_db)):
    """Remove an asset from the watchlist."""
    asset = db.query(Asset).filter(Asset.symbol == symbol.upper()).first()
    if not asset:
        raise HTTPException(status_code=404, detail=f"Asset '{symbol}' not found.")

    db.query(WatchlistItem).filter(WatchlistItem.asset_id == asset.id).delete()
    db.commit()


@router.get("/{symbol}/news", response_model=list[NewsArticleSchema])
def get_watchlist_asset_news(symbol: str, limit: int = 20, db: Session = Depends(get_db)):
    """
    Return analyzed news articles that name this symbol among their affected
    assets, sorted newest to oldest (by published date, falling back to when
    we fetched it).
    """
    symbol = symbol.upper()
    rows = (
        db.query(NewsArticle)
        .filter(NewsArticle.affected_assets.isnot(None))
        .order_by(NewsArticle.published_at.desc(), NewsArticle.fetched_at.desc())
        .all()
    )
    matches = []
    for row in rows:
        article = serialize_article(row)
        if any(a.symbol.upper() == symbol for a in article.affected_assets):
            matches.append(article)
        if len(matches) >= limit:
            break
    return matches
