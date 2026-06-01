"""
Prediction Engine — lightweight sentiment forecasting.

Combines simple linear regression with exponential smoothing to project
future sentiment scores and confidence intervals without heavy ML deps.
"""

import logging
import math
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None  # type: ignore[assignment]
    logger.warning("numpy not available — prediction engine disabled")


# ---------------------------------------------------------------------------
# Exponential smoothing
# ---------------------------------------------------------------------------

def _exponential_smoothing(values: list[float], alpha: float = 0.3) -> list[float]:
    """Simple (single) exponential smoothing."""
    if not values:
        return []
    smoothed = [values[0]]
    for v in values[1:]:
        smoothed.append(alpha * v + (1 - alpha) * smoothed[-1])
    return smoothed


# ---------------------------------------------------------------------------
# Core API
# ---------------------------------------------------------------------------

def predict_sentiment(
    history: list[dict],
    horizon_hours: int = 48,
    alpha: float = 0.3,
) -> dict:
    """Forecast future sentiment from historical data.

    Parameters
    ----------
    history:
        List of dicts with ``timestamp`` (datetime / epoch / ISO string)
        and ``score`` (float).
    horizon_hours:
        How many hours into the future to predict.
    alpha:
        Smoothing factor for exponential smoothing (0 < alpha < 1).

    Returns
    -------
    dict with keys:
        predictions          — list of {timestamp_offset_h, predicted_score}
        prediction_24h       — single score at +24 h
        prediction_48h       — single score at +horizon h (default 48)
        confidence_interval  — (lower, upper) band at the final prediction
        trend                — 'improving', 'declining', or 'stable'
        model_info           — metadata about the fit
    """
    if np is None:
        logger.error("numpy is required for prediction")
        return _empty_result()

    if len(history) < 3:
        logger.warning("Need at least 3 data points for prediction")
        return _empty_result()

    # -- parse & sort ----------------------------------------------------------
    parsed: list[tuple[float, float]] = []
    for entry in history:
        epoch = _to_epoch(entry.get("timestamp"))
        score = entry.get("score")
        if epoch is not None and score is not None:
            parsed.append((epoch, float(score)))
    parsed.sort(key=lambda p: p[0])

    if len(parsed) < 3:
        return _empty_result()

    epochs = np.array([p[0] for p in parsed])
    scores = np.array([p[1] for p in parsed])

    # Convert to hours relative to the first point
    hours = (epochs - epochs[0]) / 3600.0

    # -- linear regression ----------------------------------------------------
    coeffs = np.polyfit(hours, scores, 1)  # [slope, intercept]
    slope, intercept = float(coeffs[0]), float(coeffs[1])
    fitted = np.polyval(coeffs, hours)
    residuals = scores - fitted
    rmse = float(np.sqrt(np.mean(residuals ** 2)))

    # -- exponential smoothing for bias correction ----------------------------
    smoothed = _exponential_smoothing(scores.tolist(), alpha=alpha)
    last_smoothed = smoothed[-1] if smoothed else float(scores[-1])

    # Blend: 60 % linear trend + 40 % smoothed last value
    blend_weight = 0.6

    # -- generate predictions --------------------------------------------------
    last_hour = float(hours[-1])
    predictions: list[dict] = []
    step = max(1, horizon_hours // 24)

    for h_offset in range(step, horizon_hours + 1, step):
        future_h = last_hour + h_offset
        lr_pred = slope * future_h + intercept
        blended = blend_weight * lr_pred + (1 - blend_weight) * last_smoothed
        predictions.append({
            "timestamp_offset_h": h_offset,
            "predicted_score": round(float(blended), 2),
        })

    # Specific 24h / horizon predictions
    pred_24h_lr = slope * (last_hour + 24) + intercept
    pred_24h = round(
        float(blend_weight * pred_24h_lr + (1 - blend_weight) * last_smoothed), 2
    )

    pred_end_lr = slope * (last_hour + horizon_hours) + intercept
    pred_end = round(
        float(blend_weight * pred_end_lr + (1 - blend_weight) * last_smoothed), 2
    )

    # Confidence widens with horizon
    ci_base = 1.96 * rmse
    ci_end = ci_base * math.sqrt(horizon_hours / max(float(hours[-1] - hours[0]), 1.0))
    ci_end = max(ci_end, ci_base)  # floor at base
    confidence_interval = (
        round(pred_end - ci_end, 2),
        round(pred_end + ci_end, 2),
    )

    # Trend
    if slope > 0.05:
        trend = "improving"
    elif slope < -0.05:
        trend = "declining"
    else:
        trend = "stable"

    result = {
        "predictions": predictions,
        "prediction_24h": pred_24h,
        "prediction_48h": pred_end,
        "confidence_interval": confidence_interval,
        "trend": trend,
        "model_info": {
            "slope_per_hour": round(slope, 6),
            "intercept": round(intercept, 2),
            "rmse": round(rmse, 4),
            "smoothing_alpha": alpha,
            "data_points": len(parsed),
        },
    }
    logger.info(
        "Prediction complete — 24h: %.2f, %dh: %.2f, trend=%s",
        pred_24h,
        horizon_hours,
        pred_end,
        trend,
    )
    return result


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _to_epoch(ts) -> float | None:
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


def _empty_result() -> dict:
    return {
        "predictions": [],
        "prediction_24h": None,
        "prediction_48h": None,
        "confidence_interval": (None, None),
        "trend": "stable",
        "model_info": {},
    }


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

def generate_sample_data() -> list[dict]:
    """Return realistic historical sentiment data (24 hourly readings)."""
    base = datetime(2025, 6, 1, 0, 0, 0, tzinfo=timezone.utc)
    scores = [
        65, 66, 64, 63, 60, 58, 55, 50, 45, 42,
        40, 38, 40, 43, 46, 50, 53, 55, 57, 58,
        60, 61, 59, 62,
    ]
    return [
        {"timestamp": base + timedelta(hours=i), "score": s}
        for i, s in enumerate(scores)
    ]


if __name__ == "__main__":
    data = generate_sample_data()
    result = predict_sentiment(data, horizon_hours=48)
    print(f"24h prediction: {result['prediction_24h']}")
    print(f"48h prediction: {result['prediction_48h']}")
    print(f"Confidence interval: {result['confidence_interval']}")
    print(f"Trend: {result['trend']}")
    print(f"Model: {result['model_info']}")
