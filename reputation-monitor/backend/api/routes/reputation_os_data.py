"""
Single-tenant sample data generators for REPUTATION OS endpoints.

All data is permanently scoped to Anil Ravipudi.
"""

from datetime import datetime, timezone, timedelta


# ---------------------------------------------------------------------------
# Reputation score inputs  (positive, negative, neutral counts)
# ---------------------------------------------------------------------------

def get_reputation_inputs() -> dict:
    return {"positive": 4200, "negative": 380, "neutral": 1420}


# ---------------------------------------------------------------------------
# Narrative texts
# ---------------------------------------------------------------------------

def get_narrative_texts() -> list[str]:
    base = [
        "Great video, the editing is absolutely fantastic!",
        "Love the new content style, keep it up!",
        "This is the best tutorial I have seen this year",
        "Amazing quality, subscribed immediately",
        "The music choice was perfect for this video",
        "Terrible clickbait, content was nothing like the title",
        "Worst video ever, total waste of time",
        "This is clearly a scam, do not trust this channel",
        "Fake reviews and paid promotions everywhere",
        "The lighting could be improved but overall decent",
        "Not bad, but I expected more in-depth analysis",
        "Pretty average, nothing special",
        "How does this compare to the competitor product?",
        "What camera equipment is being used here?",
        "Love the production quality, very professional",
    ]
    extras = [
        "Anil Ravipudi's direction in the new film was absolutely stunning",
        "Best direction from a Telugu filmmaker this year — Anil nailed it",
        "The chemistry between Anil Ravipudi's script and the ensemble cast was electric",
        "Anil Ravipudi keeps raising the bar with every new release",
        "That comedy sequence was incredible — Anil's best directorial work since F2",
        "The blockbuster brand franchise is selling like crazy among fans",
        "Anil Ravipudi's style at the event was pure fire",
        "Fan following keeps growing — he deserves every bit of success",
        "Subscribed for more Anil Ravipudi film analysis and reviews",
        "Recommending this to every Telugu cinema fan I know, brilliant work",
    ]
    return base + extras


# ---------------------------------------------------------------------------
# Bot detection comments
# ---------------------------------------------------------------------------

def get_bot_comments() -> list[dict]:
    base_time = datetime(2025, 6, 15, 14, 0, 0, tzinfo=timezone.utc)
    legitimate = [
        {
            "text": "Really enjoyed this tutorial, thanks!",
            "author": "alice_fan",
            "timestamp": base_time,
            "author_age_days": 800,
            "followers": 320,
        },
        {
            "text": "Can you do a follow-up on this topic?",
            "author": "bob_viewer",
            "timestamp": base_time + timedelta(minutes=5),
            "author_age_days": 450,
            "followers": 150,
        },
        {
            "text": "Bookmarked for later, great resource",
            "author": "carol_dev",
            "timestamp": base_time + timedelta(minutes=12),
            "author_age_days": 1200,
            "followers": 980,
        },
        {
            "text": "The production quality keeps getting better",
            "author": "long_time_sub",
            "timestamp": base_time + timedelta(hours=1),
            "author_age_days": 2000,
            "followers": 500,
        },
    ]

    bots_light = [
        {
            "text": "Check out my channel for free gift cards!!!",
            "author": "promo_bot_1",
            "timestamp": base_time + timedelta(seconds=10),
            "author_age_days": 2,
            "followers": 0,
        },
        {
            "text": "Check out my channel for free gift cards!!!",
            "author": "promo_bot_2",
            "timestamp": base_time + timedelta(seconds=15),
            "author_age_days": 3,
            "followers": 1,
        },
    ]

    return legitimate + bots_light


# ---------------------------------------------------------------------------
# Sentiment velocity data points
# ---------------------------------------------------------------------------

def get_velocity_data() -> list[tuple]:
    base = datetime(2025, 6, 15, 8, 0, 0, tzinfo=timezone.utc)
    scores = [
        72, 74, 71, 73, 75, 76, 78, 77, 80, 79,
        81, 82, 80, 83, 82, 84, 83, 85, 84, 86,
        85, 87, 86, 88, 87,
    ]
    return [(base + timedelta(hours=i), s) for i, s in enumerate(scores)]


# ---------------------------------------------------------------------------
# Prediction history
# ---------------------------------------------------------------------------

