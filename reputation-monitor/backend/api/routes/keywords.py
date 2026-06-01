import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from database.connection import get_db
from models.keyword import Keyword
from core.schemas import KeywordCreate, KeywordResponse, PaginatedResponse
from api.middleware.auth import verify_token, TokenData

router = APIRouter(prefix="/keywords", tags=["keywords"])


@router.post("", response_model=KeywordResponse, status_code=201)
async def create_keyword(
    body: KeywordCreate,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData = Depends(verify_token),
):
    existing = await db.execute(select(Keyword).where(Keyword.keyword == body.keyword))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Keyword already exists")
    keyword = Keyword(
        id=uuid.uuid4(),
        keyword=body.keyword,
        owner_user_id=uuid.UUID(token_data.user_id) if token_data.user_id else None,
    )
    db.add(keyword)
    await db.commit()
    await db.refresh(keyword)
    # Trigger immediate collection (best-effort)
    try:
        from pipeline.tasks.collect_task import collect_keyword
        collect_keyword.delay(str(keyword.id), keyword.keyword)
    except Exception:
        pass
    return keyword


@router.get("", response_model=PaginatedResponse[KeywordResponse])
async def list_keywords(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    token_data: TokenData = Depends(verify_token),
):
    offset = (page - 1) * page_size
    total_result = await db.execute(select(func.count(Keyword.id)))
    total = total_result.scalar()
    result = await db.execute(
        select(Keyword).offset(offset).limit(page_size).order_by(Keyword.created_at.desc())
    )
    keywords = result.scalars().all()
    return PaginatedResponse(items=keywords, total=total, page=page, page_size=page_size)


@router.delete("/{keyword_id}", status_code=204)
async def delete_keyword(
    keyword_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData = Depends(verify_token),
):
    result = await db.execute(select(Keyword).where(Keyword.id == keyword_id))
    keyword = result.scalar_one_or_none()
    if not keyword:
        raise HTTPException(status_code=404, detail="Keyword not found")
    keyword.is_active = False
    await db.commit()
