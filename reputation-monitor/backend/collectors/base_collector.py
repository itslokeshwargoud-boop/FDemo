from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
import redis.asyncio as aioredis
import json
from core.config import settings


@dataclass
class CollectedPost:
    platform: str  # 'youtube' | 'twitter' | 'instagram'
    post_id: str
    author_id: str
    author_name: str
    followers_count: int
    content: str
    posted_at: datetime
    url: str
    likes_count: int = 0
    replies_count: int = 0
    shares_count: int = 0
    language: str = 'en'
    raw_data: dict = field(default_factory=dict)


class BaseCollector(ABC):
    def __init__(self):
        self.redis = aioredis.from_url(settings.REDIS_URL)

    @abstractmethod
    def collect(self, keyword: str, since: datetime) -> list[CollectedPost]:
        pass

    @abstractmethod
    def get_platform_name(self) -> str:
        pass

    async def publish_live_post(self, keyword: str, post: dict):
        channel = f"live:{keyword.lower().replace(' ', '_')}"
        payload = json.dumps({
            "event": "new_post",
            "keyword": keyword,
            "data": {
                "platform": post["platform"],
                "author_name": post["author_name"],
                "content": post["content"],
                "url": post["url"],
                "posted_at": post["posted_at"],
                "sentiment": post.get("sentiment"),
                "confidence": post.get("confidence"),
                "followers_count": post["followers_count"],
                "likes_count": post.get("likes_count", 0),
                "is_flagged_author": post.get("is_flagged_author", False),
            }
        })
        await self.redis.publish(channel, payload)
