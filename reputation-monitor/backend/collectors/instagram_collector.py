import logging
import redis
from datetime import datetime, timezone
from core.config import settings
from collectors.base_collector import BaseCollector, CollectedPost

logger = logging.getLogger(__name__)

_SEEN_IDS_KEY = "instagram:seen_ids"
_SEEN_IDS_TTL = 86400 * 7  # 7 days


class InstagramCollector(BaseCollector):
    def __init__(self):
        super().__init__()
        self.redis_sync = redis.from_url(settings.REDIS_URL, decode_responses=True)
        self._client = None
        self._init_client()

    def _init_client(self):
        if not settings.INSTAGRAM_USERNAME or not settings.INSTAGRAM_PASSWORD:
            logger.warning("Instagram credentials not configured, skipping Instagram collection")
            return
        try:
            from instagrapi import Client
            cl = Client()
            cl.login(settings.INSTAGRAM_USERNAME, settings.INSTAGRAM_PASSWORD)
            self._client = cl
            logger.info("Instagram client initialized successfully")
        except Exception as e:
            logger.error(f"Instagram login failed: {e}")
            self._client = None

    def get_platform_name(self) -> str:
        return "instagram"

    def _is_seen(self, post_id: str) -> bool:
        return bool(self.redis_sync.sismember(_SEEN_IDS_KEY, post_id))

    def _mark_seen(self, post_id: str):
        self.redis_sync.sadd(_SEEN_IDS_KEY, str(post_id))
        self.redis_sync.expire(_SEEN_IDS_KEY, _SEEN_IDS_TTL)

    def collect(self, keyword: str, since: datetime) -> list[CollectedPost]:
        if not self._client:
            logger.warning("Instagram client not available, skipping collection")
            return []
        posts = []
        try:
            # Search by hashtag (remove # if present)
            tag = keyword.lstrip("#").replace(" ", "").lower()
            medias = self._client.hashtag_medias_recent(tag, amount=50)
            for media in medias:
                media_id = str(media.pk)
                if self._is_seen(media_id):
                    continue
                posted_at = media.taken_at
                if not isinstance(posted_at, datetime):
                    continue
                if posted_at.tzinfo is not None:
                    posted_at = posted_at.replace(tzinfo=None)
                if posted_at < since.replace(tzinfo=None):
                    continue
                caption = media.caption_text or ""
                username = media.user.username if media.user else "unknown"
                follower_count = 0
                try:
                    user_info = self._client.user_info(media.user.pk)
                    follower_count = user_info.follower_count
                except Exception:
                    pass
                url = f"https://www.instagram.com/p/{media.code}/"
                post = CollectedPost(
                    platform="instagram",
                    post_id=media_id,
                    author_id=str(media.user.pk) if media.user else username,
                    author_name=username,
                    followers_count=follower_count,
                    content=caption,
                    posted_at=posted_at,
                    url=url,
                    likes_count=media.like_count or 0,
                    replies_count=media.comment_count or 0,
                )
                self._mark_seen(media_id)
                posts.append(post)
        except Exception as e:
            logger.error(f"Instagram collection failed for keyword '{keyword}': {e}")
        return posts
