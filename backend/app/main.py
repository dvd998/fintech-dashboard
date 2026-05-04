"""
FastAPI application entry point.
Run with:  uvicorn app.main:app --reload  (from the backend/ directory)
"""
import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load .env before anything else so os.getenv() works everywhere
load_dotenv()

from .database import engine, Base
from .scheduler import start_scheduler
from .routers import stocks, crypto, commodities, forex, indices

logging.basicConfig(level=logging.INFO)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Code before 'yield' runs on startup; code after runs on shutdown.
    We create DB tables then kick off the background scheduler + initial data load.
    """
    Base.metadata.create_all(bind=engine)
    start_scheduler()  # blocks until initial data is loaded
    yield
    # nothing to clean up on shutdown


app = FastAPI(
    title="FinTech Dashboard API",
    version="0.1.0",
    lifespan=lifespan,
)

# Allow the React dev server (port 5173) to call this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Mount routers — each adds its own set of endpoints under /api/<category>
app.include_router(stocks.router,      prefix="/api/stocks",      tags=["Stocks"])
app.include_router(crypto.router,      prefix="/api/crypto",      tags=["Crypto"])
app.include_router(commodities.router, prefix="/api/commodities", tags=["Commodities"])
app.include_router(forex.router,       prefix="/api/forex",        tags=["Forex"])
app.include_router(indices.router,     prefix="/api/indices",      tags=["Indices"])


@app.get("/api/health")
def health():
    return {"status": "ok"}
