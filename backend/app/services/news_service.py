"""
Financial news fetching and AI sentiment analysis service.

Flow:
  1. Pull headlines from multiple free RSS feeds via feedparser.
  2. Skip URLs already stored in the DB (deduplication).
  3. Send each new article to Claude Haiku for structured JSON analysis.
     — Uses prompt caching on the large static system prompt (tracked asset list)
       so we pay the full token cost only once per cache window.
  4. Run up to ANALYSIS_WORKERS Claude calls in parallel (ThreadPoolExecutor).
  5. Persist articles + analysis to the news_articles table.
"""
import json
import logging
import os
import re
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from email.utils import parsedate
from sqlalchemy.orm import Session

import feedparser
from anthropic import Anthropic

from ..models import NewsArticle
from ..config import ASSETS

logger = logging.getLogger(__name__)

# Flat list of every tracked asset — injected into the Claude system prompt
# so the model maps news to real symbols we actually display.
TRACKED_ASSETS = [
    {"symbol": a["symbol"], "name": a["name"], "category": cat}
    for cat, asset_list in ASSETS.items()
    for a in asset_list
]

RSS_FEEDS = [
    {"name": "Yahoo Finance", "url": "https://finance.yahoo.com/news/rssindex"},
    {"name": "CNBC",          "url": "https://search.cnbc.com/rs/search/combinedcgi?id=100727362&format=rss"},
    {"name": "BBC Business",  "url": "https://feeds.bbci.co.uk/news/business/rss.xml"},
    {"name": "MarketWatch",   "url": "https://feeds.content.dowjones.io/public/rss/mw_topstories"},
]

MAX_PER_FEED      = 8   # articles pulled per feed per refresh
ANALYSIS_WORKERS  = 5   # parallel Claude API calls


# ── Helpers ──────────────────────────────────────────────────────────────────

def _parse_rss_date(date_str: str) -> datetime | None:
    """Parse an RFC 2822 date string (standard RSS format) into a UTC datetime."""
    if not date_str:
        return None
    try:
        t = parsedate(date_str)
        if t:
            return datetime(*t[:6], tzinfo=timezone.utc)
    except Exception:
        pass
    return None


def _strip_html(text: str) -> str:
    """Remove HTML tags that some RSS feeds embed in their summaries."""
    return re.sub(r"<[^>]+>", " ", text or "").strip()


# ── RSS fetching ─────────────────────────────────────────────────────────────

def fetch_rss_articles() -> list[dict]:
    """
    Pull recent articles from all configured RSS feeds.
    Returns a flat list of dicts; missing/empty entries are skipped.
    """
    articles = []
    for feed_cfg in RSS_FEEDS:
        try:
            feed = feedparser.parse(feed_cfg["url"])
            for entry in feed.entries[:MAX_PER_FEED]:
                url   = entry.get("link", "").strip()
                title = entry.get("title", "").strip()
                if not url or not title:
                    continue
                summary = _strip_html(
                    entry.get("summary", entry.get("description", ""))
                )[:1200]   # cap length fed to Claude
                articles.append({
                    "url":          url,
                    "title":        title,
                    "source":       feed_cfg["name"],
                    "summary":      summary,
                    "published_at": _parse_rss_date(entry.get("published", "")),
                })
        except Exception as exc:
            logger.warning("RSS fetch failed for %s: %s", feed_cfg["name"], exc)
    return articles


# ── Claude analysis ───────────────────────────────────────────────────────────

# Build the static system prompt once (module load) — this is what gets cached.
_SYSTEM_CONTENT = (
    "You are a financial market analyst. Analyze news articles and return structured "
    "sentiment data in JSON.\n\n"
    "Only reference assets from this list:\n"
    + json.dumps(TRACKED_ASSETS, indent=2)
    + "\n\n"
    "Respond with a single valid JSON object — no markdown, no extra text — with these fields:\n"
    "  sentiment_label  : \"bullish\" | \"bearish\" | \"neutral\"\n"
    "  sentiment_score  : float, -1.0 (very bearish) to +1.0 (very bullish)\n"
    "  affected_assets  : array of {symbol, name, category, "
    "impact (\"positive\"|\"negative\"|\"neutral\"), reason}\n"
    "  reasoning        : 2–3 sentences explaining the market impact\n"
    "  tags             : array of short keyword tags e.g. [\"Fed\", \"Tech\", \"Oil\"]\n"
    "Include only assets genuinely likely to be affected."
)


def _analyze_single(title: str, summary: str) -> dict:
    """
    Call Claude Haiku to analyze one article.
    The large system prompt (tracked assets + instructions) is marked for
    prompt caching so it only counts as full tokens on the first request
    in a 5-minute window.
    """
    api_key = os.getenv("ANTHROPIC_API_KEY")
    if not api_key:
        raise RuntimeError(
            "ANTHROPIC_API_KEY is not set. Add it to backend/.env and restart the server."
        )

    client   = Anthropic(api_key=api_key)
    response = client.messages.create(
        model      = "claude-haiku-4-5-20251001",
        max_tokens = 1024,
        system     = [
            {
                "type":          "text",
                "text":          _SYSTEM_CONTENT,
                "cache_control": {"type": "ephemeral"},   # cache the big static block
            }
        ],
        messages = [
            {
                "role":    "user",
                "content": f"Article title: {title}\n\nSummary: {summary}",
            }
        ],
    )

    raw = response.content[0].text.strip()
    # Strip markdown fences Claude occasionally wraps around JSON
    if raw.startswith("```"):
        lines = raw.split("\n")
        raw   = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])
    return json.loads(raw)


# ── Main entry point ──────────────────────────────────────────────────────────

def fetch_and_analyze(db: Session) -> int:
    """
    Fetch RSS feeds, analyze new articles with Claude, persist to DB.
    Returns the number of articles newly stored.
    """
    raw_articles = fetch_rss_articles()

    # Deduplicate against what's already in the DB
    new_articles = [
        a for a in raw_articles
        if a["url"] and not db.query(NewsArticle).filter(NewsArticle.url == a["url"]).first()
    ]

    if not new_articles:
        logger.info("No new articles found.")
        return 0

    logger.info("Analyzing %d new articles with Claude...", len(new_articles))

    # Run Claude calls in parallel to keep the refresh fast
    analyses: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=ANALYSIS_WORKERS) as pool:
        futures = {
            pool.submit(_analyze_single, a["title"], a["summary"]): a["url"]
            for a in new_articles
        }
        for future in as_completed(futures):
            url = futures[future]
            try:
                analyses[url] = future.result()
            except Exception as exc:
                logger.error("Analysis failed for %s: %s", url, exc)

    # Persist everything in one transaction
    now = datetime.now(timezone.utc)
    for art in new_articles:
        analysis = analyses.get(art["url"])
        row = NewsArticle(
            url          = art["url"],
            title        = art["title"],
            source       = art["source"],
            summary      = art["summary"],
            published_at = art["published_at"],
            fetched_at   = now,
            sentiment_label = analysis.get("sentiment_label") if analysis else None,
            sentiment_score = analysis.get("sentiment_score") if analysis else None,
            affected_assets = json.dumps(analysis.get("affected_assets", [])) if analysis else None,
            reasoning       = analysis.get("reasoning") if analysis else None,
            tags            = json.dumps(analysis.get("tags", [])) if analysis else None,
            analyzed_at     = now if analysis else None,
        )
        db.add(row)

    db.commit()
    logger.info("Stored %d new articles.", len(new_articles))
    return len(new_articles)
