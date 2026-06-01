"""Tests for data collectors (mocked API calls)."""
import pytest
import sys
import os
from datetime import datetime
from unittest.mock import MagicMock, patch

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))


class TestCollectedPost:
    def test_dataclass_defaults(self):
        from collectors.base_collector import CollectedPost
        post = CollectedPost(
            platform="youtube",
            post_id="abc123",
            author_id="user1",
            author_name="Test User",
            followers_count=100,
            content="Test content",
            posted_at=datetime.utcnow(),
            url="https://youtube.com/watch?v=abc",
        )
        assert post.likes_count == 0
        assert post.replies_count == 0
        assert post.shares_count == 0
        assert post.language == 'en'
        assert isinstance(post.raw_data, dict)

    def test_dataclass_platform_values(self):
        from collectors.base_collector import CollectedPost
        for platform in ["youtube", "twitter", "instagram"]:
            post = CollectedPost(
                platform=platform, post_id="x", author_id="y", author_name="z",
                followers_count=0, content="c", posted_at=datetime.utcnow(), url="u"
            )
            assert post.platform == platform


class TestInstagramCollector:
    def test_get_platform_name(self):
        from collectors.instagram_collector import InstagramCollector
        with patch.object(InstagramCollector, '__init__', lambda self: None):
            collector = InstagramCollector.__new__(InstagramCollector)
            collector._client = None
        assert collector.get_platform_name() == "instagram"

    def test_collect_returns_empty_when_no_client(self):
        from collectors.instagram_collector import InstagramCollector
        with patch.object(InstagramCollector, '__init__', lambda self: None):
            collector = InstagramCollector.__new__(InstagramCollector)
            collector._client = None
        posts = collector.collect("test keyword", datetime(2024, 1, 1))
        assert posts == []


class TestCollectorFactory:
    def test_get_collector_youtube(self):
        from collectors.collector_factory import get_collector
        with patch('collectors.collector_factory.YouTubeCollector') as mock_yt:
            import collectors.collector_factory as cf
            cf._collectors = {}
            collector = cf.get_collector("youtube")
            assert mock_yt.called

    def test_get_collector_twitter(self):
        from collectors.collector_factory import get_collector
        with patch('collectors.collector_factory.TwitterCollector') as mock_tw:
            import collectors.collector_factory as cf
            cf._collectors = {}
            collector = cf.get_collector("twitter")
            assert mock_tw.called

    def test_get_collector_instagram(self):
        from collectors.collector_factory import get_collector
        with patch('collectors.collector_factory.InstagramCollector') as mock_ig:
            import collectors.collector_factory as cf
            cf._collectors = {}
            collector = cf.get_collector("instagram")
            assert mock_ig.called

    def test_reddit_platform_raises(self):
        import collectors.collector_factory as cf
        cf._collectors = {}
        with pytest.raises(ValueError, match="Unknown platform"):
            cf.get_collector("reddit")

    def test_news_platform_raises(self):
        import collectors.collector_factory as cf
        cf._collectors = {}
        with pytest.raises(ValueError, match="Unknown platform"):
            cf.get_collector("news")

    def test_unknown_platform_raises(self):
        import collectors.collector_factory as cf
        cf._collectors = {}
        with pytest.raises(ValueError, match="Unknown platform"):
            cf.get_collector("tiktok")

    def test_get_all_collectors_returns_three(self):
        import collectors.collector_factory as cf
        with patch('collectors.collector_factory.YouTubeCollector'), \
             patch('collectors.collector_factory.TwitterCollector'), \
             patch('collectors.collector_factory.InstagramCollector'):
            cf._collectors = {}
            collectors = cf.get_all_collectors()
            assert len(collectors) == 3


class TestProcessTask:
    def test_normalize_text(self):
        from pipeline.tasks.process_task import normalize_text
        result = normalize_text("  Hello   WORLD  \n")
        assert result == "hello world"

    def test_normalize_unicode(self):
        from pipeline.tasks.process_task import normalize_text
        result = normalize_text("café")
        assert isinstance(result, str)

