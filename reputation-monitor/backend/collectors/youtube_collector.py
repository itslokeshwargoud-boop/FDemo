# Instagram monitoring is NOT supported via the YouTube collector.
# Instagram Graph API only allows monitoring owned accounts.

from datetime import datetime, timezone
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
import redis
from core.config import settings
from collectors.base_collector import BaseCollector, CollectedPost
import logging

logger = logging.getLogger(__name__)


class YouTubeCollector(BaseCollector):
    # Quota costs per operation
    SEARCH_QUOTA_COST = 100
    COMMENT_THREADS_QUOTA_COST = 1
    DAILY_QUOTA_LIMIT = 10000
    QUOTA_SAFETY_MARGIN = 500  # Stop at 9500 to leave buffer

    def __init__(self):
        super().__init__()
        self._api_keys = settings.get_youtube_api_keys()
        self._current_key_index = 0
        self.redis_sync = redis.from_url(settings.REDIS_URL, decode_responses=True)
        self._init_youtube_client()

    def _init_youtube_client(self):
        """Build the YouTube API client using the current key."""
        if self._api_keys:
            self.youtube = build(
                'youtube', 'v3',
                developerKey=self._api_keys[self._current_key_index],
            )
        else:
            self.youtube = None

    def get_platform_name(self) -> str:
        return "youtube"

    def _get_quota_key(self) -> str:
        today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
        return f"youtube:quota:{today}:{self._current_key_index}"

    def _get_quota_used(self) -> int:
        return int(self.redis_sync.get(self._get_quota_key()) or 0)

    def _increment_quota(self, cost: int):
        key = self._get_quota_key()
        self.redis_sync.incrby(key, cost)
        self.redis_sync.expire(key, 86400 * 2)  # Keep for 2 days

    def _is_quota_available(self, needed: int) -> bool:
        return self._get_quota_used() + needed <= (self.DAILY_QUOTA_LIMIT - self.QUOTA_SAFETY_MARGIN)

    def _rotate_api_key(self) -> bool:
        """Try to switch to the next API key that still has quota available.

        Returns True if a new key was selected, False if all keys are exhausted.
        """
        original_index = self._current_key_index
        for i in range(1, len(self._api_keys)):
            candidate = (original_index + i) % len(self._api_keys)
            # Temporarily set the index so _get_quota_key() uses the right key
            self._current_key_index = candidate
            if self._is_quota_available(self.SEARCH_QUOTA_COST):
                logger.info(f"YouTube: rotated to API key index {candidate}")
                self._init_youtube_client()
                return True
        # Restore original index — all keys are exhausted
        self._current_key_index = original_index
        logger.error("YouTube: all API keys have exhausted their daily quota")
        return False

    def _get_processed_videos_key(self, keyword: str) -> str:
        return f"youtube:processed_videos:{keyword.lower().replace(' ', '_')}"

    def _is_video_processed(self, keyword: str, video_id: str) -> bool:
        return bool(self.redis_sync.sismember(self._get_processed_videos_key(keyword), video_id))

    def _mark_video_processed(self, keyword: str, video_id: str):
        key = self._get_processed_videos_key(keyword)
        self.redis_sync.sadd(key, video_id)
        self.redis_sync.expire(key, 86400 * 7)  # Keep processed list for 7 days

    def collect(self, keyword: str, since: datetime) -> list[CollectedPost]:
        posts = []

        if not self._api_keys:
            logger.warning("YouTube API key not configured, skipping YouTube collection")
            return posts

        # Check quota; try rotating keys if the current one is exhausted
        if not self._is_quota_available(self.SEARCH_QUOTA_COST):
            logger.warning(
                f"YouTube quota nearly exhausted for key index {self._current_key_index} "
                f"({self._get_quota_used()} used); attempting key rotation"
            )
            if not self._rotate_api_key():
                return posts

        try:
            posts = self._collect_with_current_key(keyword, since)
        except HttpError as e:
            # If quota is exceeded for the current key, attempt to rotate and retry once
            if e.resp.status == 403 and "quotaExceeded" in str(e):
                logger.warning(
                    f"YouTube quota exceeded for key index {self._current_key_index}; "
                    "attempting key rotation"
                )
                if self._rotate_api_key():
                    try:
                        posts = self._collect_with_current_key(keyword, since)
                    except HttpError as retry_e:
                        logger.error(f"YouTube API HTTP error after key rotation: {retry_e}")
                    except Exception as retry_e:
                        logger.error(f"YouTube collector error after key rotation: {retry_e}")
            else:
                logger.error(f"YouTube API HTTP error: {e}")
        except Exception as e:
            logger.error(f"YouTube collector error: {e}")

        return posts

    def _collect_with_current_key(self, keyword: str, since: datetime) -> list[CollectedPost]:
        """Run the YouTube search and comment collection using the currently active API key."""
        posts = []
        published_after = since.strftime('%Y-%m-%dT%H:%M:%SZ')
        search_response = self.youtube.search().list(
            q=keyword,
            type='video',
            order='date',
            maxResults=50,
            publishedAfter=published_after,
            relevanceLanguage='en',
        ).execute()
        self._increment_quota(self.SEARCH_QUOTA_COST)

        video_items = search_response.get('items', [])
        logger.info(f"YouTube: found {len(video_items)} videos for keyword '{keyword}'")

        for item in video_items:
            video_id = item['id'].get('videoId')
            if not video_id:
                continue
            if self._is_video_processed(keyword, video_id):
                continue
            if not self._is_quota_available(self.COMMENT_THREADS_QUOTA_COST):
                logger.warning("YouTube quota limit approaching, stopping comment collection")
                break

            comments = self._fetch_comments(video_id)
            video_url = f"https://www.youtube.com/watch?v={video_id}"

            for comment in comments:
                snippet = comment['snippet']['topLevelComment']['snippet']
                post = CollectedPost(
                    platform="youtube",
                    post_id=comment['id'],
                    author_id=snippet.get('authorChannelId', {}).get('value', 'unknown'),
                    author_name=snippet.get('authorDisplayName', 'Unknown'),
                    # YouTube API does not expose subscriber count in comment threads; defaulting to 0
                    followers_count=0,
                    content=snippet.get('textOriginal', ''),
                    posted_at=datetime.fromisoformat(
                        snippet['publishedAt'].replace('Z', '+00:00')
                    ).replace(tzinfo=None),
                    url=video_url,
                    likes_count=snippet.get('likeCount', 0),
                    raw_data=comment,
                )
                posts.append(post)

            self._mark_video_processed(keyword, video_id)

        return posts

    def _fetch_comments(self, video_id: str) -> list[dict]:
        comments = []
        try:
            response = self.youtube.commentThreads().list(
                videoId=video_id,
                maxResults=100,
                order='relevance',
                textFormat='plainText',
            ).execute()
            self._increment_quota(self.COMMENT_THREADS_QUOTA_COST)
            comments = response.get('items', [])
        except HttpError as e:
            if e.resp.status == 403:
                logger.warning(f"Comments disabled for video {video_id}")
            else:
                logger.error(f"Error fetching comments for {video_id}: {e}")
        return comments
