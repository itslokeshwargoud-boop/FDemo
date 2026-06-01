"""
Narrative Detector — identifies thematic clusters from text data.

Uses TF-IDF vectorisation and K-Means clustering to group texts into
narrative threads, then generates human-readable labels and per-cluster
sentiment summaries.
"""

import logging
import re
from collections import Counter
from datetime import datetime, timezone, timedelta

logger = logging.getLogger(__name__)

try:
    import numpy as np
except ImportError:  # pragma: no cover
    np = None  # type: ignore[assignment]
    logger.warning("numpy not available — narrative detection disabled")

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.cluster import KMeans
except ImportError:  # pragma: no cover
    TfidfVectorizer = None  # type: ignore[assignment,misc]
    KMeans = None  # type: ignore[assignment,misc]
    logger.warning("scikit-learn not available — narrative detection disabled")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_STOPWORDS = frozenset(
    "the a an is was were are be been being have has had do does did will "
    "would shall should may might can could and but or nor for yet so at by "
    "to from in on of with as it its this that these those i me my we our "
    "you your he him his she her they them their what which who whom how "
    "not no all any each every both few more most other some such than too "
    "very just also back even still already about after before between into "
    "through during up down out off over under again further then once here "
    "there where when why".split()
)

_SIMPLE_POSITIVE = frozenset(
    "good great love amazing awesome excellent wonderful fantastic happy "
    "best perfect beautiful nice helpful impressive brilliant superb".split()
)

_SIMPLE_NEGATIVE = frozenset(
    "bad terrible awful hate worst horrible disgusting poor ugly annoying "
    "disappointing trash garbage scam fake fraud pathetic boring useless".split()
)


def _quick_sentiment(text: str) -> str:
    """Return 'positive', 'negative', or 'neutral' using keyword matching."""
    tokens = set(re.findall(r"[a-z]+", text.lower()))
    pos = len(tokens & _SIMPLE_POSITIVE)
    neg = len(tokens & _SIMPLE_NEGATIVE)
    if pos > neg:
        return "positive"
    if neg > pos:
        return "negative"
    return "neutral"


def _auto_label(texts: list[str], top_n: int = 3) -> str:
    """Generate a short label from the most frequent non-stop-word tokens."""
    word_counter: Counter[str] = Counter()
    for text in texts:
        tokens = re.findall(r"[a-z]{3,}", text.lower())
        word_counter.update(t for t in tokens if t not in _STOPWORDS)
    if not word_counter:
        return "Miscellaneous"
    top_words = [w for w, _ in word_counter.most_common(top_n)]
    return " / ".join(w.capitalize() for w in top_words)


# ---------------------------------------------------------------------------
# Core API
# ---------------------------------------------------------------------------

def detect_narratives(
    texts: list[str],
    n_clusters: int = 5,
    max_features: int = 5000,
    sample_size: int = 3,
) -> list[dict]:
    """Detect narrative clusters from a corpus of texts.

    Parameters
    ----------
    texts:
        Raw text strings to cluster.
    n_clusters:
        Target number of narrative clusters.  Automatically capped at the
        number of unique texts.
    max_features:
        Maximum vocabulary size for TF-IDF.
    sample_size:
        Number of representative texts to return per cluster.

    Returns
    -------
    List of dicts, each containing:
        label        — auto-generated cluster label
        percentage   — share of total texts (0-100)
        sample_texts — up to *sample_size* representative texts
        sentiment    — dominant sentiment of the cluster
        size         — absolute count of texts in the cluster
    """
    if np is None or TfidfVectorizer is None or KMeans is None:
        logger.error("Required libraries not installed")
        return []

    if not texts:
        return []

    n_clusters = min(n_clusters, len(set(texts)), len(texts))
    if n_clusters < 1:
        n_clusters = 1

    logger.info(
        "Running narrative detection on %d texts with %d clusters",
        len(texts),
        n_clusters,
    )

    vectorizer = TfidfVectorizer(
        max_features=max_features,
        stop_words="english",
        max_df=0.95,
        min_df=1,
    )
    tfidf_matrix = vectorizer.fit_transform(texts)

    km = KMeans(n_clusters=n_clusters, n_init=10, random_state=42)
    labels = km.fit_predict(tfidf_matrix)

    clusters: list[dict] = []
    total = len(texts)

    for cluster_id in range(n_clusters):
        indices = [i for i, lbl in enumerate(labels) if lbl == cluster_id]
        if not indices:
            continue

        cluster_texts = [texts[i] for i in indices]
        sentiments = [_quick_sentiment(t) for t in cluster_texts]
        sentiment_counts = Counter(sentiments)
        dominant_sentiment = sentiment_counts.most_common(1)[0][0]

        # Pick samples closest to cluster centre
        centre = km.cluster_centers_[cluster_id]
        subset = tfidf_matrix[indices].toarray()
        dists = np.sum((subset - centre) ** 2, axis=1)
        closest_idx = np.argsort(dists)[:sample_size]
        samples = [cluster_texts[int(ci)] for ci in closest_idx]

        clusters.append(
            {
                "label": _auto_label(cluster_texts),
                "percentage": round(len(indices) / total * 100, 1),
                "sample_texts": samples,
                "sentiment": dominant_sentiment,
                "size": len(indices),
            }
        )

    clusters.sort(key=lambda c: c["size"], reverse=True)
    logger.info("Narrative detection complete — %d clusters found", len(clusters))
    return clusters


# ---------------------------------------------------------------------------
# Sample data
# ---------------------------------------------------------------------------

def generate_sample_data() -> list[str]:
    """Return realistic dummy texts for offline testing."""
    return [
        "Great video, the editing is absolutely fantastic!",
        "Love the new content style, keep it up!",
        "This is the best tutorial I have seen this year",
        "Amazing quality, subscribed immediately",
        "The music choice was perfect for this video",
        "Terrible clickbait, content was nothing like the title",
        "Worst video ever, total waste of time",
        "This is clearly a scam, do not trust this channel",
        "Fake reviews and paid promotions everywhere",
        "Disgusting product placement disguised as content",
        "The lighting could be improved but overall decent",
        "Not bad, but I expected more in-depth analysis",
        "Pretty average, nothing special",
        "Could use better audio mixing in parts",
        "Some interesting points, but too long",
        "How does this compare to the competitor product?",
        "Can someone explain the pricing model?",
        "Where can I find the links mentioned in the video?",
        "What camera equipment is being used here?",
        "Does anyone know the background music track name?",
        "Love the production quality, very professional",
        "Excellent breakdown of the topic, well researched",
        "The editing transitions are so smooth and creative",
        "Hate this channel, unfollowing right now",
        "Another garbage video full of misinformation",
    ]


if __name__ == "__main__":
    sample = generate_sample_data()
    results = detect_narratives(sample, n_clusters=4)
    for cluster in results:
        print(f"\n[{cluster['label']}] — {cluster['percentage']}% "
              f"({cluster['sentiment']})")
        for t in cluster["sample_texts"]:
            print(f"  • {t}")
