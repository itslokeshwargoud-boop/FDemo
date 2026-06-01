"""
Action Engine — generates AI-driven, prioritised recommendations.

Consumes the combined outputs of every other REPUTATION OS module and
produces a ranked list of concrete actions the operator should take.
"""

import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Priority levels and thresholds
# ---------------------------------------------------------------------------

PRIORITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


# ---------------------------------------------------------------------------
# Rule functions — each returns a list of action dicts
# ---------------------------------------------------------------------------

def _rules_reputation(state: dict) -> list[dict]:
    actions: list[dict] = []
    score = state.get("reputation_score")
    if score is None:
        return actions
    if isinstance(score, dict):
        score = score.get("score", score.get("value", 0))
    score = float(score)

    if score < -50:
        actions.append({
            "priority": "critical",
            "category": "reputation_recovery",
            "description": (
                "Reputation score critically low ({:.0f}). Activate crisis "
                "communication protocol immediately.".format(score)
            ),
            "expected_impact": "Prevent further decline and begin recovery",
        })
    elif score < 0:
        actions.append({
            "priority": "high",
            "category": "reputation_recovery",
            "description": (
                "Reputation score negative ({:.0f}). Publish positive "
                "counter-narratives and engage community advocates.".format(score)
            ),
            "expected_impact": "Shift sentiment toward neutral within 48 h",
        })
    elif score < 30:
        actions.append({
            "priority": "medium",
            "category": "reputation_improvement",
            "description": (
                "Reputation score is below average ({:.0f}). Increase "
                "positive content cadence and amplify supporter voices.".format(score)
            ),
            "expected_impact": "Incremental score improvement over 1-2 weeks",
        })
    return actions


def _rules_alerts(state: dict) -> list[dict]:
    actions: list[dict] = []
    alerts = state.get("alerts", [])
    if not alerts:
        return actions

    critical_alerts = [a for a in alerts if a.get("severity") == "critical"]
    high_alerts = [a for a in alerts if a.get("severity") == "high"]

    if critical_alerts:
        actions.append({
            "priority": "critical",
            "category": "alert_response",
            "description": (
                f"{len(critical_alerts)} critical alert(s) active. "
                "Triage and respond within 1 hour."
            ),
            "expected_impact": "Contain reputational damage before viral spread",
        })
    if high_alerts:
        actions.append({
            "priority": "high",
            "category": "alert_response",
            "description": (
                f"{len(high_alerts)} high-severity alert(s) require attention. "
                "Review and assign owners."
            ),
            "expected_impact": "Prevent escalation to critical status",
        })
    return actions


def _rules_narratives(state: dict) -> list[dict]:
    actions: list[dict] = []
    narratives = state.get("narratives", [])
    negative = [n for n in narratives if n.get("sentiment") == "negative"]

    for n in negative:
        pct = n.get("percentage", 0)
        if pct >= 20:
            actions.append({
                "priority": "high",
                "category": "narrative_management",
                "description": (
                    f"Negative narrative \"{n.get('label', 'unknown')}\" "
                    f"represents {pct}% of conversation. "
                    "Prepare targeted counter-messaging."
                ),
                "expected_impact": "Reduce negative narrative share by 30-50 %",
            })
        elif pct >= 10:
            actions.append({
                "priority": "medium",
                "category": "narrative_management",
                "description": (
                    f"Monitor growing negative narrative "
                    f"\"{n.get('label', 'unknown')}\" ({pct}%)."
                ),
                "expected_impact": "Early intervention prevents escalation",
            })
    return actions


def _rules_bots(state: dict) -> list[dict]:
    actions: list[dict] = []
    bot = state.get("bot_analysis", {})
    bot_pct = bot.get("bot_percentage", 0)

    if bot_pct >= 30:
        actions.append({
            "priority": "high",
            "category": "platform_integrity",
            "description": (
                f"Bot activity at {bot_pct}%. Report suspicious accounts "
                "to platform and enable stricter comment moderation."
            ),
            "expected_impact": "Remove inauthentic signals from metrics",
        })
    elif bot_pct >= 10:
        actions.append({
            "priority": "medium",
            "category": "platform_integrity",
            "description": (
                f"Moderate bot activity detected ({bot_pct}%). "
                "Monitor and consider keyword filters."
            ),
            "expected_impact": "Reduce spam by 50 %",
        })
    return actions


def _rules_velocity(state: dict) -> list[dict]:
    actions: list[dict] = []
    vel = state.get("velocity", {})
    if vel.get("velocity") == "rapid" and vel.get("trend_direction") == "declining":
        actions.append({
            "priority": "critical",
            "category": "crisis_response",
            "description": (
                "Sentiment declining rapidly "
                f"({vel.get('rate_per_hour', 0):.2f}/h). "
                "Activate real-time monitoring and prepare holding statement."
            ),
            "expected_impact": "Faster response reduces peak negative impact",
        })
    elif vel.get("trend_direction") == "declining":
        actions.append({
            "priority": "medium",
            "category": "monitoring",
            "description": (
                "Sentiment trend is declining. Increase monitoring "
                "frequency and prepare contingency responses."
            ),
            "expected_impact": "Readiness to act if decline accelerates",
        })
    return actions


