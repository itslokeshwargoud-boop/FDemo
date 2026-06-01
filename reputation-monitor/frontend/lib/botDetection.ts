/**
 * Bot / suspicious-comment detection for Talk comments.
 *
 * Deterministic, explainable, heuristic-based scoring (no ML).
 * Each comment receives:
 *   - botScore   (0–100)
 *   - botLabel   ("human" | "suspicious" | "bot")
 *   - botReasons (string[] of triggered rules)
 *
 * Signals:
 *   1. Per-video duplicate text
 *   2. Per-keyword duplicate text (cross-video coordinated spam)
 *   3. URL / spam-keyword presence
 *   4. Low-quality / generic comments
 *   5. High emoji ratio
 *   6. Excessive repeated characters / punctuation
 *   7. Burst timing (many comments in a short window)
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type BotLabel = "human" | "suspicious" | "bot";

export interface BotResult {
  botScore: number;
  botLabel: BotLabel;
  botReasons: string[];
}

export interface CommentInput {
  commentId: string;
  videoId: string;
  text: string;
  publishedAt: string;
  keyword: string;
}

// ---------------------------------------------------------------------------
// 1. Text normalisation
// ---------------------------------------------------------------------------

const URL_RE = /https?:\/\/[^\s]+/gi;
const PUNCT_RE = /[^\w\s]/g;
const MULTI_SPACE_RE = /\s{2,}/g;
const REPEATED_CHAR_RE = /(.)\1{2,}/g; // 3+ repeated chars → collapse to 2

export function normalizeText(raw: string): string {
  let t = raw.toLowerCase().trim();
  t = t.replace(URL_RE, "");          // strip URLs
  t = t.replace(PUNCT_RE, " ");       // strip punctuation
  t = t.replace(REPEATED_CHAR_RE, "$1$1"); // collapse repeated chars
  t = t.replace(MULTI_SPACE_RE, " "); // collapse whitespace
  return t.trim();
}

// ---------------------------------------------------------------------------
// 2. Signal helpers
// ---------------------------------------------------------------------------

/** Check if text contains one or more URLs. */
export function containsUrl(text: string): boolean {
  // Use a fresh regex each time to avoid global lastIndex issues
  return /https?:\/\/[^\s]+/i.test(text);
}

const SPAM_KEYWORDS = new Set([
  "subscribe", "giveaway", "telegram", "whatsapp", "earn", "promo",
  "free", "click", "link in bio", "check my", "crypto", "nft",
  "make money", "dm me", "join my", "follow me", "win big",
  "discount", "offer", "limited time", "act now",
]);

export function countSpamKeywords(text: string): number {
  const lower = text.toLowerCase();
  let count = 0;
  for (const kw of SPAM_KEYWORDS) {
    if (lower.includes(kw)) count++;
  }
  return count;
}

const GENERIC_SHORT = new Set([
  "nice", "super", "first", "legend", "wow", "cool", "great",
  "amazing", "lol", "love", "fire", "best", "hi", "hello",
  "good", "yes", "no", "ok", "okay", "same", "true",
]);

export function isGenericShort(text: string): boolean {
  const words = text.trim().split(/\s+/);
  if (words.length > 4) return false;
  return words.every((w) => GENERIC_SHORT.has(w.toLowerCase().replace(/[^\w]/g, "")));
}

// Emoji regex: covers most common emoji codepoints
const EMOJI_RE = /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{200D}\u{20E3}]/gu;

export function emojiRatio(text: string): number {
  if (!text || text.length === 0) return 0;
  const emojiMatches = text.match(EMOJI_RE);
  if (!emojiMatches) return 0;
  // count code-point characters
  const totalChars = [...text].length;
  if (totalChars === 0) return 0;
  return emojiMatches.length / totalChars;
}

