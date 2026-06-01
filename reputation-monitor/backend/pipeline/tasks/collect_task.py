"""
Collection tasks: fetch posts from all platforms for all active keywords.
Pipeline: collect_task → process_task → analyze_task → detection_task
"""
import asyncio
import logging
from datetime import datetime, timedelta
from celery import shared_task
from sqlalchemy import select
from database.connection import AsyncSessionLocal
from models.keyword import Keyword
from collectors.collector_factory import get_all_collectors
from pipeline.tasks.process_task import process_posts

logger = logging.getLogger(__name__)


@shared_task(name='pipeline.tasks.collect_task.collect_all_active_keywords', bind=True, max_retries=3)
def collect_all_active_keywords(self):
    """Collect posts for all active keywords from all platforms."""
    asyncio.run(_collect_all_active_keywords_async(self))


async def _collect_all_active_keywords_async(task):
    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Keyword).where(Keyword.is_active.is_(True)))
        keywords = result.scalars().all()

    logger.info(f"Starting collection for {len(keywords)} active keywords")

    for keyword in keywords:
        collect_keyword.delay(str(keyword.id), keyword.keyword)


@shared_task(name='pipeline.tasks.collect_task.collect_keyword', bind=True, max_retries=3)
def collect_keyword(self, keyword_id: str, keyword: str):
    """Collect posts for a single keyword from all platforms."""
    asyncio.run(_collect_keyword_async(self, keyword_id, keyword))


async def _collect_keyword_async(task, keyword_id: str, keyword: str):
    since = datetime.utcnow() - timedelta(hours=24)
    collectors = get_all_collectors()
    all_posts = []

    for collector in collectors:
        try:
            posts = collector.collect(keyword, since)
            logger.info(f"Collected {len(posts)} posts from {collector.get_platform_name()} for '{keyword}'")
            all_posts.extend(posts)
        except Exception as e:
            logger.error(f"Error collecting from {collector.get_platform_name()}: {e}")

    if all_posts:
        # Convert dataclasses to dicts for Celery serialization
        posts_data = [
            {
                "platform": p.platform,
                "post_id": p.post_id,
                "author_id": p.author_id,
                "author_name": p.author_name,
                "followers_count": p.followers_count,
                "content": p.content,
                "posted_at": p.posted_at.isoformat(),
                "url": p.url,
                "likes_count": p.likes_count,
                "replies_count": p.replies_count,
                "shares_count": p.shares_count,
                "language": p.language,
                "raw_data": {},
            }
            for p in all_posts
        ]
        process_posts.delay(keyword_id, keyword, posts_data)
