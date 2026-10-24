"""
Finnhub free news API — supplements the RSS feeds with inherently
market-focused categories (no lifestyle/advice content mixed in).
Free tier: 60 req/min — trivial given this only runs on manual refresh clicks.
Get a free key at https://finnhub.io/register and set FINNHUB_API_KEY in .env.
"""
import logging
import os
from datetime import datetime, timezone

import httpx

logger = logging.getLogger(__name__)

BASE_URL = "https://finnhub.io/api/v1"
NEWS_CATEGORIES  = ["general"]   # add "forex" / "crypto" / "merger" later if desired
MAX_PER_CATEGORY = 15


def fetch_finnhub_articles() -> list[dict]:
    """
    Pull recent headlines from Finnhub's /news endpoint.
    Returns [] if FINNHUB_API_KEY is missing or the request fails — mirrors the
    per-feed try/except pattern in fetch_rss_articles() so a Finnhub outage
    never blocks the RSS half of a refresh.
    """
    api_key = os.getenv("FINNHUB_API_KEY")
    if not api_key:
        logger.warning("FINNHUB_API_KEY not set — skipping Finnhub news source.")
        return []

    articles = []
    for category in NEWS_CATEGORIES:
        try:
            resp = httpx.get(
                f"{BASE_URL}/news",
                params={"category": category, "token": api_key},
                timeout=15,
            )
            resp.raise_for_status()
            for item in resp.json()[:MAX_PER_CATEGORY]:
                url   = (item.get("url") or "").strip()
                title = (item.get("headline") or "").strip()
                if not url or not title:
                    continue
                ts = item.get("datetime")
                published_at = datetime.fromtimestamp(ts, tz=timezone.utc) if ts else None
                articles.append({
                    "url":          url,
                    "title":        title,
                    "source":       item.get("source") or "Finnhub",
                    "summary":      (item.get("summary") or "")[:1200],
                    "published_at": published_at,
                })
        except Exception as exc:
            logger.warning("Finnhub fetch failed for category %s: %s", category, exc)
    return articles
