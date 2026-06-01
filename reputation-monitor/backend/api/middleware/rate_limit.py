"""Rate limiting: 100 requests/minute per IP using slowapi with optional Redis backend."""
import logging

from slowapi import Limiter
from slowapi.util import get_remote_address

logger = logging.getLogger(__name__)

# Try to use Redis as a storage backend; fall back to in-memory if unavailable
_storage_uri = None
try:
    from core.config import settings
    if settings.redis_enabled:
        _storage_uri = settings.REDIS_URL
        logger.info("Rate limiter: using Redis backend")
    else:
        logger.info("Rate limiter: Redis not configured, using in-memory storage")
except Exception as exc:
    logger.warning("Rate limiter: could not read config, using in-memory: %s", exc)

limiter = Limiter(
    key_func=get_remote_address,
    default_limits=["100/minute"],
    storage_uri=_storage_uri,
)
