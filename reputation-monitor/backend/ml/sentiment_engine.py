from transformers import pipeline as hf_pipeline
import logging

logger = logging.getLogger(__name__)


class SentimentEngine:
    MODEL_NAME = "cardiffnlp/twitter-roberta-base-sentiment-latest"
    LABEL_MAP = {"LABEL_0": "negative", "LABEL_1": "neutral", "LABEL_2": "positive"}
    _instance = None

    def __init__(self, device: int = -1):
        logger.info(f"Loading sentiment model: {self.MODEL_NAME}")
        self.classifier = hf_pipeline(
            "sentiment-analysis",
            model=self.MODEL_NAME,
            device=device,
            batch_size=32,
            truncation=True,
            max_length=512,
        )
        logger.info("Sentiment model loaded successfully")

    @classmethod
    def get_instance(cls, device: int = -1) -> "SentimentEngine":
        if cls._instance is None:
            cls._instance = cls(device=device)
        return cls._instance

    def analyze_batch(self, texts: list[str]) -> list[dict]:
        if not texts:
            return []
        results = self.classifier(texts)
        return [
            {
                "sentiment": self.LABEL_MAP.get(r["label"], "neutral"),
                "confidence": round(r["score"], 4),
            }
            for r in results
        ]

    def analyze_single(self, text: str) -> dict:
        results = self.analyze_batch([text])
        return results[0] if results else {"sentiment": "neutral", "confidence": 0.0}
