"""
One-time cleanup: remove untracked symbols (e.g. NFLX, INTC) from stored
articles' affected_assets. Claude sometimes named tickers the app has no
price data for, which broke the News Analyzer's Market Impact chart.
New articles are filtered on save by news_service.only_tracked().

Usage (from backend/):
    python -m scripts.strip_untracked_assets            # preview only
    python -m scripts.strip_untracked_assets --confirm  # actually update
"""
import argparse
import json

from dotenv import load_dotenv
load_dotenv()

from app.database import SessionLocal
from app.models import NewsArticle
from app.services.news_service import only_tracked


def find_affected(db):
    """Return [(article, cleaned_assets)] for every article citing an untracked symbol."""
    results = []
    rows = db.query(NewsArticle).filter(NewsArticle.affected_assets.isnot(None)).all()
    for r in rows:
        assets = json.loads(r.affected_assets)
        cleaned = only_tracked(assets)
        if len(cleaned) != len(assets):
            results.append((r, cleaned))
    return results


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--confirm", action="store_true", help="Actually update (default: preview only)")
    args = parser.parse_args()

    db = SessionLocal()
    try:
        matches = find_affected(db)
        print(f"Found {len(matches)} article(s) citing untracked symbols\n")
        for r, cleaned in matches:
            removed = {a.get("symbol") for a in json.loads(r.affected_assets)} - {a["symbol"] for a in cleaned}
            print(f"  [{r.id}] removing {sorted(removed)} — {r.title}")

        if not matches:
            print("\nNothing to update.")
            return

        if not args.confirm:
            print(f"\nDry run — re-run with --confirm to update these {len(matches)} row(s).")
            return

        for r, cleaned in matches:
            r.affected_assets = json.dumps(cleaned)
        db.commit()
        print(f"Updated {len(matches)} row(s).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
