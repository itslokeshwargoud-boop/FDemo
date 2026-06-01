"""Tests for AttackDetector and ReputationScorer."""
import pytest
import sys
import os
from datetime import datetime, timedelta

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))


class TestAttackDetector:
    def setup_method(self):
        from ml.attack_detector import AttackDetector
        self.detector = AttackDetector()

    def test_low_followers_raises_risk_score(self):
        author = {"followers_count": 10}
        score = self.detector.calculate_user_risk_score(author, 0)
        assert score >= 20

    def test_new_account_raises_risk_score(self):
        author = {
            "followers_count": 1000,
            "account_created_at": datetime.utcnow() - timedelta(days=5),
        }
        score = self.detector.calculate_user_risk_score(author, 0)
        assert score >= 20

    def test_multiple_negative_posts_raises_risk(self):
        author = {"followers_count": 1000}
        score = self.detector.calculate_user_risk_score(author, 5)
        assert score > 0

    def test_risk_score_capped_at_100(self):
        author = {
            "followers_count": 10,
            "account_created_at": datetime.utcnow() - timedelta(days=1),
        }
        score = self.detector.calculate_user_risk_score(author, 100)
        assert score == 100.0

    def test_safe_user_has_zero_risk(self):
        author = {
            "followers_count": 10000,
            "account_created_at": datetime.utcnow() - timedelta(days=365),
        }
        score = self.detector.calculate_user_risk_score(author, 0)
        assert score == 0.0

    def test_detect_clusters_empty_posts(self):
        clusters = self.detector.detect_coordinated_clusters([])
        assert clusters == []

    def test_detect_clusters_same_author_ignored(self):
        posts = [
            {"author_id": "user1", "sentiment": "negative", "content": "bad product", "posted_at": datetime.utcnow()},
            {"author_id": "user1", "sentiment": "negative", "content": "terrible service", "posted_at": datetime.utcnow()},
        ]
        clusters = self.detector.detect_coordinated_clusters(posts)
        assert clusters == []

    def test_detect_similar_posts_cluster(self):
        now = datetime.utcnow()
        posts = [
            {"author_id": f"user{i}", "sentiment": "negative", "content": "this product is absolutely terrible and I hate it", "posted_at": now}
            for i in range(4)
        ]
        clusters = self.detector.detect_coordinated_clusters(posts, min_cluster_size=3)
        assert len(clusters) >= 1

    def test_dissimilar_posts_no_cluster(self):
        now = datetime.utcnow()
        posts = [
            {"author_id": "user1", "sentiment": "negative", "content": "The product quality is terrible", "posted_at": now},
            {"author_id": "user2", "sentiment": "negative", "content": "I love hiking in the mountains on sunny days", "posted_at": now + timedelta(hours=2)},
            {"author_id": "user3", "sentiment": "negative", "content": "Python programming is fun and rewarding", "posted_at": now + timedelta(hours=4)},
        ]
        clusters = self.detector.detect_coordinated_clusters(posts, min_cluster_size=3)
        assert clusters == []


class TestReputationScorer:
    def setup_method(self):
        from ml.reputation_scorer import calculate_reputation_score
        self.scorer = calculate_reputation_score

    def test_all_positive_returns_100(self):
        result = self.scorer(100, 0, 0)
        assert result["score"] == 100.0

    def test_all_negative_returns_minus_100(self):
        result = self.scorer(0, 100, 0)
        assert result["score"] == -100.0

    def test_empty_returns_zero(self):
        result = self.scorer(0, 0, 0)
        assert result["score"] == 0.0
        assert result["risk_level"] == "low"

    def test_neutral_weighted_half(self):
        # 0 positive, 0 negative, 100 neutral → weighted_positive = 50, score = (50-0)/100*100 = 50
        result = self.scorer(0, 0, 100)
        assert result["score"] == 50.0

    def test_risk_level_low(self):
        result = self.scorer(90, 5, 5)
        assert result["risk_level"] == "low"

    def test_risk_level_moderate(self):
        result = self.scorer(60, 30, 10)
        assert result["risk_level"] == "moderate"

    def test_risk_level_high(self):
        result = self.scorer(20, 60, 20)
        assert result["risk_level"] == "high"

    def test_negative_ratio_calculation(self):
        result = self.scorer(50, 25, 25)
        assert result["negative_ratio"] == 25.0

    def test_score_clamped_between_minus100_and_100(self):
        result = self.scorer(1000, 0, 0)
        assert -100 <= result["score"] <= 100
