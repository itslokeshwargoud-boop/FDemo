"""Posts endpoint with filtering and pagination."""
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from database.connection import get_db
from models.keyword import Keyword
from models.post import Post
from models.sentiment_result import SentimentResult
from core.schemas import PostResponse, PaginatedResponse
from api.middleware.auth import verify_token, TokenData
from datetime import datetime

router = APIRouter(prefix="/posts", tags=["posts"])


@router.get("/{keyword}", response_model=PaginatedResponse[PostResponse])
async def get_posts(
    keyword: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    sentiment: Optional[str] = Query(None, enum=["positive", "negative", "neutral"]),
    platform: Optional[str] = Query(None),
    date_from: Optional[datetime] = Query(None),
    date_to: Optional[datetime] = Query(None),
    db: AsyncSession = Depends(get_db),
    token_data: TokenData = Depends(verify_token),
):
    kw = await db.execute(select(Keyword).where(Keyword.keyword == keyword))
    kw_row = kw.scalar_one_or_none()
    if not kw_row:
        raise HTTPException(status_code=404, detail="Keyword not found")

    filters = [Post.keyword_id == kw_row.id]
    if platform:
        filters.append(Post.platform == platform)
    if date_from:
        filters.append(Post.posted_at >= date_from)
    if date_to:
        filters.append(Post.posted_at <= date_to)

    base_query = (
        select(Post, SentimentResult)
        .outerjoin(SentimentResult, SentimentResult.post_id == Post.id)
        .where(and_(*filters))
    )

    if sentiment:
        base_query = base_query.where(SentimentResult.sentiment == sentiment)

    total_q = select(func.count()).select_from(base_query.subquery())
    total = (await db.execute(total_q)).scalar()

    offset = (page - 1) * page_size
    result = await db.execute(
        base_query.offset(offset).limit(page_size).order_by(Post.posted_at.desc())
    )
    rows = result.fetchall()

    posts = [
        PostResponse(
            id=row.Post.id,
            platform=row.Post.platform,
            post_id=row.Post.post_id,
            author_name=row.Post.author_name,
            followers_count=row.Post.followers_count,
            content=row.Post.content,
            posted_at=row.Post.posted_at,
            url=row.Post.url,
            likes_count=row.Post.likes_count,
            replies_count=row.Post.replies_count,
            shares_count=row.Post.shares_count,
            language=row.Post.language,
            sentiment=row.SentimentResult.sentiment if row.SentimentResult else None,
            confidence=row.SentimentResult.confidence if row.SentimentResult else None,
        )
        for row in rows
    ]

    return PaginatedResponse(items=posts, total=total, page=page, page_size=page_size)
