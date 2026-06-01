"""Sentiment summary endpoint."""
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, case
from database.connection import get_db
from models.keyword import Keyword
from models.post import Post
from models.sentiment_result import SentimentResult
from core.schemas import SentimentSummary, TimelineDataPoint
from api.middleware.auth import verify_token, TokenData
from ml.reputation_scorer import calculate_reputation_score
from datetime import datetime, timedelta, timezone
from typing import List

router = APIRouter(tags=["sentiment"])


@router.get("/sentiment/{keyword}", response_model=SentimentSummary)
async def get_sentiment_summary(
    keyword: str,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData = Depends(verify_token),
):
    kw = await db.execute(select(Keyword).where(Keyword.keyword == keyword))
    kw_row = kw.scalar_one_or_none()
    if not kw_row:
        raise HTTPException(status_code=404, detail="Keyword not found")

    result = await db.execute(
        select(SentimentResult.sentiment, func.count(SentimentResult.id))
        .join(Post, Post.id == SentimentResult.post_id)
        .where(Post.keyword_id == kw_row.id)
        .group_by(SentimentResult.sentiment)
    )
    counts = {row[0]: row[1] for row in result.fetchall()}
    positive = counts.get("positive", 0)
    negative = counts.get("negative", 0)
    neutral = counts.get("neutral", 0)
    score_data = calculate_reputation_score(positive, negative, neutral)

    return SentimentSummary(
        keyword=keyword,
        positive_count=positive,
        negative_count=negative,
        neutral_count=neutral,
        total_count=positive + negative + neutral,
        negative_ratio=score_data["negative_ratio"],
        score=score_data["score"],
        risk_level=score_data["risk_level"],
    )


@router.get("/timeline/{keyword}", response_model=List[TimelineDataPoint])
async def get_timeline(
    keyword: str,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData = Depends(verify_token),
):
    """Hourly sentiment breakdown for the last 7 days."""
    kw = await db.execute(select(Keyword).where(Keyword.keyword == keyword))
    kw_row = kw.scalar_one_or_none()
    if not kw_row:
        raise HTTPException(status_code=404, detail="Keyword not found")

    seven_days_ago = datetime.now(timezone.utc) - timedelta(days=7)

    result = await db.execute(
        select(
            func.date_trunc("hour", Post.posted_at).label("hour"),
            func.sum(case((SentimentResult.sentiment == "positive", 1), else_=0)).label("positive"),
            func.sum(case((SentimentResult.sentiment == "negative", 1), else_=0)).label("negative"),
            func.sum(case((SentimentResult.sentiment == "neutral", 1), else_=0)).label("neutral"),
        )
        .join(SentimentResult, SentimentResult.post_id == Post.id)
        .where(Post.keyword_id == kw_row.id, Post.posted_at >= seven_days_ago)
        .group_by(func.date_trunc("hour", Post.posted_at))
        .order_by(func.date_trunc("hour", Post.posted_at))
    )

    return [
        TimelineDataPoint(
            hour=row.hour,
            positive=row.positive,
            negative=row.negative,
            neutral=row.neutral,
        )
        for row in result.fetchall()
    ]
