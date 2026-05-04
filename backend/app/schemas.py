"""
Pydantic schemas define the shape of data that the API sends to the frontend.
They are separate from SQLAlchemy models — models talk to the DB, schemas talk to the client.
"""
from pydantic import BaseModel
from datetime import datetime
from typing import Optional


class CurrentPriceSchema(BaseModel):
    symbol:         str
    name:           str
    category:       str
    price:          Optional[float]
    open:           Optional[float]
    high:           Optional[float]
    low:            Optional[float]
    prev_close:     Optional[float]
    change:         Optional[float]
    change_percent: Optional[float]
    volume:         Optional[float]
    market_cap:     Optional[float]
    updated_at:     Optional[datetime]

    # Tell Pydantic it can read attributes from SQLAlchemy ORM objects directly
    model_config = {"from_attributes": True}


class HistoryPointSchema(BaseModel):
    date:   datetime
    open:   Optional[float]
    high:   Optional[float]
    low:    Optional[float]
    close:  Optional[float]
    volume: Optional[float]

    model_config = {"from_attributes": True}


class AssetDetailSchema(BaseModel):
    """Single asset with its full price history — used for the detail/chart view."""
    symbol:   str
    name:     str
    category: str
    current:  Optional[CurrentPriceSchema]
    history:  list[HistoryPointSchema]

    model_config = {"from_attributes": True}
