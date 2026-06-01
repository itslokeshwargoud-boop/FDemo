from collectors.youtube_collector import YouTubeCollector
from collectors.twitter_collector import TwitterCollector
from collectors.instagram_collector import InstagramCollector
from collectors.base_collector import BaseCollector

_collectors: dict[str, BaseCollector] = {}

SUPPORTED_PLATFORMS = ["youtube", "twitter", "instagram"]


def get_collector(platform: str) -> BaseCollector:
    global _collectors
    if platform not in _collectors:
        if platform == "youtube":
            _collectors[platform] = YouTubeCollector()
        elif platform == "twitter":
            _collectors[platform] = TwitterCollector()
        elif platform == "instagram":
            _collectors[platform] = InstagramCollector()
        else:
            raise ValueError(f"Unknown platform: {platform}. Supported: {SUPPORTED_PLATFORMS}")
    return _collectors[platform]


def get_all_collectors() -> list[BaseCollector]:
    return [get_collector(p) for p in SUPPORTED_PLATFORMS]
