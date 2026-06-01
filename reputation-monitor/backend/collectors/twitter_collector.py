# Requires X API Basic Plan (~$100/month). Search recent tweets limited to last 7 days.

import time
import logging
from datetime import datetime, timezone

import tweepy
import tweepy.errors
import redis

from core.config import settings
from collectors.base_collector import BaseCollector, CollectedPost

logger = logging.getLogger(__name__)

# Maximum requests allowed per 15-minute window on the Basic plan
_RATE_LIMIT_REQUESTS = 450
_WINDOW_SECONDS = 900  # 15 minutes


class TwitterCollector(BaseCollector):
    def __init__(self):
        super().__init__()
        self._bearer_tokens = settings.get_twitter_bearer_tokens()
        self._current_token_index = 0
        self.redis_sync = redis.from_url(settings.REDIS_URL, decode_responses=True)
        self._init_twitter_client()

    def _init_twitter_client(self):
        """Create a Tweepy client using the current bearer token."""
        if self._bearer_tokens:
            self.client = tweepy.Client(
                bearer_token=self._bearer_tokens[self._current_token_index],
                wait_on_rate_limit=False,
            )
        else:
            self.client = None

    def get_platform_name(self) -> str:
        return "twitter"

    # ------------------------------------------------------------------
    # Rate-limit helpers
    # ------------------------------------------------------------------

    def _rate_limit_key(self) -> str:
        """Redis key bucketed to the current 15-minute window for the active token."""
        window = int(time.time()) // _WINDOW_SECONDS
        return f"twitter:requests:{window}:{self._current_token_index}"

    def _get_requests_used(self) -> int:
        return int(self.redis_sync.get(self._rate_limit_key()) or 0)

    def _increment_requests(self):
        key = self._rate_limit_key()
        self.redis_sync.incr(key)
        self.redis_sync.expire(key, _WINDOW_SECONDS * 2)

    def _is_rate_limit_available(self) -> bool:
        return self._get_requests_used() < _RATE_LIMIT_REQUESTS

    def _rotate_bearer_token(self) -> bool:
        """Try to switch to the next bearer token that still has rate-limit headroom.

        Returns True if a new token was selected, False if all tokens are exhausted.
        """
        original_index = self._current_token_index
        for i in range(1, len(self._bearer_tokens)):
            candidate = (original_index + i) % len(self._bearer_tokens)
            # Temporarily set the index so _rate_limit_key() uses the right token
            self._current_token_index = candidate
            if self._is_rate_limit_available():
                logger.info(f"Twitter: rotated to bearer token index {candidate}")
                self._init_twitter_client()
                return True
        # Restore original index — all tokens are exhausted
        self._current_token_index = original_index
        logger.error("Twitter: all bearer tokens have hit their rate limit")
        return False

    # ------------------------------------------------------------------
    # Exponential backoff wrapper
    # ------------------------------------------------------------------

    def _search_with_backoff(self, **kwargs):
        """Call search_recent_tweets, rotating to the next token on TooManyRequests."""
        wait_times = [60, 120, 240]
        for attempt, wait in enumerate(wait_times, start=1):
            try:
                return self.client.search_recent_tweets(**kwargs)
            except tweepy.errors.TooManyRequests:
                # Try rotating to another token before falling back to timed waits
                if self._rotate_bearer_token():
                    logger.info("Twitter: retrying with rotated bearer token")
                    continue
                if attempt == len(wait_times):
                    logger.error("Twitter rate limit hit after all retries; giving up")
                    raise
                logger.warning(
                    f"Twitter rate limit hit (attempt {attempt}), waiting {wait}s before retry"
                )
                time.sleep(wait)
        return None  # unreachable

    # ------------------------------------------------------------------
    # Main collect
    # ------------------------------------------------------------------

    def collect(self, keyword: str, since: datetime) -> list[CollectedPost]:
        if not self._bearer_tokens:
            logger.warning("Twitter bearer token not configured, skipping Twitter collection")
            return []

        if not self._is_rate_limit_available():
            logger.warning(
                f"Twitter rate limit window exhausted for token index {self._current_token_index} "
                f"({self._get_requests_used()} requests used); attempting token rotation"
            )
            if not self._rotate_bearer_token():
                return []

        posts: list[CollectedPost] = []

        query = f'"{keyword}" lang:en -is:retweet'

        try:
            self._increment_requests()
            response = self._search_with_backoff(
                query=query,
                tweet_fields=["author_id", "created_at", "public_metrics", "entities", "lang"],
                user_fields=["name", "username", "public_metrics", "created_at"],
                expansions=["author_id"],
                max_results=100,
                start_time=since.replace(tzinfo=timezone.utc) if since.tzinfo is None else since,
            )
        except tweepy.errors.TooManyRequests:
            logger.error("Twitter rate limit exceeded; aborting collection")
            return posts
        except tweepy.errors.TwitterServerError as e:
            logger.error(f"Twitter server error: {e}")
            return posts
        except Exception as e:
            logger.error(f"Twitter collector error: {e}")
            return posts

        if not response or not response.data:
            logger.info(f"Twitter: no tweets found for keyword '{keyword}'")
            return posts

        # Build a lookup map from user ID → user object
        users_by_id: dict[str, tweepy.User] = {}
        if response.includes and "users" in response.includes:
            for user in response.includes["users"]:
                users_by_id[str(user.id)] = user

        for tweet in response.data:
            author_id = str(tweet.author_id)
            user = users_by_id.get(author_id)
            author_name = user.username if user else author_id
            followers_count = (
                user.public_metrics["followers_count"]
                if user and user.public_metrics
                else 0
            )

            # Normalise posted_at to naive UTC
            posted_at = tweet.created_at
            if posted_at and posted_at.tzinfo is not None:
                posted_at = posted_at.replace(tzinfo=None)

            public_metrics = tweet.public_metrics or {}
            post = CollectedPost(
                platform="twitter",
                post_id=str(tweet.id),
                author_id=author_id,
                author_name=author_name,
                followers_count=followers_count,
                content=tweet.text,
                posted_at=posted_at or datetime.now(timezone.utc).replace(tzinfo=None),
                url=f"https://twitter.com/i/web/status/{tweet.id}",
                likes_count=public_metrics.get("like_count", 0),
                replies_count=public_metrics.get("reply_count", 0),
                shares_count=public_metrics.get("retweet_count", 0),
                language=tweet.lang or "en",
                raw_data={
                    "public_metrics": public_metrics,
                    "entities": tweet.entities,
                },
            )
            posts.append(post)

        logger.info(f"Twitter: collected {len(posts)} tweets for keyword '{keyword}'")
        return posts
