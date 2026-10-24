"""
One-time cleanup: delete stored news articles that are 'neutral' with no
affected assets — the heuristic signature of off-topic personal-finance
advice columns (e.g. MarketWatch's "Moneyist") that slipped in before
is_market_relevant filtering existed.

Usage (from backend/):
    python -m scripts.cleanup_irrelevant_news            # preview only
    python -m scripts.cleanup_irrelevant_news --confirm  # actually delete
"""
import argparse

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import or_

from app.database import SessionLocal
from app.models import NewsArticle


def find_junk(db):
    return (
        db.query(NewsArticle)
        .filter(
            NewsArticle.sentiment_label == "neutral",
            or_(NewsArticle.affected_assets.is_(None), NewsArticle.affected_assets == "[]"),
        )
        .all()
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm", action="store_true", help="Actually delete (default: preview only)")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        rows = find_junk(db)
        print(f"Found {len(rows)} article(s) matching: sentiment_label='neutral' AND affected_assets empty\n")
        for r in rows:
            print(f"  [{r.id}] ({r.source}) {r.title}")

        if not rows:
            print("\nNothing to delete.")
            return

        if not args.confirm:
            print(f"\nDry run — re-run with --confirm to delete these {len(rows)} row(s).")
            return

        answer = input(f"\nDelete these {len(rows)} row(s)? [y/N] ").strip().lower()
        if answer != "y":
            print("Aborted.")
            return

        for r in rows:
            db.delete(r)
        db.commit()
        print(f"Deleted {len(rows)} row(s).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
