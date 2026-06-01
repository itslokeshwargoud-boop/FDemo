"""Flagged authors endpoint."""
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_
from database.connection import get_db
from models.keyword import Keyword
from models.post import Post
from models.tracked_author import TrackedAuthor
from core.schemas import TrackedAuthorResponse, PaginatedResponse
from api.middleware.auth import verify_token, TokenData

router = APIRouter(prefix="/attackers", tags=["attackers"])


@router.get("/{keyword}", response_model=PaginatedResponse[TrackedAuthorResponse])
async def get_attackers(
    keyword: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    platform: Optional[str] = Query(None),
    flagged_only: bool = Query(False),
    db: AsyncSession = Depends(get_db),
    token_data: TokenData = Depends(verify_token),
):
    """Get flagged authors sorted by risk_score DESC."""
    kw = await db.execute(select(Keyword).where(Keyword.keyword == keyword))
    kw_row = kw.scalar_one_or_none()
    if not kw_row:
        raise HTTPException(status_code=404, detail="Keyword not found")

    # Get unique (author_id, platform) pairs who posted about this keyword
    author_ids_result = await db.execute(
        select(Post.author_id, Post.platform)
        .where(Post.keyword_id == kw_row.id)
        .distinct()
    )
    author_platform_pairs = [
        (r.author_id, r.platform) for r in author_ids_result.fetchall()
    ]

    if not author_platform_pairs:
        return PaginatedResponse(items=[], total=0, page=page, page_size=page_size)

    filters = [
        or_(
            *[
                and_(TrackedAuthor.author_id == aid, TrackedAuthor.platform == plat)
                for aid, plat in author_platform_pairs
            ]
        )
    ]
    if platform:
        filters.append(TrackedAuthor.platform == platform)
    if flagged_only:
        filters.append(TrackedAuthor.is_flagged == True)  # noqa: E712

    total_q = select(func.count(TrackedAuthor.id)).where(*filters)
    total = (await db.execute(total_q)).scalar()

    offset = (page - 1) * page_size
    result = await db.execute(
        select(TrackedAuthor)
        .where(*filters)
        .order_by(TrackedAuthor.risk_score.desc())
        .offset(offset)
        .limit(page_size)
    )
    authors = result.scalars().all()

    return PaginatedResponse(items=authors, total=total, page=page, page_size=page_size)
