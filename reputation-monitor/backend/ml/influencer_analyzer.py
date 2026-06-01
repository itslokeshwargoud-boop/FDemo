"""
Influencer Analyser — ranks and classifies users by influence and stance.

Scores each user by engagement and reach, then classifies them as
Supporter, Neutral, or Attacker based on sentiment patterns.
"""

import logging

logger = logging.getLogger(__name__)

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None  # type: ignore[assignment]
    logger.warning("numpy not available — influencer analysis degraded")


# ---------------------------------------------------------------------------
# Scoring weights
# ---------------------------------------------------------------------------

_WEIGHTS = {
    "reach": 0.35,
    "engagement": 0.30,
    "posts": 0.15,
    "sentiment_magnitude": 0.20,
}

_SENTIMENT_THRESHOLDS = {
    "supporter": 0.25,   # avg sentiment above this → Supporter
    "attacker": -0.25,   # avg sentiment below this → Attacker
}


# ---------------------------------------------------------------------------
# Core API
# ---------------------------------------------------------------------------

def analyze_influencers(users: list[dict]) -> dict:
    """Rank and classify a set of users by influence and stance.

    Parameters
    ----------
    users:
        List of dicts, each containing:
            username       — str
            posts          — int  (number of posts / comments)
            sentiment_avg  — float (-1 to 1, or 0 to 100 scale)
            reach          — int  (followers / subscribers)
            engagement     — float (like-rate, interaction %)

    Returns
    -------
    dict with keys:
        ranked_influencers — sorted list of user dicts with added fields:
            influence_score, classification, impact_percentage
        summary            — aggregate stats
        classification_counts — {Supporter: n, Neutral: n, Attacker: n}
    """
    if not users:
        return _empty_result()

    logger.info("Analysing %d users for influencer ranking", len(users))

    # -- normalise values to 0-1 range ----------------------------------------
    metrics: dict[str, list[float]] = {
        "reach": [],
        "engagement": [],
        "posts": [],
        "sentiment_magnitude": [],
    }

    for u in users:
        metrics["reach"].append(float(u.get("reach", 0)))
        metrics["engagement"].append(float(u.get("engagement", 0)))
        metrics["posts"].append(float(u.get("posts", 0)))
        # Magnitude of sentiment (distance from neutral)
        savg = _normalise_sentiment(u.get("sentiment_avg", 0))
        metrics["sentiment_magnitude"].append(abs(savg))

    normalised: dict[str, list[float]] = {}
    for key, values in metrics.items():
        max_val = max(values) if values else 1.0
        if max_val == 0:
            max_val = 1.0
        normalised[key] = [v / max_val for v in values]

    # -- compute composite influence score ------------------------------------
    scored_users: list[dict] = []
    for i, u in enumerate(users):
        raw_score = sum(
            _WEIGHTS[k] * normalised[k][i] for k in _WEIGHTS
        )
        influence_score = round(raw_score * 100, 1)

        savg = _normalise_sentiment(u.get("sentiment_avg", 0))
        classification = _classify(savg)

        scored_users.append({
            "username": u.get("username", f"user_{i}"),
            "influence_score": influence_score,
            "classification": classification,
            "posts": u.get("posts", 0),
            "sentiment_avg": round(savg, 4),
            "reach": u.get("reach", 0),
            "engagement": u.get("engagement", 0),
        })

    # -- rank by influence score (descending) ---------------------------------
    scored_users.sort(key=lambda x: x["influence_score"], reverse=True)

    # -- compute impact percentages -------------------------------------------
    total_score = sum(s["influence_score"] for s in scored_users) or 1.0
    for s in scored_users:
        s["impact_percentage"] = round(s["influence_score"] / total_score * 100, 1)

    # -- classification counts ------------------------------------------------
    counts: dict[str, int] = {"Supporter": 0, "Neutral": 0, "Attacker": 0}
    for s in scored_users:
        counts[s["classification"]] = counts.get(s["classification"], 0) + 1

    result = {
        "ranked_influencers": scored_users,
        "summary": {
            "total_users": len(scored_users),
            "top_influencer": scored_users[0]["username"] if scored_users else None,
            "avg_influence_score": round(
                sum(s["influence_score"] for s in scored_users) / len(scored_users), 1
            ),
        },
        "classification_counts": counts,
    }
    logger.info(
        "Influencer analysis complete — %d users ranked (S:%d N:%d A:%d)",
        len(scored_users),
        counts["Supporter"],
        counts["Neutral"],
        counts["Attacker"],
    )
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _normalise_sentiment(value: float) -> float:
    """Map any sentiment value to the -1..+1 range.

    If the input appears to be on a 0-100 scale it is rescaled; otherwise
    it is clamped to -1..+1.
    """
    v = float(value)
    if v > 1.0 or v < -1.0:
        # Assume 0-100 scale → map to -1..+1
        return max(-1.0, min(1.0, (v - 50) / 50))
    return max(-1.0, min(1.0, v))


def _classify(sentiment_avg: float) -> str:
    if sentiment_avg >= _SENTIMENT_THRESHOLDS["supporter"]:
        return "Supporter"
    if sentiment_avg <= _SENTIMENT_THRESHOLDS["attacker"]:
        return "Attacker"
    return "Neutral"


def _empty_result() -> dict:
    return {
        "ranked_influencers": [],
        "summary": {
            "total_users": 0,
            "top_influencer": None,
            "avg_influence_score": 0.0,
        },
        "classification_counts": {"Supporter": 0, "Neutral": 0, "Attacker": 0},
    }


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

def generate_sample_data() -> list[dict]:
    """Return realistic user activity data for offline testing."""
    return [
        {
            "username": "mega_reviewer",
            "posts": 45,
            "sentiment_avg": 0.72,
            "reach": 250000,
            "engagement": 8.5,
        },
        {
            "username": "tech_critic",
            "posts": 30,
            "sentiment_avg": -0.65,
            "reach": 180000,
            "engagement": 7.2,
        },
        {
            "username": "casual_viewer",
            "posts": 5,
            "sentiment_avg": 0.10,
            "reach": 500,
            "engagement": 1.0,
        },
        {
            "username": "brand_ambassador",
            "posts": 60,
            "sentiment_avg": 0.88,
            "reach": 120000,
            "engagement": 12.0,
        },
        {
            "username": "angry_blogger",
            "posts": 25,
            "sentiment_avg": -0.80,
            "reach": 95000,
            "engagement": 6.0,
        },
        {
            "username": "news_outlet",
            "posts": 15,
            "sentiment_avg": -0.05,
            "reach": 500000,
            "engagement": 4.0,
        },
        {
            "username": "micro_fan",
            "posts": 80,
            "sentiment_avg": 0.55,
            "reach": 3000,
            "engagement": 15.0,
        },
        {
            "username": "industry_analyst",
            "posts": 10,
            "sentiment_avg": 0.30,
            "reach": 75000,
            "engagement": 5.5,
        },
    ]


if __name__ == "__main__":
    users = generate_sample_data()
    result = analyze_influencers(users)
    print("Classification counts:", result["classification_counts"])
    print(f"Top influencer: {result['summary']['top_influencer']}\n")
    for u in result["ranked_influencers"]:
        print(
            f"  {u['username']:20s}  score={u['influence_score']:5.1f}  "
            f"{u['classification']:10s}  impact={u['impact_percentage']}%"
        )
