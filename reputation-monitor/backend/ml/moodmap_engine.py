"""
Moodmap Engine — maps sentiment to video timeline segments.

Divides a video into equal segments, aggregates comment sentiment per
segment, detects mood spikes, and generates a summary timeline.
"""

import logging
import re
from collections import Counter

logger = logging.getLogger(__name__)

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None  # type: ignore[assignment]
    logger.warning("numpy not available — moodmap engine degraded")


# ---------------------------------------------------------------------------
# Keyword-based sentiment (standalone, no model deps)
# ---------------------------------------------------------------------------

_POSITIVE = frozenset(
    "good great love amazing awesome excellent wonderful fantastic happy "
    "best perfect beautiful nice helpful impressive brilliant superb "
    "incredible fire goat legendary hilarious funny".split()
)

_NEGATIVE = frozenset(
    "bad terrible awful hate worst horrible disgusting poor ugly annoying "
    "disappointing trash garbage scam fake fraud pathetic boring useless "
    "cringe lame stupid".split()
)


def _keyword_sentiment(text: str) -> float:
    """Return a sentiment score in [-1, 1] via keyword matching."""
    tokens = set(re.findall(r"[a-z]+", text.lower()))
    pos = len(tokens & _POSITIVE)
    neg = len(tokens & _NEGATIVE)
    total = pos + neg
    if total == 0:
        return 0.0
    return (pos - neg) / total


# ---------------------------------------------------------------------------
# Core API
# ---------------------------------------------------------------------------

def generate_moodmap(
    comments: list[dict],
    video_duration_seconds: int,
    n_segments: int = 10,
    spike_threshold: float = 1.5,
) -> dict:
    """Map comments onto a video timeline and score each segment.

    Parameters
    ----------
    comments:
        List of dicts, each with at least ``timestamp_seconds`` (int/float,
        position in the video) and ``text`` (str).  An optional
        ``sentiment_score`` float may be provided; otherwise keyword-based
        scoring is used.
    video_duration_seconds:
        Total video length in seconds.
    n_segments:
        Number of equal-length segments to divide the timeline into.
    spike_threshold:
        A segment is flagged as a spike if its absolute sentiment deviates
        more than *spike_threshold* standard deviations from the mean.

    Returns
    -------
    dict with keys:
        segments        — list of segment dicts (start, end, score, comment_count, label)
        spikes          — list of spike dicts (segment_index, direction, score)
        mood_summary    — overall mood descriptor
        total_comments  — number of comments mapped
        video_duration  — echo of input duration
    """
    if video_duration_seconds <= 0:
        return _empty_result(video_duration_seconds)

    n_segments = max(1, min(n_segments, video_duration_seconds))
    seg_len = video_duration_seconds / n_segments

    logger.info(
        "Generating moodmap: %d comments, %ds video, %d segments",
        len(comments),
        video_duration_seconds,
        n_segments,
    )

    # -- bucket comments into segments ----------------------------------------
    buckets: list[list[float]] = [[] for _ in range(n_segments)]
    mapped = 0

    for c in comments:
        ts = c.get("timestamp_seconds")
        if ts is None:
            continue
        ts = float(ts)
        if ts < 0 or ts > video_duration_seconds:
            continue

        idx = min(int(ts / seg_len), n_segments - 1)
        score = c.get("sentiment_score")
        if score is None:
            score = _keyword_sentiment(c.get("text", ""))
        buckets[idx].append(float(score))
        mapped += 1

    # -- compute per-segment scores -------------------------------------------
    segment_scores: list[float] = []
    segments: list[dict] = []

    for i in range(n_segments):
        start = round(i * seg_len, 1)
        end = round((i + 1) * seg_len, 1)
        if buckets[i]:
            avg = sum(buckets[i]) / len(buckets[i])
        else:
            avg = 0.0
        segment_scores.append(avg)

        segments.append({
            "segment_index": i,
            "start_seconds": start,
            "end_seconds": end,
            "sentiment_score": round(avg, 4),
            "comment_count": len(buckets[i]),
            "label": _score_label(avg),
        })

    # -- spike detection ------------------------------------------------------
    spikes: list[dict] = []
    if np is not None and len(segment_scores) >= 3:
        arr = np.array(segment_scores)
        mean = float(np.mean(arr))
        std = float(np.std(arr))
        if std > 0:
            for i, s in enumerate(segment_scores):
                z = (s - mean) / std
                if abs(z) >= spike_threshold:
                    spikes.append({
                        "segment_index": i,
                        "direction": "positive" if z > 0 else "negative",
                        "score": round(s, 4),
                        "z_score": round(z, 2),
                    })
    elif len(segment_scores) >= 3:
        # Fallback without numpy
        mean = sum(segment_scores) / len(segment_scores)
        variance = sum((s - mean) ** 2 for s in segment_scores) / len(segment_scores)
        std = variance ** 0.5
        if std > 0:
            for i, s in enumerate(segment_scores):
                z = (s - mean) / std
                if abs(z) >= spike_threshold:
                    spikes.append({
                        "segment_index": i,
                        "direction": "positive" if z > 0 else "negative",
                        "score": round(s, 4),
                        "z_score": round(z, 2),
                    })

    # -- mood summary ---------------------------------------------------------
    if segment_scores:
        overall = sum(segment_scores) / len(segment_scores)
    else:
        overall = 0.0

    neg_spikes = sum(1 for sp in spikes if sp["direction"] == "negative")
    pos_spikes = sum(1 for sp in spikes if sp["direction"] == "positive")

    if overall > 0.3 and neg_spikes == 0:
        mood_summary = "Predominantly positive throughout"
    elif overall < -0.3 and pos_spikes == 0:
        mood_summary = "Predominantly negative throughout"
    elif neg_spikes > 0 and pos_spikes > 0:
        mood_summary = "Mixed mood with both positive and negative spikes"
    elif neg_spikes > 0:
        mood_summary = f"Generally neutral with {neg_spikes} negative spike(s)"
    elif pos_spikes > 0:
        mood_summary = f"Generally neutral with {pos_spikes} positive spike(s)"
    else:
        mood_summary = "Relatively stable and neutral mood"

    result = {
        "segments": segments,
        "spikes": spikes,
        "mood_summary": mood_summary,
        "total_comments": mapped,
        "video_duration": video_duration_seconds,
    }
    logger.info(
        "Moodmap complete — %d segments, %d spikes, mood: %s",
        len(segments),
        len(spikes),
        mood_summary,
    )
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _score_label(score: float) -> str:
    if score >= 0.3:
        return "positive"
    if score <= -0.3:
        return "negative"
    return "neutral"


