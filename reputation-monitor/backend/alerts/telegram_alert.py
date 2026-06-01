"""Telegram Bot API alert sender."""
import logging
import httpx
from core.config import settings

logger = logging.getLogger(__name__)
TELEGRAM_API_URL = "https://api.telegram.org/bot{token}/sendMessage"


class TelegramAlert:
    async def send(self, message: str, chat_id: str | None = None):
        if not settings.TELEGRAM_BOT_TOKEN:
            logger.debug("Telegram not configured, skipping telegram alert")
            return
        target_chat_id = chat_id or settings.TELEGRAM_CHAT_ID
        if not target_chat_id:
            return
        url = TELEGRAM_API_URL.format(token=settings.TELEGRAM_BOT_TOKEN)
        async with httpx.AsyncClient() as client:
            response = await client.post(url, json={
                "chat_id": target_chat_id,
                "text": message,
                "parse_mode": "HTML",
            })
            response.raise_for_status()
        logger.info(f"Telegram alert sent to chat {target_chat_id}")
