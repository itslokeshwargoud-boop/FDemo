/**
 * Sentiment analysis using the HuggingFace model:
 * tabularisai/multilingual-sentiment-analysis
 *
 * Strategy:
 *  1. Primary: HuggingFace Inference API (free for public models)
 *  2. Fallback: Simple lexicon-based analysis
 *
 * All outputs are normalized to exactly one of: "positive" | "negative" | "neutral"
 *
 * Results are cached in SQLite via talkCache to avoid repeated inference.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SentimentLabel = "positive" | "negative" | "neutral";

const HF_MODEL = "tabularisai/multilingual-sentiment-analysis";
const HF_API_URL = `https://api-inference.huggingface.co/models/${HF_MODEL}`;

// ---------------------------------------------------------------------------
// Label normalization
// ---------------------------------------------------------------------------

/**
 * The tabularisai/multilingual-sentiment-analysis model returns labels such as:
 *   "Very Positive", "Positive", "Neutral", "Negative", "Very Negative"
 *   or sometimes "1 star" through "5 stars"
 *
 * We normalize all of these to exactly one of the three required labels.
 */
export function normalizeLabel(raw: string): SentimentLabel {
  const lower = raw.toLowerCase().trim();

  // Star-based labels
  if (lower.includes("5 star") || lower.includes("4 star")) return "positive";
  if (lower.includes("3 star")) return "neutral";
  if (lower.includes("2 star") || lower.includes("1 star")) return "negative";

  // Text-based labels
  if (lower.includes("very positive") || lower === "positive") return "positive";
  if (lower.includes("very negative") || lower === "negative") return "negative";
  if (lower === "neutral") return "neutral";

  // Broader matching
  if (lower.includes("positive")) return "positive";
  if (lower.includes("negative")) return "negative";

  return "neutral";
}

// ---------------------------------------------------------------------------
// HuggingFace Inference API
// ---------------------------------------------------------------------------

interface HfClassification {
  label: string;
  score: number;
}

/**
 * Call the HuggingFace Inference API for a batch of texts.
 * Returns null on failure (caller should use fallback).
 */
async function callHfApi(texts: string[]): Promise<HfClassification[][] | null> {
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const hfToken = process.env.HF_TOKEN;
    if (hfToken) {
      headers["Authorization"] = `Bearer ${hfToken}`;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);

    const response = await fetch(HF_API_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({ inputs: texts }),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`HF API returned ${response.status}: ${await response.text()}`);
      return null;
    }

    const data = await response.json();

    // Single input returns [{ label, score }, ...], batch returns [[...], [...]]
    if (texts.length === 1 && Array.isArray(data) && !Array.isArray(data[0])) {
      return [data as HfClassification[]];
    }

    return data as HfClassification[][];
  } catch (err) {
    console.warn("HF Inference API unavailable, using fallback:", err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Lexicon-based fallback
// ---------------------------------------------------------------------------

const POSITIVE_WORDS = new Set([
  "love", "great", "awesome", "amazing", "excellent", "wonderful", "fantastic",
  "beautiful", "best", "happy", "good", "nice", "cool", "perfect", "brilliant",
  "superb", "outstanding", "incredible", "impressive", "delightful", "enjoy",
  "thank", "thanks", "helpful", "recommend", "favorite", "favourite", "blessed",
  "inspired", "inspiring", "phenomenal", "remarkable", "solid", "fire", "goat",
]);

const NEGATIVE_WORDS = new Set([
  "hate", "terrible", "awful", "bad", "worst", "horrible", "disgusting", "ugly",
  "stupid", "boring", "trash", "garbage", "pathetic", "annoying", "disappointing",
  "waste", "scam", "fake", "poor", "useless", "broken", "sucks", "dumb", "lame",
  "overrated", "mediocre", "cringe", "toxic", "clickbait", "misleading",
]);

export function fallbackSentiment(text: string): SentimentLabel {
  const lower = text.toLowerCase();
  const words = lower.split(/\W+/);

  let posCount = 0;
  let negCount = 0;

  for (const word of words) {
    if (POSITIVE_WORDS.has(word)) posCount++;
    if (NEGATIVE_WORDS.has(word)) negCount++;
  }

  if (posCount > negCount) return "positive";
  if (negCount > posCount) return "negative";
  return "neutral";
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Analyze sentiment for a batch of texts.
 * Uses the HuggingFace model when available, falls back to lexicon-based analysis.
 *
 * @param texts - Array of text strings to analyze
 * @returns Array of sentiment labels in the same order
 */
export async function analyzeSentimentBatch(texts: string[]): Promise<SentimentLabel[]> {
  if (texts.length === 0) return [];

  // Try HuggingFace Inference API first
  const hfResults = await callHfApi(texts);

  if (hfResults && hfResults.length === texts.length) {
    return hfResults.map((classifications) => {
      // The top classification (highest score) determines the sentiment
      if (!classifications || classifications.length === 0) return "neutral";
      const top = classifications.reduce((a, b) => (b.score > a.score ? b : a));
      return normalizeLabel(top.label);
    });
  }

  // Fallback: lexicon-based analysis
  return texts.map(fallbackSentiment);
}

/**
 * Analyze sentiment for a single text.
 */
export async function analyzeSentiment(text: string): Promise<SentimentLabel> {
  const [result] = await analyzeSentimentBatch([text]);
  return result;
}
