"""Tests for the SentimentEngine ML component."""
import pytest
import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

from unittest.mock import MagicMock, patch


def test_label_map_completeness():
    """All 3 labels must be mapped."""
    from ml.sentiment_engine import SentimentEngine
    assert set(SentimentEngine.LABEL_MAP.values()) == {"positive", "negative", "neutral"}


def test_analyze_batch_empty():
    """Empty input returns empty output."""
    from ml.sentiment_engine import SentimentEngine
    engine = SentimentEngine.__new__(SentimentEngine)
    engine.classifier = MagicMock(return_value=[])
    result = engine.analyze_batch([])
    assert result == []


def test_analyze_batch_maps_labels():
    """LABEL_0 → negative, LABEL_1 → neutral, LABEL_2 → positive."""
    from ml.sentiment_engine import SentimentEngine
    engine = SentimentEngine.__new__(SentimentEngine)
    engine.classifier = MagicMock(return_value=[
        {"label": "LABEL_0", "score": 0.95},
        {"label": "LABEL_1", "score": 0.80},
        {"label": "LABEL_2", "score": 0.72},
    ])
    results = engine.analyze_batch(["text1", "text2", "text3"])
    assert results[0]["sentiment"] == "negative"
    assert results[1]["sentiment"] == "neutral"
    assert results[2]["sentiment"] == "positive"
    assert results[0]["confidence"] == 0.95
    assert results[2]["confidence"] == 0.72


def test_analyze_single_delegates_to_batch():
    """analyze_single should call analyze_batch with a single-element list."""
    from ml.sentiment_engine import SentimentEngine
    engine = SentimentEngine.__new__(SentimentEngine)
    engine.classifier = MagicMock(return_value=[{"label": "LABEL_2", "score": 0.88}])
    result = engine.analyze_single("great product")
    assert result["sentiment"] == "positive"
    assert result["confidence"] == 0.88


def test_confidence_rounded_to_4_decimals():
    """Confidence values must be rounded to 4 decimal places."""
    from ml.sentiment_engine import SentimentEngine
    engine = SentimentEngine.__new__(SentimentEngine)
    engine.classifier = MagicMock(return_value=[{"label": "LABEL_0", "score": 0.123456789}])
    results = engine.analyze_batch(["test"])
    assert results[0]["confidence"] == 0.1235


def test_analyze_batch_returns_correct_length():
    """Output length must match input length."""
    from ml.sentiment_engine import SentimentEngine
    engine = SentimentEngine.__new__(SentimentEngine)
    engine.classifier = MagicMock(return_value=[
        {"label": "LABEL_2", "score": 0.9} for _ in range(5)
    ])
    results = engine.analyze_batch(["a", "b", "c", "d", "e"])
    assert len(results) == 5


def test_singleton_returns_same_instance():
    """get_instance() must return the same object on multiple calls."""
    from ml.sentiment_engine import SentimentEngine
    SentimentEngine._instance = None
    with patch.object(SentimentEngine, '__init__', lambda self, device=-1: None):
        SentimentEngine._instance = MagicMock(spec=SentimentEngine)
        inst1 = SentimentEngine.get_instance()
        inst2 = SentimentEngine.get_instance()
    assert inst1 is inst2