const EXCESSIVE_PUNCT_RE = /([!?$#@%^&*])\1{3,}/;

export function hasExcessivePunctuation(text: string): boolean {
  return EXCESSIVE_PUNCT_RE.test(text);
}

// ---------------------------------------------------------------------------
// 3. Burst detection
// ---------------------------------------------------------------------------

const BURST_WINDOW_MS = 120_000; // 2 minutes
const BURST_THRESHOLD = 60;

/**
 * Given a map of videoId → list of publishedAt ISO strings, return a
 * Set of (videoId, windowStart) pairs that exceed the burst threshold.
 *
 * For efficiency, we bucket comments into windows and count.
 */
export function detectBurstWindows(
  commentsByVideo: Map<string, string[]>
): Set<string> {
  const burstKeys = new Set<string>();

  for (const [videoId, timestamps] of commentsByVideo) {
    if (timestamps.length < BURST_THRESHOLD) continue;

    // bucket by window
    const buckets = new Map<number, number>();
    for (const ts of timestamps) {
      const t = new Date(ts).getTime();
      if (Number.isNaN(t)) continue;
      const bucket = Math.floor(t / BURST_WINDOW_MS);
      buckets.set(bucket, (buckets.get(bucket) ?? 0) + 1);
    }

    // Also do mean+3*std check
    const counts = [...buckets.values()];
    const mean = counts.reduce((a, b) => a + b, 0) / (counts.length || 1);
    const std = Math.sqrt(
      counts.reduce((a, b) => a + (b - mean) ** 2, 0) / (counts.length || 1)
    );
    const dynamicThreshold = mean + 3 * std;

    for (const [bucket, count] of buckets) {
      if (count >= BURST_THRESHOLD || count > dynamicThreshold) {
        burstKeys.add(`${videoId}:${bucket}`);
      }
    }
  }

  return burstKeys;
}

export function getBurstKey(videoId: string, publishedAt: string): string {
  const t = new Date(publishedAt).getTime();
  if (Number.isNaN(t)) return "";
  const bucket = Math.floor(t / BURST_WINDOW_MS);
  return `${videoId}:${bucket}`;
}

// ---------------------------------------------------------------------------
// 4. Main scoring function
// ---------------------------------------------------------------------------

/**
 * Score a batch of comments for bot/suspicious behaviour.
 *
 * Call this with ALL comments in the current ingestion batch PLUS any
 * cached history counts (dupCountVideo / dupCountKeyword) if available.
 */
export function scoreBotBatch(comments: CommentInput[]): BotResult[] {
  if (comments.length === 0) return [];

  // Build normalised text maps for duplicate detection
  const normTexts = comments.map((c) => normalizeText(c.text));

  // Per-video duplicate counts
  const videoDups = new Map<string, Map<string, number>>();
  // Per-keyword duplicate counts
  const keywordDups = new Map<string, Map<string, number>>();

  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    const nt = normTexts[i];
    if (!nt) continue;

    // video dups
    if (!videoDups.has(c.videoId)) videoDups.set(c.videoId, new Map());
    const vMap = videoDups.get(c.videoId)!;
    vMap.set(nt, (vMap.get(nt) ?? 0) + 1);

    // keyword dups
    if (!keywordDups.has(c.keyword)) keywordDups.set(c.keyword, new Map());
    const kMap = keywordDups.get(c.keyword)!;
    kMap.set(nt, (kMap.get(nt) ?? 0) + 1);
  }

  // Burst detection
  const commentsByVideo = new Map<string, string[]>();
  for (const c of comments) {
    if (!commentsByVideo.has(c.videoId)) commentsByVideo.set(c.videoId, []);
    commentsByVideo.get(c.videoId)!.push(c.publishedAt);
  }
  const burstWindows = detectBurstWindows(commentsByVideo);

  // Score each comment
  const results: BotResult[] = [];

  for (let i = 0; i < comments.length; i++) {
    const c = comments[i];
    const nt = normTexts[i];
    let score = 0;
    const reasons: string[] = [];

    // --- Repetition signals ---
    const dupVideo = videoDups.get(c.videoId)?.get(nt) ?? 0;
    const dupKeyword = keywordDups.get(c.keyword)?.get(nt) ?? 0;
    const maxDup = Math.max(dupVideo, dupKeyword);

    if (maxDup >= 10) {
      score += 40;
      reasons.push(dupKeyword >= 10 ? "duplicate_text_keyword_high" : "duplicate_text_video_high");
    } else if (maxDup >= 5) {
      score += 25;
      reasons.push(dupKeyword >= 5 ? "duplicate_text_keyword_medium" : "duplicate_text_video_medium");
    } else if (maxDup >= 3) {
      score += 15;
      reasons.push("duplicate_text_low");
    }

    // --- URL signal ---
    if (containsUrl(c.text)) {
      score += 20;
      reasons.push("contains_url");
    }

    // --- Spam keywords ---
    const spamCount = countSpamKeywords(c.text);
    if (spamCount >= 2) {
      score += 25;
      reasons.push("spam_keywords_multiple");
    } else if (spamCount === 1) {
      score += 15;
      reasons.push("spam_keyword");
    }

    // --- Generic short ---
    if (isGenericShort(c.text)) {
      score += 10;
      reasons.push("generic_short_comment");
    }

    // --- Emoji ratio ---
    const eRatio = emojiRatio(c.text);
    if (eRatio > 0.35) {
      score += 15;
      reasons.push("emoji_ratio_high");
    }

    // --- Excessive punctuation ---
    if (hasExcessivePunctuation(c.text)) {
      score += 10;
      reasons.push("excessive_punctuation");
    }

    // --- Burst window ---
    const bk = getBurstKey(c.videoId, c.publishedAt);
    if (bk && burstWindows.has(bk)) {
      score += 25;
      reasons.push("burst_window");
    }

    // Clamp
    const botScore = Math.min(100, Math.max(0, score));
    const botLabel: BotLabel =
      botScore >= 70 ? "bot" : botScore >= 40 ? "suspicious" : "human";

    results.push({ botScore, botLabel, botReasons: reasons });
  }

  return results;
}