def get_prediction_history() -> list[dict]:
    base = datetime(2025, 6, 14, 0, 0, 0, tzinfo=timezone.utc)
    scores = [
        70, 72, 71, 73, 74, 76, 75, 77, 78, 80,
        79, 81, 82, 80, 83, 82, 84, 83, 85, 84,
        86, 85, 87, 88,
    ]
    return [
        {"timestamp": base + timedelta(hours=i), "score": s}
        for i, s in enumerate(scores)
    ]


# ---------------------------------------------------------------------------
# Influencer user data
# ---------------------------------------------------------------------------

def get_influencer_users() -> list[dict]:
    return [
        {"username": "tollywood_reviews", "posts": 55, "sentiment_avg": 0.82, "reach": 320000, "engagement": 9.5},
        {"username": "telugu_cinema_fan", "posts": 40, "sentiment_avg": 0.75, "reach": 180000, "engagement": 8.0},
        {"username": "rowdy_fanclub_official", "posts": 90, "sentiment_avg": 0.90, "reach": 15000, "engagement": 18.0},
        {"username": "south_film_daily", "posts": 30, "sentiment_avg": 0.45, "reach": 95000, "engagement": 5.5},
        {"username": "film_critic_hyderabad", "posts": 20, "sentiment_avg": -0.35, "reach": 120000, "engagement": 6.0},
        {"username": "entertainment_news_telugu", "posts": 12, "sentiment_avg": 0.10, "reach": 450000, "engagement": 3.5},
        {"username": "casual_moviegoer", "posts": 8, "sentiment_avg": 0.20, "reach": 800, "engagement": 1.2},
        {"username": "celebrity_style_tracker", "posts": 25, "sentiment_avg": 0.65, "reach": 200000, "engagement": 7.0},
    ]


# ---------------------------------------------------------------------------
# Moodmap comments + video duration
# ---------------------------------------------------------------------------

def get_moodmap_data() -> tuple[list[dict], int]:
    video_duration = 600  # 10-minute video

    comments = [
        {"timestamp_seconds": 5, "text": "Love the new intro, amazing!"},
        {"timestamp_seconds": 15, "text": "Best intro ever, fantastic editing"},
        {"timestamp_seconds": 30, "text": "Great start, really impressive quality"},
        {"timestamp_seconds": 50, "text": "The music is perfect here"},
        {"timestamp_seconds": 80, "text": "Interesting topic, good explanation"},
        {"timestamp_seconds": 120, "text": "This is really helpful, excellent content"},
        {"timestamp_seconds": 160, "text": "Nice breakdown, very clear"},
        {"timestamp_seconds": 200, "text": "Wonderful examples used here"},
        {"timestamp_seconds": 240, "text": "Great point, never thought of it that way"},
        {"timestamp_seconds": 280, "text": "This section is brilliant, superb"},
        {"timestamp_seconds": 310, "text": "Solid analysis, impressive research"},
        {"timestamp_seconds": 350, "text": "The editing transitions are so smooth"},
        {"timestamp_seconds": 390, "text": "Love this segment, fantastic work"},
        {"timestamp_seconds": 420, "text": "Beautiful visuals and great pacing"},
        {"timestamp_seconds": 460, "text": "Getting better and better"},
        {"timestamp_seconds": 500, "text": "Great conclusion, love it!"},
        {"timestamp_seconds": 530, "text": "Excellent summary, very impressive"},
        {"timestamp_seconds": 550, "text": "Amazing ending, best video yet"},
        {"timestamp_seconds": 570, "text": "Brilliant work, superb quality"},
        {"timestamp_seconds": 590, "text": "Perfect ending, subscribed immediately!"},
    ]
    return comments, video_duration


# ---------------------------------------------------------------------------
# Campaign before / after metrics
# ---------------------------------------------------------------------------

def get_campaign_data() -> tuple[dict, dict, str]:
    return (
        {
            "sentiment_score": 68.0,
            "positive_mentions": 3200,
            "negative_mentions": 450,
            "engagement_rate": 6.5,
            "follower_growth": 800,
            "bot_percentage": 8.0,
            "share_of_voice": 28.0,
            "reach": 180000,
        },
        {
            "sentiment_score": 82.0,
            "positive_mentions": 4800,
            "negative_mentions": 280,
            "engagement_rate": 9.2,
            "follower_growth": 1500,
            "bot_percentage": 5.0,
            "share_of_voice": 35.0,
            "reach": 260000,
        },
        "Brand Amplification Q2",
    )
