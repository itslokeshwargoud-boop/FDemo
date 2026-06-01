"""Reputation score endpoint."""
import uuid
from typing import List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from database.connection import get_db
from models.keyword import Keyword
from models.reputation_score import ReputationScore
from core.schemas import ReputationScoreResponse
from api.middleware.auth import verify_token, TokenData
from datetime import datetime, timedelta, timezone

router = APIRouter(tags=["scores"])


@router.get("/score/{keyword}", response_model=ReputationScoreResponse)
async def get_current_score(
    keyword: str,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData = Depends(verify_token),
):
    kw = await db.execute(select(Keyword).where(Keyword.keyword == keyword))
    kw_row = kw.scalar_one_or_none()
    if not kw_row:
        raise HTTPException(status_code=404, detail="Keyword not found")

    result = await db.execute(
        select(ReputationScore)
        .where(ReputationScore.keyword_id == kw_row.id)
        .order_by(ReputationScore.computed_at.desc())
        .limit(1)
    )
    score = result.scalar_one_or_none()
    if not score:
        raise HTTPException(status_code=404, detail="No score computed yet")
    return score


@router.get("/score/{keyword}/history", response_model=List[ReputationScoreResponse])
async def get_score_history(
    keyword: str,
    days: int = Query(30, ge=1, le=365),
    db: AsyncSession = Depends(get_db),
    token_data: TokenData = Depends(verify_token),
):
    """Get score history for the specified number of days (default 30)."""
    kw = await db.execute(select(Keyword).where(Keyword.keyword == keyword))
    kw_row = kw.scalar_one_or_none()
    if not kw_row:
        raise HTTPException(status_code=404, detail="Keyword not found")

    since = datetime.now(timezone.utc) - timedelta(days=days)
    result = await db.execute(
        select(ReputationScore)
        .where(
            ReputationScore.keyword_id == kw_row.id,
            ReputationScore.computed_at >= since,
        )
        .order_by(ReputationScore.computed_at.asc())
    )
    return result.scalars().all()
