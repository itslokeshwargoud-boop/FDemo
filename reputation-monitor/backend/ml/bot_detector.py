"""
Bot Detector — identifies fake / bot engagement patterns.

Analyses comment streams for signals of inauthentic activity:
duplicate text, burst timing, text similarity, low-age accounts,
and suspiciously low follower counts.
"""

import logging
import re
from collections import Counter, defaultdict
from datetime import datetime, timezone, timedelta
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None  # type: ignore[assignment]
    logger.warning("numpy not available — bot detection degraded")


# ---------------------------------------------------------------------------
# Thresholds
# ---------------------------------------------------------------------------

DUPLICATE_TEXT_THRESHOLD = 0.90
BURST_WINDOW_SECONDS = 60
BURST_MIN_POSTS = 3
LOW_AGE_DAYS = 30
LOW_FOLLOWER_THRESHOLD = 10

SIGNAL_WEIGHTS = {
    "duplicate_text": 30,
    "burst_activity": 25,
    "similar_text": 20,
    "low_age_account": 15,
    "low_followers": 10,
}


# ---------------------------------------------------------------------------
# Internal checks
# ---------------------------------------------------------------------------

def _normalise(text: str) -> str:
    """Lowercase, collapse whitespace, strip punctuation."""
    return re.sub(r"\s+", " ", re.sub(r"[^\w\s]", "", text.lower())).strip()


def _check_duplicates(comments: list[dict]) -> tuple[set[str], list[str]]:
    """Find accounts that posted near-identical text."""
    suspicious: set[str] = set()
    patterns: list[str] = []
    normalised = [(_normalise(c["text"]), c.get("author", "unknown")) for c in comments]

    text_counter: Counter[str] = Counter(t for t, _ in normalised)
    for text, count in text_counter.items():
        if count >= 2 and text:
            authors = {a for t, a in normalised if t == text}
            suspicious.update(authors)
            patterns.append(
                f"Duplicate text ({count}x): \"{text[:80]}...\" "
                f"by {len(authors)} account(s)"
            )
    return suspicious, patterns


def _check_burst_activity(comments: list[dict]) -> tuple[set[str], list[str]]:
    """Detect multiple posts from the same author within a short window."""
    suspicious: set[str] = set()
    patterns: list[str] = []
    by_author: defaultdict[str, list[datetime]] = defaultdict(list)

    for c in comments:
        ts = c.get("timestamp")
        if isinstance(ts, (int, float)):
            ts = datetime.fromtimestamp(ts, tz=timezone.utc)
        if isinstance(ts, datetime):
            by_author[c.get("author", "unknown")].append(ts)

    for author, timestamps in by_author.items():
        timestamps.sort()
        for i in range(len(timestamps) - BURST_MIN_POSTS + 1):
            window = (timestamps[i + BURST_MIN_POSTS - 1] - timestamps[i]).total_seconds()
            if window <= BURST_WINDOW_SECONDS:
                suspicious.add(author)
                patterns.append(
                    f"Burst: {author} posted {BURST_MIN_POSTS}+ comments "
                    f"within {int(window)}s"
                )
                break
    return suspicious, patterns


def _check_text_similarity(comments: list[dict]) -> tuple[set[str], list[str]]:
    """Find different authors posting suspiciously similar (but not identical) text."""
    suspicious: set[str] = set()
    patterns: list[str] = []
    items = [
        (_normalise(c["text"]), c.get("author", "unknown"))
        for c in comments
    ]

    # Sample for performance on large sets
    limit = min(len(items), 500)
    for i in range(limit):
        for j in range(i + 1, limit):
            if items[i][1] == items[j][1]:
                continue
            ratio = SequenceMatcher(None, items[i][0], items[j][0]).ratio()
            if DUPLICATE_TEXT_THRESHOLD > ratio >= 0.75:
                suspicious.update({items[i][1], items[j][1]})
                patterns.append(
                    f"Similar text ({ratio:.0%}): {items[i][1]} & {items[j][1]}"
                )
    return suspicious, patterns


def _check_account_signals(comments: list[dict]) -> tuple[set[str], list[str]]:
    """Flag accounts that are very new or have very low follower counts."""
    suspicious: set[str] = set()
    patterns: list[str] = []
    seen: set[str] = set()

    for c in comments:
        author = c.get("author", "unknown")
        if author in seen:
            continue
        seen.add(author)

        age = c.get("author_age_days")
        if age is not None and age < LOW_AGE_DAYS:
            suspicious.add(author)
            patterns.append(f"New account: {author} ({age} days old)")

        followers = c.get("followers")
        if followers is not None and followers < LOW_FOLLOWER_THRESHOLD:
            suspicious.add(author)
            patterns.append(f"Low followers: {author} ({followers})")

    return suspicious, patterns


# ---------------------------------------------------------------------------
# Core API
# ---------------------------------------------------------------------------