def _empty_result(duration: int = 0) -> dict:
    return {
        "segments": [],
        "spikes": [],
        "mood_summary": "No data",
        "total_comments": 0,
        "video_duration": duration,
    }


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

def generate_sample_data() -> tuple[list[dict], int]:
    """Return (comments, video_duration_seconds) for offline testing.

    Simulates a 600-second (10-min) video with comments clustered around
    key moments: an exciting intro, a controversial mid-section, and a
    strong finish.
    """
    video_duration = 600
    comments = [
        # Intro excitement (0-60 s)
        {"timestamp_seconds": 5, "text": "Love the new intro, amazing!"},
        {"timestamp_seconds": 12, "text": "Best intro ever, fantastic editing"},
        {"timestamp_seconds": 30, "text": "Great start, really impressive"},
        {"timestamp_seconds": 45, "text": "The music is perfect here"},
        # Build-up (60-180 s)
        {"timestamp_seconds": 70, "text": "Interesting point, good explanation"},
        {"timestamp_seconds": 100, "text": "This is pretty helpful content"},
        {"timestamp_seconds": 130, "text": "Nice breakdown of the topic"},
        {"timestamp_seconds": 160, "text": "Not bad, decent analysis"},
        # Controversial section (180-360 s)
        {"timestamp_seconds": 200, "text": "This take is terrible and wrong"},
        {"timestamp_seconds": 220, "text": "Worst argument I have ever heard"},
        {"timestamp_seconds": 250, "text": "Disgusting misinformation here"},
        {"timestamp_seconds": 270, "text": "This is garbage, completely fake"},
        {"timestamp_seconds": 290, "text": "Awful take, disappointing"},
        {"timestamp_seconds": 310, "text": "Hate this section, pathetic"},
        {"timestamp_seconds": 340, "text": "Lost all respect after this part"},
        # Recovery (360-480 s)
        {"timestamp_seconds": 370, "text": "Okay this part is a bit better"},
        {"timestamp_seconds": 400, "text": "Getting back on track now"},
        {"timestamp_seconds": 430, "text": "This example was actually nice"},
        {"timestamp_seconds": 460, "text": "Good recovery, helpful tip"},
        # Strong finish (480-600 s)
        {"timestamp_seconds": 500, "text": "Great conclusion, love it!"},
        {"timestamp_seconds": 530, "text": "Excellent summary, very impressive"},
        {"timestamp_seconds": 550, "text": "Amazing ending, best part of the video"},
        {"timestamp_seconds": 570, "text": "Brilliant work, superb quality"},
        {"timestamp_seconds": 590, "text": "Perfect ending, subscribed!"},
    ]
    return comments, video_duration


if __name__ == "__main__":
    comments, duration = generate_sample_data()
    result = generate_moodmap(comments, duration)
    print(f"Mood: {result['mood_summary']}")
    print(f"Comments mapped: {result['total_comments']}\n")
    for seg in result["segments"]:
        bar_len = int((seg["sentiment_score"] + 1) * 20)
        bar = "█" * max(bar_len, 0)
        print(
            f"  {seg['start_seconds']:6.0f}s-{seg['end_seconds']:6.0f}s  "
            f"score={seg['sentiment_score']:+.3f}  "
            f"({seg['comment_count']} comments)  {bar}"
        )
    if result["spikes"]:
        print("\nSpikes:")
        for sp in result["spikes"]:
            print(f"  Segment {sp['segment_index']}: {sp['direction']} (z={sp['z_score']})")
