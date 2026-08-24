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
def get_news(limit: int = 60, db: Session = Depends(get_db)):
    """Return the most recent analyzed articles from the local cache."""
    rows = (
        db.query(NewsArticle)
        .order_by(NewsArticle.fetched_at.desc())
        .limit(limit)
        .all()
    )
    return [serialize_article(r) for r in rows]


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
