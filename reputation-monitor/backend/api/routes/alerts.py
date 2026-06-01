"""Alerts endpoints."""
import uuid
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from database.connection import get_db
from models.alert import Alert
from core.schemas import AlertResponse, AlertSubscribeRequest, PaginatedResponse
from api.middleware.auth import verify_token, TokenData

router = APIRouter(prefix="/alerts", tags=["alerts"])


@router.get("", response_model=PaginatedResponse[AlertResponse])
async def get_alerts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_read: Optional[bool] = Query(None),
    db: AsyncSession = Depends(get_db),
    token_data: TokenData = Depends(verify_token),
):
    filters = []
    if is_read is not None:
        filters.append(Alert.is_read == is_read)

    total_q = select(func.count(Alert.id))
    if filters:
        total_q = total_q.where(*filters)
    total = (await db.execute(total_q)).scalar()

    offset = (page - 1) * page_size
    query = select(Alert).order_by(Alert.triggered_at.desc()).offset(offset).limit(page_size)
    if filters:
        query = query.where(*filters)
    result = await db.execute(query)
    alerts = result.scalars().all()

    return PaginatedResponse(items=alerts, total=total, page=page, page_size=page_size)


@router.post("/subscribe", status_code=204)
async def subscribe_alerts(
    body: AlertSubscribeRequest,
    token_data: TokenData = Depends(verify_token),
):
    """Store alert preferences (email/Telegram). In production, save to user preferences table."""
    # For MVP: acknowledges subscription; actual delivery uses config.py values
    pass


@router.patch("/read-all", status_code=204)
async def mark_all_read(
    db: AsyncSession = Depends(get_db),
    token_data: TokenData = Depends(verify_token),
):
    await db.execute(update(Alert).where(Alert.is_read == False).values(is_read=True))  # noqa: E712
    await db.commit()


@router.patch("/{alert_id}/read", status_code=204)
async def mark_alert_read(
    alert_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    token_data: TokenData = Depends(verify_token),
):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.is_read = True
    await db.commit()
