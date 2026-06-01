"""
Sentiment Velocity — measures the rate of sentiment change over time.

Computes first-derivative (velocity) and second-derivative (acceleration)
of sentiment scores across configurable time windows.
"""

import logging
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None  # type: ignore[assignment]
    logger.warning("numpy not available — sentiment velocity degraded")


# ---------------------------------------------------------------------------
# Core API
# ---------------------------------------------------------------------------

def compute_velocity(
    data_points: list[tuple],
    window_hours: float = 1.0,
) -> dict:
    """Compute the rate and direction of sentiment change.

    Parameters
    ----------
    data_points:
        List of ``(timestamp, sentiment_score)`` tuples.
        *timestamp* may be a :class:`datetime`, a Unix epoch ``float``,
        or an ISO-8601 string.  *sentiment_score* is a float (typically
        between -1 and 1 or 0 and 100).
    window_hours:
        Size of the rolling window used to smooth the velocity estimate.

    Returns
    -------
    dict with keys:
        velocity          — 'rapid', 'moderate', or 'slow'
        rate_per_hour     — numeric change per hour
        trend_direction   — 'improving', 'declining', or 'stable'
        acceleration      — second derivative (change in velocity)
        data_points_used  — number of valid data points
        time_span_hours   — total duration of the input data
        window_scores     — list of per-window average scores
    """
    if np is None:
        logger.error("numpy is required for velocity computation")
        return _empty_result()

    if len(data_points) < 2:
        return _empty_result(data_points_used=len(data_points))

    # -- normalise timestamps to epoch seconds --------------------------------
    parsed: list[tuple[float, float]] = []
    for ts, score in data_points:
        epoch = _to_epoch(ts)
        if epoch is not None:
            parsed.append((epoch, float(score)))
    parsed.sort(key=lambda p: p[0])

    if len(parsed) < 2:
        return _empty_result(data_points_used=len(parsed))

    epochs = np.array([p[0] for p in parsed])
    scores = np.array([p[1] for p in parsed])

    time_span_s = float(epochs[-1] - epochs[0])
    time_span_h = time_span_s / 3600.0 if time_span_s > 0 else 0.001

    # -- rolling windows ------------------------------------------------------
    window_s = window_hours * 3600.0
    window_scores: list[float] = []
    t = epochs[0]
    while t <= epochs[-1]:
        mask = (epochs >= t) & (epochs < t + window_s)
        if mask.any():
            window_scores.append(float(np.mean(scores[mask])))
        t += window_s

    if len(window_scores) < 2:
        window_scores = [float(scores[0]), float(scores[-1])]

    # -- velocity (first derivative) ------------------------------------------
    ws = np.array(window_scores)
    deltas = np.diff(ws)
    avg_delta = float(np.mean(deltas)) if len(deltas) > 0 else 0.0
    rate_per_hour = round(avg_delta / window_hours, 6)

    abs_rate = abs(rate_per_hour)
    if abs_rate >= 5.0:
        velocity_label = "rapid"
    elif abs_rate >= 1.0:
        velocity_label = "moderate"
    else:
        velocity_label = "slow"

    # -- trend direction ------------------------------------------------------
    if rate_per_hour > 0.05:
        trend = "improving"
    elif rate_per_hour < -0.05:
        trend = "declining"
    else:
        trend = "stable"

    # -- acceleration (second derivative) -------------------------------------
    if len(deltas) >= 2:
        second_deltas = np.diff(deltas)
        acceleration = round(float(np.mean(second_deltas)) / window_hours, 6)
    else:
        acceleration = 0.0

    result = {
        "velocity": velocity_label,
        "rate_per_hour": rate_per_hour,
        "trend_direction": trend,
        "acceleration": acceleration,
        "data_points_used": len(parsed),
        "time_span_hours": round(time_span_h, 2),
        "window_scores": [round(s, 4) for s in window_scores],
    }
    logger.info(
        "Velocity: %s (%.4f/h), trend=%s, accel=%.4f",
        velocity_label,
        rate_per_hour,
        trend,
        acceleration,
    )
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_epoch(ts) -> float | None:
    """Convert various timestamp representations to a Unix epoch float."""
    if isinstance(ts, (int, float)):
        return float(ts)
    if isinstance(ts, datetime):
        return ts.timestamp()
    if isinstance(ts, str):
        try:
            return datetime.fromisoformat(ts).timestamp()
        except (ValueError, TypeError):
            return None
    return None


def _empty_result(data_points_used: int = 0) -> dict:
    return {
        "velocity": "slow",
        "rate_per_hour": 0.0,
        "trend_direction": "stable",
        "acceleration": 0.0,
        "data_points_used": data_points_used,
        "time_span_hours": 0.0,
        "window_scores": [],
    }


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

def generate_sample_data() -> list[tuple]:
    """Return realistic (timestamp, score) tuples simulating a sentiment dip."""
    base = datetime(2025, 6, 1, 8, 0, 0, tzinfo=timezone.utc)
    points: list[tuple] = []
    scores = [
        # Stable positive morning
        72, 74, 71, 73, 75,
        # Sharp dip (crisis)
        65, 50, 38, 30, 25,
        # Slow recovery
        28, 32, 35, 40, 44, 48, 52, 55, 58, 60,
        # Stabilisation
        61, 62, 60, 63, 62,
    ]
    for i, score in enumerate(scores):
        points.append((base + timedelta(hours=i), score))
    return points


if __name__ == "__main__":
    sample = generate_sample_data()
    result = compute_velocity(sample)
    print(f"Velocity : {result['velocity']}")
    print(f"Rate/hour: {result['rate_per_hour']}")
    print(f"Trend    : {result['trend_direction']}")
    print(f"Accel    : {result['acceleration']}")
    print(f"Span     : {result['time_span_hours']}h over {result['data_points_used']} points")
