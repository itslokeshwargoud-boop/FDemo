"""Attack clusters endpoint."""
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database.connection import get_db
from models.keyword import Keyword
from models.attack_cluster import AttackCluster
from core.schemas import AttackClusterResponse, PaginatedResponse
from api.middleware.auth import verify_token, TokenData

router = APIRouter(prefix="/clusters", tags=["clusters"])


@router.get("/{keyword}", response_model=PaginatedResponse[AttackClusterResponse])
async def get_clusters(
    keyword: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    token_data: TokenData = Depends(verify_token),
):
    kw = await db.execute(select(Keyword).where(Keyword.keyword == keyword))
    kw_row = kw.scalar_one_or_none()
    if not kw_row:
        raise HTTPException(status_code=404, detail="Keyword not found")

    total_q = select(func.count(AttackCluster.id)).where(AttackCluster.keyword_id == kw_row.id)
    total = (await db.execute(total_q)).scalar()

    offset = (page - 1) * page_size
    result = await db.execute(
        select(AttackCluster)
        .where(AttackCluster.keyword_id == kw_row.id)
        .order_by(AttackCluster.detected_at.desc())
        .offset(offset)
        .limit(page_size)
    )
    clusters = result.scalars().all()

    return PaginatedResponse(items=clusters, total=total, page=page, page_size=page_size)
