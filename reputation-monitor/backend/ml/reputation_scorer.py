def calculate_reputation_score(positive: int, negative: int, neutral: int) -> dict:
    """
    Calculate a reputation score between -100 and +100.

    Score formula:
    - Weight neutrals at 50% positive
    - Score = ((weighted_positive - negative) / total) * 100
    """
    total = positive + negative + neutral
    if total == 0:
        return {
            "score": 0.0,
            "negative_ratio": 0.0,
            "risk_level": "low",
            "positive_count": 0,
            "negative_count": 0,
            "neutral_count": 0,
            "total_count": 0,
        }
    weighted_positive = positive + (neutral * 0.5)
    raw_score = ((weighted_positive - negative) / total) * 100
    score = round(max(-100.0, min(100.0, raw_score)), 2)
    negative_ratio = round((negative / total) * 100, 2)
    risk_level = "low" if negative_ratio < 20 else "moderate" if negative_ratio < 40 else "high"
    return {
        "score": score,
        "negative_ratio": negative_ratio,
        "risk_level": risk_level,
        "positive_count": positive,
        "negative_count": negative,
        "neutral_count": neutral,
        "total_count": total,
    }
