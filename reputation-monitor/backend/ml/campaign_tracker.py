"""
Campaign Tracker — measures before-vs-after impact of campaigns.

Compares pre-campaign and post-campaign metrics to quantify improvement,
attribute changes, and suggest follow-up actions.
"""

import logging
import math

logger = logging.getLogger(__name__)

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None  # type: ignore[assignment]
    logger.warning("numpy not available — campaign tracker degraded")


# ---------------------------------------------------------------------------
# Metric definitions
# ---------------------------------------------------------------------------

# Higher-is-better metrics vs lower-is-better metrics
_HIGHER_IS_BETTER = frozenset({
    "sentiment_score",
    "positive_mentions",
    "engagement_rate",
    "follower_growth",
    "share_of_voice",
    "nps",
    "reach",
    "impressions",
    "supporters",
})

_LOWER_IS_BETTER = frozenset({
    "negative_mentions",
    "bot_percentage",
    "response_time_hours",
    "churn_rate",
    "complaint_volume",
})

# Weights for the composite improvement score
_METRIC_WEIGHTS: dict[str, float] = {
    "sentiment_score": 2.0,
    "positive_mentions": 1.5,
    "negative_mentions": 1.5,
    "engagement_rate": 1.2,
    "follower_growth": 1.0,
    "bot_percentage": 0.8,
    "share_of_voice": 1.0,
    "reach": 1.0,
}


# ---------------------------------------------------------------------------
# Core API
# ---------------------------------------------------------------------------

def track_campaign_impact(
    before: dict,
    after: dict,
    campaign_name: str = "Unnamed Campaign",
) -> dict:
    """Compare before and after metrics for a campaign.

    Parameters
    ----------
    before:
        Dict of metric_name → numeric value **before** the campaign.
    after:
        Dict of metric_name → numeric value **after** the campaign.
    campaign_name:
        Human-readable campaign identifier.

    Returns
    -------
    dict with keys:
        campaign_name       — echo of the input name
        improvement_score   — composite score (-100 to +100)
        metric_changes      — per-metric breakdown
        impact_assessment   — 'very_positive', 'positive', 'neutral',
                              'negative', or 'very_negative'
        recommendations     — follow-up action suggestions
        summary             — one-line human-readable summary
    """
    logger.info("Tracking impact for campaign: %s", campaign_name)

    common_keys = sorted(set(before.keys()) & set(after.keys()))
    if not common_keys:
        return {
            "campaign_name": campaign_name,
            "improvement_score": 0.0,
            "metric_changes": [],
            "impact_assessment": "neutral",
            "recommendations": ["Provide matching before/after metrics to enable analysis."],
            "summary": "No overlapping metrics to compare.",
        }

    metric_changes: list[dict] = []
    weighted_sum = 0.0
    weight_total = 0.0

    for key in common_keys:
        bval = float(before[key])
        aval = float(after[key])
        abs_change = aval - bval
        pct_change = (
            round((abs_change / abs(bval)) * 100, 2) if bval != 0 else 0.0
        )

        # Direction: did this metric improve?
        if key in _LOWER_IS_BETTER:
            improved = abs_change < 0
            normalised_change = -pct_change  # flip sign so positive = good
        else:
            improved = abs_change > 0
            normalised_change = pct_change

        direction = "improved" if improved else ("declined" if abs_change != 0 else "unchanged")

        metric_changes.append({
            "metric": key,
            "before": bval,
            "after": aval,
            "absolute_change": round(abs_change, 4),
            "percent_change": pct_change,
            "direction": direction,
        })

        w = _METRIC_WEIGHTS.get(key, 1.0)
        weighted_sum += normalised_change * w
        weight_total += w

    # Composite improvement score clamped to -100..+100
    raw_improvement = weighted_sum / max(weight_total, 1.0)
    improvement_score = round(max(-100.0, min(100.0, raw_improvement)), 2)

    # Impact assessment
    if improvement_score >= 20:
        impact = "very_positive"
    elif improvement_score >= 5:
        impact = "positive"
    elif improvement_score >= -5:
        impact = "neutral"
    elif improvement_score >= -20:
        impact = "negative"
    else:
        impact = "very_negative"

    recommendations = _generate_recommendations(metric_changes, impact)

    improved_count = sum(1 for m in metric_changes if m["direction"] == "improved")
    summary = (
        f"Campaign \"{campaign_name}\": {improved_count}/{len(metric_changes)} "
        f"metrics improved (score {improvement_score:+.1f})."
    )

    result = {
        "campaign_name": campaign_name,
        "improvement_score": improvement_score,
        "metric_changes": metric_changes,
        "impact_assessment": impact,
        "recommendations": recommendations,
        "summary": summary,
    }
    logger.info("Campaign '%s' assessment: %s (%.1f)", campaign_name, impact, improvement_score)
    return result


# ---------------------------------------------------------------------------
# Recommendation generation
# ---------------------------------------------------------------------------

def _generate_recommendations(
    changes: list[dict],
    impact: str,
) -> list[str]:
    recs: list[str] = []

    declined = [m for m in changes if m["direction"] == "declined"]
    improved = [m for m in changes if m["direction"] == "improved"]

    if impact in ("very_negative", "negative"):
        recs.append(
            "Campaign had limited or negative effect — review targeting, "
            "messaging, and channel selection."
        )

    for m in declined:
        name = m["metric"].replace("_", " ").title()
        recs.append(
            f"{name} declined by {abs(m['percent_change']):.1f}%. "
            "Investigate root cause and adjust strategy."
        )

    if improved:
        best = max(improved, key=lambda x: x["percent_change"])
        name = best["metric"].replace("_", " ").title()
        recs.append(
            f"Strongest gain: {name} (+{best['percent_change']:.1f}%). "
            "Double down on this channel/tactic."
        )

    if impact in ("positive", "very_positive"):
        recs.append(
            "Positive results — document winning tactics and plan next "
            "campaign iteration within 2 weeks."
        )

    if not recs:
        recs.append("Results are neutral. Consider A/B testing variations.")

    return recs


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

def generate_sample_data() -> tuple[dict, dict, str]:
    """Return (before_metrics, after_metrics, campaign_name) for testing."""
    before = {
        "sentiment_score": 42.0,
        "positive_mentions": 120,
        "negative_mentions": 85,
        "engagement_rate": 3.2,
        "follower_growth": 150,
        "bot_percentage": 22.0,
        "share_of_voice": 18.5,
        "reach": 50000,
    }
    after = {
        "sentiment_score": 61.0,
        "positive_mentions": 210,
        "negative_mentions": 55,
        "engagement_rate": 5.1,
        "follower_growth": 380,
        "bot_percentage": 12.0,
        "share_of_voice": 24.0,
        "reach": 82000,
    }
    return before, after, "Summer Reputation Recovery"


if __name__ == "__main__":
    before, after, name = generate_sample_data()
    result = track_campaign_impact(before, after, name)
    print(f"Campaign: {result['campaign_name']}")
    print(f"Score   : {result['improvement_score']:+.1f}")
    print(f"Impact  : {result['impact_assessment']}")
    print(f"Summary : {result['summary']}")
    print("\nMetric changes:")
    for m in result["metric_changes"]:
        print(f"  {m['metric']}: {m['before']} → {m['after']} ({m['direction']})")
    print("\nRecommendations:")
    for r in result["recommendations"]:
        print(f"  • {r}")
