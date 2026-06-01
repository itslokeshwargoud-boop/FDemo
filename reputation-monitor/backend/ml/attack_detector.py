import networkx as nx
from difflib import SequenceMatcher
from datetime import datetime, timezone
import logging

logger = logging.getLogger(__name__)


class AttackDetector:
    SIGNAL_WEIGHTS = {
        "multiple_negative_posts_in_24h": 3,
        "posts_within_60_seconds_of_each_other": 3,
        "text_similarity_above_85_percent": 5,
        "account_under_30_days_old": 20,
        "follower_count_under_50": 20,
    }

    def calculate_user_risk_score(self, author: dict, negative_posts_in_24h: int) -> float:
        score = 0.0
        if negative_posts_in_24h >= 3:
            score += self.SIGNAL_WEIGHTS["multiple_negative_posts_in_24h"] * negative_posts_in_24h
        if author.get("followers_count", 999) < 50:
            score += self.SIGNAL_WEIGHTS["follower_count_under_50"]
        account_created = author.get("account_created_at")
        if account_created and (datetime.now(timezone.utc).replace(tzinfo=None) - account_created).days < 30:
            score += self.SIGNAL_WEIGHTS["account_under_30_days_old"]
        return min(score, 100.0)

    def detect_coordinated_clusters(
        self, posts: list[dict], min_cluster_size: int = 3
    ) -> list[list[str]]:
        G = nx.Graph()
        negative_posts = [p for p in posts if p.get("sentiment") == "negative"]
        for i, post_a in enumerate(negative_posts):
            for post_b in negative_posts[i + 1:]:
                if post_a["author_id"] == post_b["author_id"]:
                    continue
                similarity = SequenceMatcher(
                    None, post_a["content"], post_b["content"]
                ).ratio()
                time_diff = abs(
                    (post_a["posted_at"] - post_b["posted_at"]).total_seconds()
                )
                edge_weight = 0
                if similarity > 0.85:
                    edge_weight += self.SIGNAL_WEIGHTS["text_similarity_above_85_percent"]
                if time_diff <= 60:
                    edge_weight += self.SIGNAL_WEIGHTS["posts_within_60_seconds_of_each_other"]
                if edge_weight > 0:
                    if G.has_edge(post_a["author_id"], post_b["author_id"]):
                        G[post_a["author_id"]][post_b["author_id"]]["weight"] += edge_weight
                    else:
                        G.add_edge(
                            post_a["author_id"],
                            post_b["author_id"],
                            weight=edge_weight,
                        )
        clusters = [
            list(c) for c in nx.connected_components(G) if len(c) >= min_cluster_size
        ]
        logger.info(f"Detected {len(clusters)} coordinated attack clusters")
        return clusters

    def calculate_cluster_confidence(self, cluster: list[str], G: nx.Graph) -> float:
        """Calculate a 0-1 confidence score for a cluster based on edge weights."""
        if len(cluster) < 2:
            return 0.0
        subgraph = G.subgraph(cluster)
        total_weight = sum(d.get("weight", 0) for _, _, d in subgraph.edges(data=True))
        max_edges = len(cluster) * (len(cluster) - 1) / 2
        max_weight = max_edges * max(self.SIGNAL_WEIGHTS.values())
        return round(min(total_weight / max(max_weight, 1), 1.0), 4)
