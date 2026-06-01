"""
WebSocket live feed with Redis Pub/Sub.
Connect: ws://host/ws/live/{keyword}?token=<jwt>
"""
import json
import logging
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status
from jose import JWTError, jwt
import redis.asyncio as aioredis
from core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["live"])

# Map channel_key -> list of active WebSocket connections
active_connections: dict[str, list[WebSocket]] = {}


@router.websocket("/ws/live/{keyword}")
async def live_keyword_feed(
    websocket: WebSocket,
    keyword: str,
    token: str = Query(...),
):
    # Verify JWT before accepting the connection
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        user_id = payload.get("sub")
        if not user_id:
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
            return
    except JWTError:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    channel_key = keyword.lower().replace(" ", "_")

    if channel_key not in active_connections:
        active_connections[channel_key] = []
    active_connections[channel_key].append(websocket)

    await websocket.send_json({
        "event": "connected",
        "message": f"Monitoring: {keyword}",
        "keyword": keyword,
    })

    redis = aioredis.from_url(settings.REDIS_URL)
    pubsub = redis.pubsub()
    await pubsub.subscribe(f"live:{channel_key}")

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                data = message["data"]
                if isinstance(data, bytes):
                    data = data.decode("utf-8")
                await websocket.send_json(json.loads(data))
    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for keyword '{keyword}'")
    except Exception as e:
        logger.error(f"WebSocket error for keyword '{keyword}': {e}")
    finally:
        connections = active_connections.get(channel_key, [])
        if websocket in connections:
            connections.remove(websocket)
        await pubsub.unsubscribe(f"live:{channel_key}")
        await redis.aclose()
