"""
Alert manager: checks thresholds and triggers email/Telegram alerts.

Alert types:
- negative_spike: Negative ratio > 40% in last 2 hours
- attack_detected: New cluster >= 3 accounts
- viral_negative: Single post > 1,000 likes + negative
- high_risk_author_active: Known flagged author posts new content
"""
import logging
import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy import select, func
from database.connection import AsyncSessionLocal
from models.post import Post
from models.sentiment_result import SentimentResult
from models.alert import Alert
from models.tracked_author import TrackedAuthor
from models.attack_cluster import AttackCluster
from core.config import settings

logger = logging.getLogger(__name__)


class AlertManager:
    def __init__(self):
        from alerts.email_alert import EmailAlert
        from alerts.telegram_alert import TelegramAlert
        self.email_alert = EmailAlert()
        self.telegram_alert = TelegramAlert()

    async def check_and_trigger_alerts(self, keyword_id: str, keyword: str, posts: list[dict]):
        kid = uuid.UUID(keyword_id)

        await self._check_negative_spike(kid, keyword)
        await self._check_attack_clusters(kid, keyword)
        await self._check_viral_negative(kid, keyword, posts)
        await self._check_high_risk_authors(kid, keyword, posts)

    async def _check_negative_spike(self, keyword_id, keyword: str):
        two_hours_ago = datetime.now(timezone.utc) - timedelta(hours=2)

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(SentimentResult.sentiment, func.count(SentimentResult.id))
                .join(Post, Post.id == SentimentResult.post_id)
                .where(Post.keyword_id == keyword_id, Post.posted_at >= two_hours_ago)
                .group_by(SentimentResult.sentiment)
            )
            counts = {row[0]: row[1] for row in result.fetchall()}

        total = sum(counts.values())
        negative = counts.get('negative', 0)
        if total > 0 and (negative / total * 100) > settings.NEGATIVE_SPIKE_THRESHOLD:
            ratio = round(negative / total * 100, 1)
            await self._create_and_send_alert(
                keyword_id=keyword_id,
                keyword=keyword,
                alert_type='negative_spike',
                message=f"Negative ratio spiked to {ratio}% in the last 2 hours for keyword '{keyword}'",
            )

    async def _check_attack_clusters(self, keyword_id, keyword: str):
        fifteen_min_ago = datetime.now(timezone.utc) - timedelta(minutes=15)

        async with AsyncSessionLocal() as db:
            result = await db.execute(
                select(AttackCluster)
                .where(
                    AttackCluster.keyword_id == keyword_id,
                    AttackCluster.detected_at >= fifteen_min_ago,
                    AttackCluster.cluster_size >= settings.MIN_CLUSTER_SIZE,
                )
            )
            new_clusters = result.scalars().all()

        for cluster in new_clusters:
            await self._create_and_send_alert(
                keyword_id=keyword_id,
                keyword=keyword,
                alert_type='attack_detected',
                message=f"Coordinated attack detected: {cluster.cluster_size} accounts acting together for keyword '{keyword}'",
            )

    async def _check_viral_negative(self, keyword_id, keyword: str, posts: list[dict]):
        for post in posts:
            if post.get('sentiment') == 'negative' and post.get('likes_count', 0) > 1000:
                await self._create_and_send_alert(
                    keyword_id=keyword_id,
                    keyword=keyword,
                    alert_type='viral_negative',
                    message=f"Viral negative post detected with {post['likes_count']} likes for keyword '{keyword}'",
                    evidence_url=post.get('url'),
                )

    async def _check_high_risk_authors(self, keyword_id, keyword: str, posts: list[dict]):
        async with AsyncSessionLocal() as db:
            for post in posts:
                result = await db.execute(
                    select(TrackedAuthor).where(
                        TrackedAuthor.platform == post['platform'],
                        TrackedAuthor.author_id == post['author_id'],
                    TrackedAuthor.is_flagged.is_(True),
                    )
                )
                flagged_author = result.scalar_one_or_none()
                if flagged_author:
                    await self._create_and_send_alert(
                        keyword_id=keyword_id,
                        keyword=keyword,
                        alert_type='high_risk_author_active',
                        message=f"High-risk author '{post['author_name']}' posted new content about '{keyword}' (risk score: {flagged_author.risk_score:.1f})",
                        evidence_url=post.get('url'),
                    )

    async def _create_and_send_alert(
        self,
        keyword_id,
        keyword: str,
        alert_type: str,
        message: str,
        evidence_url: str | None = None,
    ):
        sent_via = []

        try:
            await self.email_alert.send(
                subject=f"[RepMonitor] {alert_type.replace('_', ' ').title()}: {keyword}",
                body=message,
            )
            sent_via.append('email')
        except Exception as e:
            logger.warning(f"Email alert failed: {e}")

        try:
            await self.telegram_alert.send(message=f"🚨 {message}")
            sent_via.append('telegram')
        except Exception as e:
            logger.warning(f"Telegram alert failed: {e}")

        async with AsyncSessionLocal() as db:
            alert = Alert(
                id=uuid.uuid4(),
                keyword_id=keyword_id,
                alert_type=alert_type,
                message=message,
                evidence_url=evidence_url,
                sent_via=sent_via,
            )
            db.add(alert)
            await db.commit()

        logger.info(f"Alert created: {alert_type} for keyword '{keyword}' - sent via {sent_via}")
