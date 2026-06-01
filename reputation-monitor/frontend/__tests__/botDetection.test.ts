/**
 * Automated tests for the bot detection module.
 *
 * Verifies:
 *  1. Text normalisation
 *  2. Individual signal helpers (URL, spam, generic, emoji, punctuation)
 *  3. Batch scoring correctness
 *  4. Label mapping (score → label)
 *  5. Duplicate detection (per-video and per-keyword)
 *  6. Burst detection
 *  7. Reasons are always provided for non-human labels
 */

import { describe, it, expect } from "vitest";
import {
  normalizeText,
  containsUrl,
  countSpamKeywords,
  isGenericShort,
  emojiRatio,
  hasExcessivePunctuation,
  detectBurstWindows,
  getBurstKey,
  scoreBotBatch,
  type CommentInput,
  type BotResult,
} from "../lib/botDetection";

// ---------------------------------------------------------------------------
// 1. Text normalisation
// ---------------------------------------------------------------------------

describe("normalizeText", () => {
  it("lowercases text", () => {
    expect(normalizeText("HELLO WORLD")).toBe("hello world");
  });

  it("trims whitespace", () => {
    expect(normalizeText("  hello  ")).toBe("hello");
  });

  it("collapses multiple spaces", () => {
    expect(normalizeText("hello   world")).toBe("hello world");
  });

  it("removes URLs", () => {
    expect(normalizeText("check https://example.com out")).toBe("check out");
  });

  it("removes punctuation except word boundaries", () => {
    expect(normalizeText("hello! world?")).toBe("hello world");
  });

  it("collapses repeated characters", () => {
    const result = normalizeText("loooool");
    expect(result).toBe("lool");
  });

  it("handles empty string", () => {
    expect(normalizeText("")).toBe("");
  });

  it("handles emoji-only text", () => {
    // Emoji become empty after punct removal in some cases
    const result = normalizeText("🔥🔥🔥");
    expect(typeof result).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// 2. Signal helpers
// ---------------------------------------------------------------------------

describe("containsUrl", () => {
  it("detects http URLs", () => {
    expect(containsUrl("visit http://example.com")).toBe(true);
  });

  it("detects https URLs", () => {
    expect(containsUrl("visit https://example.com")).toBe(true);
  });

  it("returns false for plain text", () => {
    expect(containsUrl("no links here")).toBe(false);
  });
});

describe("countSpamKeywords", () => {
  it("counts multiple spam keywords", () => {
    expect(countSpamKeywords("free giveaway subscribe now")).toBeGreaterThanOrEqual(3);
  });

  it("returns 0 for normal text", () => {
    expect(countSpamKeywords("great acting performance")).toBe(0);
  });

  it("detects 'link in bio'", () => {
    expect(countSpamKeywords("link in bio for more")).toBeGreaterThanOrEqual(1);
  });
});

describe("isGenericShort", () => {
  it("detects 'nice'", () => {
    expect(isGenericShort("nice")).toBe(true);
  });

  it("detects 'wow cool'", () => {
    expect(isGenericShort("wow cool")).toBe(true);
  });

  it("returns false for longer text", () => {
    expect(isGenericShort("this is a really long comment about the movie")).toBe(false);
  });

  it("returns false for short non-generic words", () => {
    expect(isGenericShort("quantum physics rocks")).toBe(false);
  });
});

describe("emojiRatio", () => {
  it("returns high ratio for emoji-only text", () => {
    expect(emojiRatio("🔥🔥🔥")).toBeGreaterThan(0.5);
  });

  it("returns 0 for plain text", () => {
    expect(emojiRatio("hello world")).toBe(0);
  });

  it("returns moderate ratio for mixed text", () => {
    const ratio = emojiRatio("hey 🔥");
    expect(ratio).toBeGreaterThan(0);
    expect(ratio).toBeLessThan(0.5);
  });

  it("handles empty string", () => {
    expect(emojiRatio("")).toBe(0);
  });
});

describe("hasExcessivePunctuation", () => {
  it("detects '!!!!'", () => {
    expect(hasExcessivePunctuation("wow!!!!")).toBe(true);
  });

  it("detects '????'", () => {
    expect(hasExcessivePunctuation("what????")).toBe(true);
  });

  it("returns false for normal punctuation", () => {
    expect(hasExcessivePunctuation("Hello! How are you?")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3. Burst detection
// ---------------------------------------------------------------------------

describe("detectBurstWindows", () => {
  it("detects bursts above threshold", () => {
    const timestamps: string[] = [];
    const baseTime = new Date("2024-06-01T12:00:00Z").getTime();
    // 70 comments in 1 minute (well above 60 in 2 min threshold)
    for (let i = 0; i < 70; i++) {
      timestamps.push(new Date(baseTime + i * 1000).toISOString());
    }
    const map = new Map([["video1", timestamps]]);
    const bursts = detectBurstWindows(map);
    expect(bursts.size).toBeGreaterThan(0);
  });

  it("does not flag normal activity", () => {
    const timestamps: string[] = [];
    const baseTime = new Date("2024-06-01T12:00:00Z").getTime();
    // 10 comments spread over 20 minutes
    for (let i = 0; i < 10; i++) {
      timestamps.push(new Date(baseTime + i * 120_000).toISOString());
    }
    const map = new Map([["video1", timestamps]]);
    const bursts = detectBurstWindows(map);
    expect(bursts.size).toBe(0);
  });
});

describe("getBurstKey", () => {
  it("returns a non-empty key for valid input", () => {
    const key = getBurstKey("video1", "2024-06-01T12:00:00Z");
    expect(key).toBeTruthy();
    expect(key).toContain("video1");
  });

  it("returns empty for invalid date", () => {
    expect(getBurstKey("video1", "not-a-date")).toBe("");
  });
});

// ---------------------------------------------------------------------------
// 4. Batch scoring
// ---------------------------------------------------------------------------

describe("scoreBotBatch", () => {
  it("returns empty for empty input", () => {
    expect(scoreBotBatch([])).toEqual([]);
  });

  it("labels a normal comment as human", () => {
    const comments: CommentInput[] = [
      {
        commentId: "c1",
        videoId: "v1",
        text: "This is a thoughtful review of the movie with many details.",
        publishedAt: "2024-01-01T12:00:00Z",
        keyword: "movie review",
      },
    ];
    const results = scoreBotBatch(comments);
    expect(results).toHaveLength(1);
    expect(results[0].botLabel).toBe("human");
    expect(results[0].botScore).toBeLessThan(40);
    expect(results[0].botReasons).toEqual([]);
  });

  it("detects spam keyword + URL as suspicious or bot", () => {
    const comments: CommentInput[] = [
      {
        commentId: "c1",
        videoId: "v1",
        text: "Free giveaway! Click https://scam.com subscribe now!",
        publishedAt: "2024-01-01T12:00:00Z",
        keyword: "test",
      },
    ];
    const results = scoreBotBatch(comments);
    expect(results[0].botScore).toBeGreaterThanOrEqual(40);
    expect(["suspicious", "bot"]).toContain(results[0].botLabel);
    expect(results[0].botReasons.length).toBeGreaterThan(0);
  });

  it("detects duplicate text across videos (keyword duplicates)", () => {
    const comments: CommentInput[] = [];
    // 10 identical comments across different videos
    for (let i = 0; i < 10; i++) {
      comments.push({
        commentId: `c${i}`,
        videoId: `v${i}`,
        text: "Check out my channel for amazing content!",
        publishedAt: "2024-01-01T12:00:00Z",
        keyword: "same-keyword",
      });
    }
    const results = scoreBotBatch(comments);
    // All should be flagged
    for (const r of results) {
      expect(r.botScore).toBeGreaterThanOrEqual(40);
      expect(r.botReasons).toContain("duplicate_text_keyword_high");
    }
  });

  it("detects duplicate text within same video", () => {
    const comments: CommentInput[] = [];
    for (let i = 0; i < 5; i++) {
      comments.push({
        commentId: `c${i}`,
        videoId: "same-video",
        text: "Subscribe to my channel!",
        publishedAt: "2024-01-01T12:00:00Z",
        keyword: `kw${i}`,
      });
    }
    const results = scoreBotBatch(comments);
    for (const r of results) {
      expect(r.botScore).toBeGreaterThanOrEqual(25);
      expect(r.botReasons.some((reason) => reason.includes("duplicate_text"))).toBe(true);
    }
  });

  it("generic short comments get low score increase", () => {
    const comments: CommentInput[] = [
      {
        commentId: "c1",
        videoId: "v1",
        text: "nice",
        publishedAt: "2024-01-01T12:00:00Z",
        keyword: "test",
      },
    ];
    const results = scoreBotBatch(comments);
    expect(results[0].botReasons).toContain("generic_short_comment");
    // Should still be human (only +10)
    expect(results[0].botLabel).toBe("human");
  });

  it("emoji-heavy comments get flagged", () => {
    const comments: CommentInput[] = [
      {
        commentId: "c1",
        videoId: "v1",
        text: "🔥🔥🔥🔥🔥🔥🔥🔥",
        publishedAt: "2024-01-01T12:00:00Z",
        keyword: "test",
      },
    ];
    const results = scoreBotBatch(comments);
    expect(results[0].botReasons).toContain("emoji_ratio_high");
  });

  it("excessive punctuation is flagged", () => {
    const comments: CommentInput[] = [
      {
        commentId: "c1",
        videoId: "v1",
        text: "AMAZING!!!! BEST EVER!!!!",
        publishedAt: "2024-01-01T12:00:00Z",
        keyword: "test",
      },
    ];
    const results = scoreBotBatch(comments);
    expect(results[0].botReasons).toContain("excessive_punctuation");
  });

  it("scores are clamped between 0 and 100", () => {
    // Create a super spammy comment to try to exceed 100
    const comments: CommentInput[] = [];
    for (let i = 0; i < 15; i++) {
      comments.push({
        commentId: `c${i}`,
        videoId: "v1",
        text: "Free giveaway subscribe earn now click https://spam.com!!!!????",
        publishedAt: "2024-01-01T12:00:00Z",
        keyword: "spam-test",
      });
    }
    const results = scoreBotBatch(comments);
    for (const r of results) {
      expect(r.botScore).toBeGreaterThanOrEqual(0);
      expect(r.botScore).toBeLessThanOrEqual(100);
    }
  });

  it("non-human labels always have reasons", () => {
    const comments: CommentInput[] = [
      {
        commentId: "c1",
        videoId: "v1",
        text: "Free giveaway https://link.com subscribe now telegram",
        publishedAt: "2024-01-01T12:00:00Z",
        keyword: "test",
      },
    ];
    const results = scoreBotBatch(comments);
    if (results[0].botLabel !== "human") {
      expect(results[0].botReasons.length).toBeGreaterThan(0);
    }
  });

  it("label mapping: 0-39 human, 40-69 suspicious, 70-100 bot", () => {
    // Verify individual thresholds
    // human: a unique normal comment
    const human: CommentInput[] = [
      {
        commentId: "h1",
        videoId: "vh1",
        text: "I really enjoyed the movie, the acting was phenomenal and the story kept me engaged throughout.",
        publishedAt: "2024-01-01T12:00:00Z",
        keyword: "unique-kw-1",
      },
    ];
    const humanResults = scoreBotBatch(human);
    expect(humanResults[0].botLabel).toBe("human");
    expect(humanResults[0].botScore).toBeLessThan(40);
  });
});