def analyze_authenticity(comments: list[dict]) -> dict:
    """Analyse a stream of comments for bot / fake engagement.

    Parameters
    ----------
    comments:
        Each dict should contain at minimum ``text`` and ``author``.
        Optional keys: ``timestamp``, ``author_age_days``, ``followers``.

    Returns
    -------
    dict with keys:
        bot_percentage      — estimated share of inauthentic engagement (0-100)
        suspicious_accounts — list of flagged usernames
        confidence          — 'high', 'medium', or 'low'
        patterns_detected   — human-readable descriptions of each signal
        total_comments      — number of comments analysed
    """
    if not comments:
        return {
            "bot_percentage": 0.0,
            "suspicious_accounts": [],
            "confidence": "low",
            "patterns_detected": [],
            "total_comments": 0,
        }

    logger.info("Analysing authenticity of %d comments", len(comments))

    all_suspicious: set[str] = set()
    all_patterns: list[str] = []

    for check_fn in (
        _check_duplicates,
        _check_burst_activity,
        _check_text_similarity,
        _check_account_signals,
    ):
        sus, pats = check_fn(comments)
        all_suspicious.update(sus)
        all_patterns.extend(pats)

    unique_authors = {c.get("author", "unknown") for c in comments}
    bot_pct = (
        round(len(all_suspicious) / max(len(unique_authors), 1) * 100, 1)
    )

    if bot_pct >= 40:
        confidence = "high"
    elif bot_pct >= 15:
        confidence = "medium"
    else:
        confidence = "low"

    result = {
        "bot_percentage": bot_pct,
        "suspicious_accounts": sorted(all_suspicious),
        "confidence": confidence,
        "patterns_detected": all_patterns,
        "total_comments": len(comments),
    }
    logger.info(
        "Authenticity analysis complete — %.1f%% bot (%s confidence)",
        bot_pct,
        confidence,
    )
    return result


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

def generate_sample_data() -> list[dict]:
    """Return realistic dummy comment data for offline testing."""
    base = datetime(2025, 6, 1, 12, 0, 0, tzinfo=timezone.utc)
    return [
        # Normal users
        {
            "text": "Really enjoyed this tutorial, thanks!",
            "author": "alice_fan",
            "timestamp": base,
            "author_age_days": 800,
            "followers": 320,
        },
        {
            "text": "Can you do a follow-up on this topic?",
            "author": "bob_viewer",
            "timestamp": base + timedelta(minutes=5),
            "author_age_days": 450,
            "followers": 150,
        },
        {
            "text": "Bookmarked for later, great resource",
            "author": "carol_dev",
            "timestamp": base + timedelta(minutes=12),
            "author_age_days": 1200,
            "followers": 980,
        },
        # Duplicate spam
        {
            "text": "Check out my channel for free gift cards!!!",
            "author": "spambot_01",
            "timestamp": base + timedelta(seconds=10),
            "author_age_days": 2,
            "followers": 0,
        },
        {
            "text": "Check out my channel for free gift cards!!!",
            "author": "spambot_02",
            "timestamp": base + timedelta(seconds=15),
            "author_age_days": 3,
            "followers": 1,
        },
        {
            "text": "Check out my channel for free gift cards!!!",
            "author": "spambot_03",
            "timestamp": base + timedelta(seconds=20),
            "author_age_days": 1,
            "followers": 0,
        },
        # Burst poster
        {
            "text": "This is trash content",
            "author": "angry_user",
            "timestamp": base + timedelta(seconds=1),
            "author_age_days": 5,
            "followers": 3,
        },
        {
            "text": "Worst channel on the platform",
            "author": "angry_user",
            "timestamp": base + timedelta(seconds=20),
            "author_age_days": 5,
            "followers": 3,
        },
        {
            "text": "Unsubscribing right now, garbage",
            "author": "angry_user",
            "timestamp": base + timedelta(seconds=45),
            "author_age_days": 5,
            "followers": 3,
        },
        # Similar text from different accounts
        {
            "text": "This product is amazing, I bought three and love them all!",
            "author": "shill_a",
            "timestamp": base + timedelta(minutes=1),
            "author_age_days": 10,
            "followers": 5,
        },
        {
            "text": "This product is amazing, I bought two and love them all!",
            "author": "shill_b",
            "timestamp": base + timedelta(minutes=2),
            "author_age_days": 12,
            "followers": 4,
        },
        # Regular engagement
        {
            "text": "The production quality keeps getting better",
            "author": "long_time_sub",
            "timestamp": base + timedelta(hours=1),
            "author_age_days": 2000,
            "followers": 500,
        },
    ]


if __name__ == "__main__":
    data = generate_sample_data()
    result = analyze_authenticity(data)
    print(f"Bot percentage: {result['bot_percentage']}%")
    print(f"Confidence: {result['confidence']}")
    print(f"Suspicious accounts: {result['suspicious_accounts']}")
    print("Patterns:")
    for p in result["patterns_detected"]:
        print(f"  • {p}")
