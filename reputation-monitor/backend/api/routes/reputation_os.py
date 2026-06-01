"""
REPUTATION OS — Unified API routes for the Reputation Operating System.

Multi-tenant: the ``tenant_id`` path parameter in each route determines
which tenant the response is scoped to.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Path

from api.routes.reputation_os_data import (
    get_bot_comments,
    get_campaign_data,
    get_influencer_users,
    get_moodmap_data,
    get_narrative_texts,
    get_prediction_history,
    get_reputation_inputs,
    get_velocity_data,
)
from ml.action_engine import generate_recommendations
from ml.bot_detector import analyze_authenticity
from ml.campaign_tracker import track_campaign_impact
from ml.influencer_analyzer import analyze_influencers
from ml.moodmap_engine import generate_moodmap
from ml.narrative_detector import detect_narratives
from ml.prediction_engine import predict_sentiment
from ml.reputation_scorer import calculate_reputation_score
from ml.sentiment_velocity import compute_velocity

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/reputation-os",
    tags=["reputation-os"],
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _envelope(
    tenant_id: str,
    data: Any,
    insights: list[str],
) -> dict:
    """Wrap every response in the standard REPUTATION OS envelope."""
    return {
        "tenant_id": tenant_id,
        "timestamp": _now_iso(),
        "data": data,
        "insights": insights,
    }


# ---------------------------------------------------------------------------
# 1. Reputation Score
# ---------------------------------------------------------------------------

@router.get("/{tenant_id}/score", summary="Reputation Score")
async def reputation_score(
    tenant_id: str = Path(..., description="Tenant identifier"),
) -> dict:
    """Composite reputation score combining all module outputs."""
    logger.info("[%s] Computing reputation score", tenant_id)

    inputs = get_reputation_inputs()
    base = calculate_reputation_score(
        inputs["positive"], inputs["negative"], inputs["neutral"],
    )

    # Weighted adjustments from secondary signals
    vel_data = get_velocity_data()
    vel = compute_velocity(vel_data)
    trend_modifier = 0.0
    if vel["trend_direction"] == "improving":
        trend_modifier = 3.0
    elif vel["trend_direction"] == "declining":
        trend_modifier = -5.0

    bot_comments = get_bot_comments()
    bot = analyze_authenticity(bot_comments)
    bot_penalty = -min(bot["bot_percentage"] * 0.3, 15.0)

    raw_composite = base["score"] + trend_modifier + bot_penalty
    composite = round(max(-100.0, min(100.0, raw_composite)), 2)

    # Map to 0-100 display scale
    display_score = round((composite + 100) / 2, 1)

    if display_score >= 70:
        risk_level = "low"
    elif display_score >= 40:
        risk_level = "moderate"
    else:
        risk_level = "high"

    if vel["trend_direction"] == "improving":
        trend = "improving"
    elif vel["trend_direction"] == "declining":
        trend = "declining"
    else:
        trend = "stable"

    data = {
        "score": display_score,
        "raw_score": composite,
        "risk_level": risk_level,
        "trend": trend,
        "breakdown": {
            "base_score": base["score"],
            "trend_modifier": trend_modifier,
            "bot_penalty": round(bot_penalty, 2),
            "positive_count": inputs["positive"],
            "negative_count": inputs["negative"],
            "neutral_count": inputs["neutral"],
            "negative_ratio": base["negative_ratio"],
        },
    }

    insights = [
        f"Overall reputation score is {display_score}/100 ({risk_level} risk).",
        f"Sentiment trend is {trend} with velocity {vel['velocity']}.",
    ]
    if bot["bot_percentage"] > 10:
        insights.append(
            f"Bot activity ({bot['bot_percentage']}%) is applying a "
            f"{abs(bot_penalty):.1f}-point penalty to the score."
        )
    if base["negative_ratio"] > 25:
        insights.append(
            f"Negative comment ratio ({base['negative_ratio']}%) is elevated — "
            "monitor closely."
        )

    return _envelope(tenant_id, data, insights)


# ---------------------------------------------------------------------------
# 2. Early Warning Alerts
# ---------------------------------------------------------------------------

@router.get("/{tenant_id}/alerts", summary="Early Warning System")
async def early_warnings(
    tenant_id: str = Path(..., description="Tenant identifier"),
) -> dict:
    """Generate alerts based on sentiment drops, velocity spikes, and
    negative narrative increases."""
    logger.info("[%s] Generating early warning alerts", tenant_id)

    now = _now_iso()
    alerts: list[dict] = []

    # Sentiment velocity check
    vel_data = get_velocity_data()
    vel = compute_velocity(vel_data)
    if vel["velocity"] == "rapid" and vel["trend_direction"] == "declining":
        alerts.append({
            "severity": "critical",
            "type": "sentiment_velocity",
            "message": (
                f"Rapid sentiment decline detected ({vel['rate_per_hour']:.2f}/h). "
                "Immediate attention required."
            ),
            "timestamp": now,
        })
    elif vel["trend_direction"] == "declining":
        alerts.append({
            "severity": "high",
            "type": "sentiment_decline",
            "message": (
                f"Sentiment is declining at {vel['rate_per_hour']:.2f} points/hour. "
                "Monitor situation closely."
            ),
            "timestamp": now,
        })

    # Bot activity check
    bot_comments = get_bot_comments()
    bot = analyze_authenticity(bot_comments)
    if bot["bot_percentage"] >= 30:
        alerts.append({
            "severity": "high",
            "type": "bot_activity",
            "message": (
                f"High bot activity detected: {bot['bot_percentage']}% of "
                f"accounts flagged as suspicious. "
                f"{len(bot['suspicious_accounts'])} accounts identified."
            ),
            "timestamp": now,
        })
    elif bot["bot_percentage"] >= 15:
        alerts.append({
            "severity": "medium",
            "type": "bot_activity",
            "message": (
                f"Moderate bot activity detected: {bot['bot_percentage']}% suspicious."
            ),
            "timestamp": now,
        })

    # Negative narrative check
    texts = get_narrative_texts()
    narratives = detect_narratives(texts, n_clusters=5)
    negative_narratives = [
        n for n in narratives if n.get("sentiment") == "negative"
    ]
    total_negative_pct = sum(n["percentage"] for n in negative_narratives)
    if total_negative_pct > 30:
        alerts.append({
            "severity": "critical",
            "type": "negative_narrative",
            "message": (
                f"Negative narratives dominate {total_negative_pct:.1f}% of "
                f"conversation across {len(negative_narratives)} cluster(s)."
            ),
            "timestamp": now,
        })
    elif total_negative_pct > 15:
        alerts.append({
            "severity": "high",
            "type": "negative_narrative",
            "message": (
                f"Negative narratives account for {total_negative_pct:.1f}% "
                "of conversation. Consider counter-messaging."
            ),
            "timestamp": now,
        })

    # Reputation score check
    rep_inputs = get_reputation_inputs()
    rep = calculate_reputation_score(
        rep_inputs["positive"], rep_inputs["negative"], rep_inputs["neutral"],
    )
    if rep["negative_ratio"] > 40:
        alerts.append({
            "severity": "critical",
            "type": "reputation_threshold",
            "message": (
                f"Negative comment ratio is {rep['negative_ratio']}% — "
                "reputation score at high risk."
            ),
            "timestamp": now,
        })
    elif rep["negative_ratio"] > 25:
        alerts.append({
            "severity": "medium",
            "type": "reputation_threshold",
            "message": (
                f"Negative comment ratio ({rep['negative_ratio']}%) is above "
                "the 25% warning threshold."
            ),
            "timestamp": now,
        })

    # If no alerts, add an all-clear
    if not alerts:
        alerts.append({
            "severity": "info",
            "type": "all_clear",
            "message": "All reputation metrics are within normal parameters.",
            "timestamp": now,
        })

    alerts.sort(key=lambda a: {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}.get(a["severity"], 5))

    data = {
        "total_alerts": len(alerts),
        "critical_count": sum(1 for a in alerts if a["severity"] == "critical"),
        "alerts": alerts,
    }

    insights = [f"{len(alerts)} alert(s) generated."]
    critical = [a for a in alerts if a["severity"] == "critical"]
    if critical:
        insights.append(
            f"{len(critical)} critical alert(s) require immediate action."
        )
    else:
        insights.append("No critical alerts — situation is manageable.")

    return _envelope(tenant_id, data, insights)


# ---------------------------------------------------------------------------
# 3. Narrative Detection
# ---------------------------------------------------------------------------

@router.get("/{tenant_id}/narratives", summary="Narrative Detection")
async def narrative_detection(
    tenant_id: str = Path(..., description="Tenant identifier"),
) -> dict:
    """Detect thematic narrative clusters from comment data."""
    logger.info("[%s] Running narrative detection", tenant_id)

    texts = get_narrative_texts()
    clusters = detect_narratives(texts, n_clusters=5)

    data = {
        "total_texts_analyzed": len(texts),
        "cluster_count": len(clusters),
        "clusters": clusters,
    }

    insights = [f"Identified {len(clusters)} narrative cluster(s) from {len(texts)} comments."]
    positive = [c for c in clusters if c["sentiment"] == "positive"]
    negative = [c for c in clusters if c["sentiment"] == "negative"]
    if positive:
        top_pos = max(positive, key=lambda c: c["percentage"])
        insights.append(
            f"Largest positive narrative: \"{top_pos['label']}\" "
            f"({top_pos['percentage']}%)."
        )
    if negative:
        top_neg = max(negative, key=lambda c: c["percentage"])
        insights.append(
            f"Largest negative narrative: \"{top_neg['label']}\" "
            f"({top_neg['percentage']}%) — consider counter-messaging."
        )

    return _envelope(tenant_id, data, insights)


# ---------------------------------------------------------------------------
# 4. Influencer Analysis
# ---------------------------------------------------------------------------

@router.get("/{tenant_id}/influencers", summary="Influencer Analysis")
async def influencer_analysis(
    tenant_id: str = Path(..., description="Tenant identifier"),
) -> dict:
    """Rank and classify users by influence and stance."""
    logger.info("[%s] Analysing influencers", tenant_id)

    users = get_influencer_users()
    result = analyze_influencers(users)

    ranked = result["ranked_influencers"]
    top_supporters = [u for u in ranked if u["classification"] == "Supporter"]
    top_attackers = [u for u in ranked if u["classification"] == "Attacker"]
    neutrals = [u for u in ranked if u["classification"] == "Neutral"]

    data = {
        "top_supporters": top_supporters[:5],
        "top_attackers": top_attackers[:5],
        "neutrals": neutrals[:5],
        "summary": result["summary"],
        "classification_counts": result["classification_counts"],
    }

    counts = result["classification_counts"]
    insights = [
        f"Analysed {result['summary']['total_users']} influencers: "
        f"{counts['Supporter']} supporters, {counts['Attacker']} attackers, "
        f"{counts['Neutral']} neutral.",
    ]
    if result["summary"]["top_influencer"]:
        insights.append(
            f"Top influencer: {result['summary']['top_influencer']} "
            f"(avg score {result['summary']['avg_influence_score']})."
        )
    if top_attackers:
        insights.append(
            f"{len(top_attackers)} hostile influencer(s) identified — "
            "consider engagement strategy."
        )

    return _envelope(tenant_id, data, insights)


# ---------------------------------------------------------------------------
# 5. Bot Detection / Authenticity
# ---------------------------------------------------------------------------

@router.get("/{tenant_id}/authenticity", summary="Bot Detection")
async def bot_detection(
    tenant_id: str = Path(..., description="Tenant identifier"),
) -> dict:
    """Analyse engagement authenticity and detect bot activity."""
    logger.info("[%s] Running bot detection", tenant_id)

    comments = get_bot_comments()
    result = analyze_authenticity(comments)

    data = {
        "bot_percentage": result["bot_percentage"],
        "suspicious_accounts": result["suspicious_accounts"],
        "patterns": result["patterns_detected"],
        "confidence": result["confidence"],
        "total_comments_analyzed": result["total_comments"],
    }

    insights = [
        f"{result['bot_percentage']}% of engagement flagged as inauthentic "
        f"({result['confidence']} confidence).",
    ]
    if result["suspicious_accounts"]:
        insights.append(
            f"{len(result['suspicious_accounts'])} suspicious account(s): "
            f"{', '.join(result['suspicious_accounts'][:5])}"
            + ("..." if len(result["suspicious_accounts"]) > 5 else ".")
        )
    if result["patterns_detected"]:
        insights.append(
            f"{len(result['patterns_detected'])} bot pattern(s) detected "
            "including duplicate text and burst activity."
        )

    return _envelope(tenant_id, data, insights)


# ---------------------------------------------------------------------------
# 6. Sentiment Velocity
# ---------------------------------------------------------------------------

@router.get("/{tenant_id}/velocity", summary="Sentiment Velocity")
async def sentiment_velocity(
    tenant_id: str = Path(..., description="Tenant identifier"),
) -> dict:
    """Measure the speed and direction of sentiment change."""
    logger.info("[%s] Computing sentiment velocity", tenant_id)

    data_points = get_velocity_data()
    result = compute_velocity(data_points)

    data = {
        "speed": result["velocity"],
        "rate": result["rate_per_hour"],
        "trend": result["trend_direction"],
        "acceleration": result["acceleration"],
        "data_points_used": result["data_points_used"],
        "time_span_hours": result["time_span_hours"],
        "window_scores": result["window_scores"],
    }

    insights = [
        f"Sentiment velocity is {result['velocity']} at "
        f"{result['rate_per_hour']:.4f} points/hour.",
        f"Trend direction: {result['trend_direction']}.",
    ]
    if result["acceleration"] < -0.5:
        insights.append(
            "Acceleration is negative — sentiment decline is speeding up."
        )
    elif result["acceleration"] > 0.5:
        insights.append(
            "Positive acceleration — recovery is gaining momentum."
        )
    insights.append(
        f"Analysis spans {result['time_span_hours']}h across "
        f"{result['data_points_used']} data points."
    )

    return _envelope(tenant_id, data, insights)


# ---------------------------------------------------------------------------
# 7. MoodMap
# ---------------------------------------------------------------------------

@router.get("/{tenant_id}/moodmap", summary="MoodMap")
async def moodmap(
    tenant_id: str = Path(..., description="Tenant identifier"),
) -> dict:
    """Generate a timeline sentiment map from video comments."""
    logger.info("[%s] Generating MoodMap", tenant_id)

    comments, duration = get_moodmap_data()
    result = generate_moodmap(comments, duration)

    data = {
        "timeline": result["segments"],
        "spikes": result["spikes"],
        "summary": result["mood_summary"],
        "total_comments": result["total_comments"],
        "video_duration_seconds": result["video_duration"],
    }

    insights = [
        f"MoodMap: {result['mood_summary']}.",
        f"Mapped {result['total_comments']} comments across "
        f"{len(result['segments'])} segments.",
    ]
    if result["spikes"]:
        neg_spikes = [s for s in result["spikes"] if s["direction"] == "negative"]
        pos_spikes = [s for s in result["spikes"] if s["direction"] == "positive"]
        if neg_spikes:
            segs = ", ".join(str(s["segment_index"]) for s in neg_spikes)
            insights.append(f"Negative spike(s) in segment(s) {segs}.")
        if pos_spikes:
            segs = ", ".join(str(s["segment_index"]) for s in pos_spikes)
            insights.append(f"Positive spike(s) in segment(s) {segs}.")
    else:
        insights.append("No significant mood spikes detected.")

    return _envelope(tenant_id, data, insights)


# ---------------------------------------------------------------------------
# 8. Action Recommendations
# ---------------------------------------------------------------------------

@router.get("/{tenant_id}/actions", summary="Action Recommendations")
async def action_recommendations(
    tenant_id: str = Path(..., description="Tenant identifier"),
) -> dict:
    """Generate prioritised action recommendations from aggregated state."""
    logger.info("[%s] Generating action recommendations", tenant_id)

    # Aggregate system state from all modules
    rep_inputs = get_reputation_inputs()
    rep = calculate_reputation_score(
        rep_inputs["positive"], rep_inputs["negative"], rep_inputs["neutral"],
    )

    vel_data = get_velocity_data()
    vel = compute_velocity(vel_data)

    bot_comments = get_bot_comments()
    bot = analyze_authenticity(bot_comments)

    texts = get_narrative_texts()
    narratives = detect_narratives(texts, n_clusters=5)

    users = get_influencer_users()
    influencers = analyze_influencers(users)

    history = get_prediction_history()
    predictions = predict_sentiment(history)

    # Build alerts list for action engine
    alerts: list[dict] = []
    if vel["trend_direction"] == "declining" and vel["velocity"] == "rapid":
        alerts.append({"severity": "critical", "message": "Rapid sentiment decline"})
    if bot["bot_percentage"] >= 30:
        alerts.append({"severity": "high", "message": "High bot activity"})

    system_state = {
        "reputation_score": rep,
        "alerts": alerts,
        "narratives": narratives,
        "influencers": influencers,
        "bot_analysis": bot,
        "velocity": vel,
        "predictions": predictions,
    }

    actions = generate_recommendations(system_state)

    data = {
        "total_actions": len(actions),
        "actions": actions,
        "priority_breakdown": {
            "critical": sum(1 for a in actions if a["priority"] == "critical"),
            "high": sum(1 for a in actions if a["priority"] == "high"),
            "medium": sum(1 for a in actions if a["priority"] == "medium"),
            "low": sum(1 for a in actions if a["priority"] == "low"),
        },
    }

    insights = [f"Generated {len(actions)} recommended action(s)."]
    critical_count = data["priority_breakdown"]["critical"]
    if critical_count:
        insights.append(
            f"{critical_count} critical action(s) require immediate attention."
        )
    top = actions[0] if actions else None
    if top:
        insights.append(
            f"Top priority: [{top['priority'].upper()}] {top['category']} — "
            f"{top['description'][:120]}"
        )

    return _envelope(tenant_id, data, insights)


# ---------------------------------------------------------------------------
# 9. Predictive Engine
# ---------------------------------------------------------------------------

@router.get("/{tenant_id}/predictions", summary="Predictive Engine")
async def predictive_engine(
    tenant_id: str = Path(..., description="Tenant identifier"),
) -> dict:
    """Forecast sentiment for the next 24-48 hours."""
    logger.info("[%s] Running predictions", tenant_id)

    history = get_prediction_history()
    result = predict_sentiment(history, horizon_hours=48)

    data = {
        "forecast_24h": result["prediction_24h"],
        "forecast_48h": result["prediction_48h"],
        "confidence_interval": {
            "lower": result["confidence_interval"][0],
            "upper": result["confidence_interval"][1],
        },
        "trend": result["trend"],
        "predictions": result["predictions"],
        "model_info": result["model_info"],
    }

    insights = []
    if result["prediction_24h"] is not None:
        insights.append(
            f"24h forecast: {result['prediction_24h']:.1f} "
            f"(trend: {result['trend']})."
        )
    if result["prediction_48h"] is not None:
        lo, hi = result["confidence_interval"]
        insights.append(
            f"48h forecast: {result['prediction_48h']:.1f} "
            f"(CI: {lo:.1f} – {hi:.1f})."
        )
    if result["trend"] == "declining":
        insights.append(
            "Predicted decline — consider proactive engagement to reverse trend."
        )
    elif result["trend"] == "improving":
        insights.append(
            "Positive trajectory — maintain current strategy."
        )

    return _envelope(tenant_id, data, insights)


# ---------------------------------------------------------------------------
# 10. Campaign Impact
# ---------------------------------------------------------------------------

@router.get("/{tenant_id}/campaigns", summary="Campaign Impact")
async def campaign_impact(
    tenant_id: str = Path(..., description="Tenant identifier"),
) -> dict:
    """Measure before/after impact of reputation campaigns."""
    logger.info("[%s] Tracking campaign impact", tenant_id)

    before, after, campaign_name = get_campaign_data()
    result = track_campaign_impact(before, after, campaign_name)

    improved = [m for m in result["metric_changes"] if m["direction"] == "improved"]
    declined = [m for m in result["metric_changes"] if m["direction"] == "declined"]

    data = {
        "campaign_name": result["campaign_name"],
        "impact_score": result["improvement_score"],
        "impact_assessment": result["impact_assessment"],
        "before": before,
        "after": after,
        "metric_changes": result["metric_changes"],
        "improvements": {
            "improved_count": len(improved),
            "declined_count": len(declined),
            "total_metrics": len(result["metric_changes"]),
        },
        "recommendations": result["recommendations"],
    }

    insights = [result["summary"]]
    if improved:
        best = max(improved, key=lambda m: m["percent_change"])
        insights.append(
            f"Best improvement: {best['metric']} "
            f"({best['before']} → {best['after']}, "
            f"+{best['percent_change']:.1f}%)."
        )
    if declined:
        worst = min(declined, key=lambda m: m["percent_change"])
        insights.append(
            f"Area needing attention: {worst['metric']} declined by "
            f"{abs(worst['percent_change']):.1f}%."
        )
    insights.append(
        f"Overall assessment: {result['impact_assessment'].replace('_', ' ')}."
    )

    return _envelope(tenant_id, data, insights)
