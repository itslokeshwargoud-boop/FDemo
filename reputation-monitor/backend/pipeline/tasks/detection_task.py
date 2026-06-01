"""
Detection tasks: risk scoring, coordinated attack cluster detection, DB writes, alert triggering.
"""
import asyncio
import logging
import uuid
from datetime import datetime, timezone, timedelta
from celery import shared_task
from sqlalchemy import select
from database.connection import AsyncSessionLocal
from models.post import Post
from models.sentiment_result import SentimentResult
from models.tracked_author import TrackedAuthor
from models.attack_cluster import AttackCluster
from ml.attack_detector import AttackDetector
from core.config import settings

logger = logging.getLogger(__name__)
detector = AttackDetector()


@shared_task(name='pipeline.tasks.detection_task.run_detection', bind=True, max_retries=2)
def run_detection(self, keyword_id: str, keyword: str):
    asyncio.run(_run_detection_async(keyword_id, keyword))


async def _run_detection_async(keyword_id: str, keyword: str):
    kid = uuid.UUID(keyword_id)
    since_24h = datetime.now(timezone.utc) - timedelta(hours=24)

    async with AsyncSessionLocal() as db:
        # Fetch recent posts with sentiment
        result = await db.execute(
            select(Post, SentimentResult)
            .join(SentimentResult, SentimentResult.post_id == Post.id)
            .where(Post.keyword_id == kid, Post.posted_at >= since_24h)
        )
        rows = result.fetchall()

        posts_with_sentiment = [
            {
                "id": str(row.Post.id),
                "platform": row.Post.platform,
                "author_id": row.Post.author_id,
                "author_name": row.Post.author_name,
                "followers_count": row.Post.followers_count,
                "content": row.Post.content,
                "posted_at": row.Post.posted_at,
                "url": row.Post.url,
                "likes_count": row.Post.likes_count,
                "sentiment": row.SentimentResult.sentiment,
                "confidence": row.SentimentResult.confidence,
            }
            for row in rows
        ]

    # Group by author and count negatives
    author_negatives: dict[str, int] = {}
    for post in posts_with_sentiment:
        if post['sentiment'] == 'negative':
            author_negatives[post['author_id']] = author_negatives.get(post['author_id'], 0) + 1

    # Update tracked authors + risk scores
    async with AsyncSessionLocal() as db:
        for post in posts_with_sentiment:
            author_id = post['author_id']
            negative_count = author_negatives.get(author_id, 0)

            # Upsert tracked author
            result = await db.execute(
                select(TrackedAuthor).where(
                    TrackedAuthor.platform == post['platform'],
                    TrackedAuthor.author_id == author_id
                )
            )
            author_row = result.scalar_one_or_none()

            author_dict = {
                'followers_count': post['followers_count'],
                'account_created_at': None,  # Not always available
            }
            risk_score = detector.calculate_user_risk_score(author_dict, negative_count)

            if author_row:
                author_row.negative_post_count = negative_count
                author_row.risk_score = risk_score
                author_row.is_flagged = risk_score >= 30
                author_row.last_seen_at = datetime.now(timezone.utc)
                author_row.followers_count = post['followers_count']
            else:
                new_author = TrackedAuthor(
                    id=uuid.uuid4(),
                    platform=post['platform'],
                    author_id=author_id,
                    author_name=post['author_name'],
                    followers_count=post['followers_count'],
                    negative_post_count=negative_count,
                    risk_score=risk_score,
                    is_flagged=risk_score >= 30,
                    last_seen_at=datetime.now(timezone.utc),
                )
                db.add(new_author)

        await db.commit()

    # Cluster detection
    clusters = detector.detect_coordinated_clusters(posts_with_sentiment, settings.MIN_CLUSTER_SIZE)

    if clusters:
        async with AsyncSessionLocal() as db:
            for cluster_members in clusters:
                cluster = AttackCluster(
                    id=uuid.uuid4(),
                    keyword_id=kid,
                    cluster_size=len(cluster_members),
                    confidence_score=0.7,  # Base confidence; refined scoring can be added
                    member_ids=cluster_members,
                    description=f"Coordinated negative campaign detected: {len(cluster_members)} accounts",
                )
                db.add(cluster)
            await db.commit()

        logger.info(f"Saved {len(clusters)} attack clusters for keyword {keyword}")

    # Trigger alert checks
    from alerts.alert_manager import AlertManager
    manager = AlertManager()
    await manager.check_and_trigger_alerts(keyword_id, keyword, posts_with_sentiment)
