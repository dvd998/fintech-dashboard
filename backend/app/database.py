from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

# SQLite file stored next to this project — zero config, no server needed.
# For production we'd swap this URL for PostgreSQL/Supabase.
SQLALCHEMY_DATABASE_URL = "sqlite:///./fintech.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL,
    # SQLite needs this flag when used across multiple threads (FastAPI uses threads)
    connect_args={"check_same_thread": False},
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# All ORM models inherit from this base class
Base = declarative_base()


def get_db():
    """FastAPI dependency — yields a DB session and always closes it after the request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