def _rules_predictions(state: dict) -> list[dict]:
    actions: list[dict] = []
    pred = state.get("predictions", {})
    pred_24 = pred.get("prediction_24h")
    if pred_24 is not None and pred_24 < 30:
        actions.append({
            "priority": "high",
            "category": "proactive_engagement",
            "description": (
                f"Predicted 24 h sentiment score is {pred_24}. Proactively "
                "engage top influencers and prepare positive content."
            ),
            "expected_impact": "Pre-empt sentiment dip with positive signals",
        })
    return actions


def _rules_influencers(state: dict) -> list[dict]:
    actions: list[dict] = []
    influencers = state.get("influencers", {})
    top = influencers.get("ranked_influencers", [])

    attackers = [u for u in top if u.get("classification") == "Attacker"]
    supporters = [u for u in top if u.get("classification") == "Supporter"]

    if attackers:
        actions.append({
            "priority": "high",
            "category": "influencer_management",
            "description": (
                f"{len(attackers)} hostile influencer(s) identified "
                f"(e.g. {attackers[0].get('username', '?')}). "
                "Engage directly or prepare counter-narrative."
            ),
            "expected_impact": "Neutralise amplified negative reach",
        })
    if supporters:
        actions.append({
            "priority": "medium",
            "category": "influencer_management",
            "description": (
                f"Activate {len(supporters)} identified supporter(s) "
                "to amplify positive messaging."
            ),
            "expected_impact": "Organic positive signal boost",
        })
    return actions


# ---------------------------------------------------------------------------
# Core API
# ---------------------------------------------------------------------------

_RULE_FUNCTIONS = [
    _rules_reputation,
    _rules_alerts,
    _rules_narratives,
    _rules_bots,
    _rules_velocity,
    _rules_predictions,
    _rules_influencers,
]


def generate_recommendations(system_state: dict) -> list[dict]:
    """Produce a prioritised list of actions from the full system state.

    Parameters
    ----------
    system_state:
        Dict that may contain any of the following keys (all optional):
        ``reputation_score``, ``alerts``, ``narratives``, ``influencers``,
        ``bot_analysis``, ``velocity``, ``predictions``.

    Returns
    -------
    List of action dicts sorted by priority (critical → low), each with:
        priority        — 'critical', 'high', 'medium', or 'low'
        category        — action domain
        description     — human-readable recommendation
        expected_impact — expected outcome if action is taken
    """
    if not system_state:
        return []

    logger.info("Generating recommendations from system state")
    actions: list[dict] = []
    for rule_fn in _RULE_FUNCTIONS:
        actions.extend(rule_fn(system_state))

    if not actions:
        actions.append({
            "priority": "low",
            "category": "maintenance",
            "description": "All systems nominal. Continue routine monitoring.",
            "expected_impact": "Sustained reputation health",
        })

    actions.sort(key=lambda a: PRIORITY_ORDER.get(a["priority"], 99))
    logger.info("Generated %d recommendations", len(actions))
    return actions


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

def generate_sample_data() -> dict:
    """Return a realistic system state dict for offline testing."""
    return {
        "reputation_score": {"score": -15, "risk_level": "moderate"},
        "alerts": [
            {"severity": "critical", "message": "Spike in negative mentions"},
            {"severity": "high", "message": "Competitor campaign detected"},
        ],
        "narratives": [
            {
                "label": "Product quality",
                "percentage": 25,
                "sentiment": "negative",
            },
            {
                "label": "Customer service",
                "percentage": 15,
                "sentiment": "neutral",
            },
        ],
        "bot_analysis": {
            "bot_percentage": 35,
            "suspicious_accounts": ["bot_1", "bot_2"],
        },
        "velocity": {
            "velocity": "rapid",
            "rate_per_hour": -3.5,
            "trend_direction": "declining",
        },
        "predictions": {
            "prediction_24h": 22,
            "prediction_48h": 18,
            "trend": "declining",
        },
        "influencers": {
            "ranked_influencers": [
                {
                    "username": "critic_mike",
                    "classification": "Attacker",
                    "influence_score": 88,
                },
                {
                    "username": "fan_sarah",
                    "classification": "Supporter",
                    "influence_score": 75,
                },
            ]
        },
    }


if __name__ == "__main__":
    state = generate_sample_data()
    recs = generate_recommendations(state)
    for r in recs:
        print(f"[{r['priority'].upper()}] {r['category']}")
        print(f"  {r['description']}")
        print(f"  Impact: {r['expected_impact']}\n")
