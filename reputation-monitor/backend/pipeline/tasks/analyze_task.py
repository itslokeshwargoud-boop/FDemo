"""
Analysis tasks: sentiment analysis, Redis live publishing, stats broadcast.
"""
import asyncio
import logging
import json
import uuid
from datetime import datetime, timedelta
from celery import shared_task
from sqlalchemy import select, func
from database.connection import AsyncSessionLocal
from models.sentiment_result import SentimentResult
from models.keyword import Keyword
from models.post import Post
from ml.sentiment_engine import SentimentEngine
from ml.reputation_scorer import calculate_reputation_score
import redis.asyncio as aioredis
from core.config import settings

logger = logging.getLogger(__name__)


@shared_task(name='pipeline.tasks.analyze_task.analyze_posts', bind=True, max_retries=3)
def analyze_posts(self, keyword_id: str, keyword: str, posts_data: list[dict]):
    asyncio.run(_analyze_posts_async(keyword_id, keyword, posts_data))


async def _analyze_posts_async(keyword_id: str, keyword: str, posts_data: list[dict]):
    engine = SentimentEngine.get_instance()
    texts = [p['content_for_analysis'] for p in posts_data]

    try:
        sentiments = engine.analyze_batch(texts)
    except Exception as e:
        logger.error(f"Sentiment analysis failed: {e}")
        return

    redis_client = aioredis.from_url(settings.REDIS_URL)

    async with AsyncSessionLocal() as db:
        for post_data, sentiment_result in zip(posts_data, sentiments):
            try:
                result = SentimentResult(
                    id=uuid.uuid4(),
                    post_id=uuid.UUID(post_data['db_post_id']),
                    sentiment=sentiment_result['sentiment'],
                    confidence=sentiment_result['confidence'],
                )
                db.add(result)

                # Publish to Redis for live feed
                await redis_client.publish(
                    f"live:{keyword.lower().replace(' ', '_')}",
                    json.dumps({
                        "event": "new_post",
                        "keyword": keyword,
                        "data": {
                            "platform": post_data['platform'],
                            "author_name": post_data['author_name'],
                            "content": post_data['content'][:500],  # Truncate for live feed
                            "url": post_data['url'],
                            "posted_at": post_data['posted_at'],
                            "sentiment": sentiment_result['sentiment'],
                            "confidence": sentiment_result['confidence'],
                            "followers_count": post_data['followers_count'],
                            "likes_count": post_data.get('likes_count', 0),
                            "is_flagged_author": False,  # Updated by detection task
                        }
                    })
                )
            except Exception as e:
                logger.error(f"Error saving sentiment for post {post_data.get('db_post_id')}: {e}")

        await db.commit()

    await redis_client.aclose()

    # Chain to detection task
    from pipeline.tasks.detection_task import run_detection
    run_detection.delay(keyword_id, keyword)


@shared_task(name='pipeline.tasks.analyze_task.broadcast_stats_for_all_keywords', bind=True)
def broadcast_stats_for_all_keywords(self):
    asyncio.run(_broadcast_stats_async())


async def _broadcast_stats_async():
    redis_client = aioredis.from_url(settings.REDIS_URL)

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Keyword).where(Keyword.is_active.is_(True)))
        keywords = result.scalars().all()

    for keyword in keywords:
        try:
            await _broadcast_stats_for_keyword(redis_client, keyword)
        except Exception as e:
            logger.error(f"Error broadcasting stats for keyword {keyword.keyword}: {e}")

    await redis_client.aclose()


async def _broadcast_stats_for_keyword(redis_client, keyword):
    one_hour_ago = datetime.utcnow() - timedelta(hours=1)

    async with AsyncSessionLocal() as db:
        # Get sentiment counts for last hour
        result = await db.execute(
            select(SentimentResult.sentiment, func.count(SentimentResult.id))
            .join(Post, Post.id == SentimentResult.post_id)
            .where(Post.keyword_id == keyword.id, Post.posted_at >= one_hour_ago)
            .group_by(SentimentResult.sentiment)
        )
        counts = {row[0]: row[1] for row in result.fetchall()}

    positive = counts.get('positive', 0)
    negative = counts.get('negative', 0)
    neutral = counts.get('neutral', 0)
    score_data = calculate_reputation_score(positive, negative, neutral)

    channel = f"live:{keyword.keyword.lower().replace(' ', '_')}"
    await redis_client.publish(channel, json.dumps({
        "event": "stats_update",
        "data": {
            "positive_count": positive,
            "negative_count": negative,
            "neutral_count": neutral,
            "reputation_score": score_data['score'],
            "negative_ratio": score_data['negative_ratio'],
            "risk_level": score_data['risk_level'],
            "total_last_hour": positive + negative + neutral,
        }
    }))


@shared_task(name='pipeline.tasks.analyze_task.compute_daily_scores', bind=True)
def compute_daily_scores(self):
    asyncio.run(_compute_daily_scores_async())


async def _compute_daily_scores_async():
    from models.reputation_score import ReputationScore

    async with AsyncSessionLocal() as db:
        result = await db.execute(select(Keyword).where(Keyword.is_active.is_(True)))
        keywords = result.scalars().all()

        for keyword in keywords:
            try:
                # Count sentiments for this keyword
                result = await db.execute(
                    select(SentimentResult.sentiment, func.count(SentimentResult.id))
                    .join(Post, Post.id == SentimentResult.post_id)
                    .where(Post.keyword_id == keyword.id)
                    .group_by(SentimentResult.sentiment)
                )
                counts = {row[0]: row[1] for row in result.fetchall()}
                positive = counts.get('positive', 0)
                negative = counts.get('negative', 0)
                neutral = counts.get('neutral', 0)

                score_data = calculate_reputation_score(positive, negative, neutral)

                score = ReputationScore(
                    id=uuid.uuid4(),
                    keyword_id=keyword.id,
                    score=score_data['score'],
                    positive_count=positive,
                    negative_count=negative,
                    neutral_count=neutral,
                    total_count=positive + negative + neutral,
                    negative_ratio=score_data['negative_ratio'],
                    risk_level=score_data['risk_level'],
                )
                db.add(score)
            except Exception as e:
                logger.error(f"Error computing score for keyword {keyword.keyword}: {e}")

        await db.commit()
