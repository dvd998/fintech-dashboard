"""
AI Playground router.
Provides news sentiment data and will host future AI features.
"""
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import NewsArticle
from ..schemas import NewsArticleSchema, NewsRefreshResponse
from ..services.news_service import fetch_and_analyze, serialize_article

logger = logging.getLogger(__name__)
router = APIRouter()


@router.get("/news", response_model=list[NewsArticleSchema])
def get_news(limit: int | None = None, db: Session = Depends(get_db)):
    """
    Return analyzed articles from the local cache, newest first.
    With no limit, returns the full cache — the same ordering the watchlist's
    per-asset news lookup uses, so sentiment stats and filters stay consistent
    across both pages.
    """
    query = (
        db.query(NewsArticle)
        .order_by(NewsArticle.published_at.desc(), NewsArticle.fetched_at.desc())
    )
    if limit is not None:
        query = query.limit(limit)
    return [serialize_article(r) for r in query.all()]


@router.post("/news/refresh", response_model=NewsRefreshResponse)
def refresh_news(db: Session = Depends(get_db)):
    """
    Pull fresh articles from RSS feeds and analyze them with Claude.
    Returns how many new articles were stored.
    """
    try:
        count = fetch_and_analyze(db)
        return NewsRefreshResponse(
            new_articles = count,
            message      = (
                f"Analyzed and stored {count} new article(s)."
                if count else "No new articles found — everything is up to date."
            ),
        )
    except RuntimeError as exc:
        raise HTTPException(status_code=503, detail=str(exc))
    except Exception as exc:
        logger.error("News refresh failed: %s", exc)
        raise HTTPException(status_code=500, detail="News refresh failed. Check server logs.")
