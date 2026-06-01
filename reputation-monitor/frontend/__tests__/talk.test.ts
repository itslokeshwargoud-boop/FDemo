/**
 * Automated tests for the Talk feature.
 *
 * Verifies:
 *  1. Sentiment classification always maps to one of the three required labels
 *  2. Every returned talk item includes a non-empty proof URL
 *  3. Aggregation works across multiple videos (not just one)
 *  4. Pagination returns stable, non-duplicating results
 *  5. Label normalization from the HuggingFace model output
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { normalizeLabel, fallbackSentiment, analyzeSentimentBatch } from "../lib/sentiment";
import type { SentimentLabel } from "../lib/sentiment";
import {
  getDb,
  upsertTalkItems,
  queryTalkItems,
  getTotalCachedItems,
  upsertVideoFetchStatus,
  getVideoFetchStatus,
  type TalkItemRow,
} from "../lib/db/talkCache";
import path from "path";
import fs from "fs";
import Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// 1. Sentiment classification tests
// ---------------------------------------------------------------------------

describe("Sentiment Analysis", () => {
  describe("normalizeLabel", () => {
    const VALID_LABELS: SentimentLabel[] = ["positive", "negative", "neutral"];

    it("maps 'Very Positive' to 'positive'", () => {
      expect(normalizeLabel("Very Positive")).toBe("positive");
    });

    it("maps 'Positive' to 'positive'", () => {
      expect(normalizeLabel("Positive")).toBe("positive");
    });

    it("maps 'Neutral' to 'neutral'", () => {
      expect(normalizeLabel("Neutral")).toBe("neutral");
    });

    it("maps 'Negative' to 'negative'", () => {
      expect(normalizeLabel("Negative")).toBe("negative");
    });

    it("maps 'Very Negative' to 'negative'", () => {
      expect(normalizeLabel("Very Negative")).toBe("negative");
    });

    it("maps '5 stars' to 'positive'", () => {
      expect(normalizeLabel("5 stars")).toBe("positive");
    });

    it("maps '4 stars' to 'positive'", () => {
      expect(normalizeLabel("4 stars")).toBe("positive");
    });

    it("maps '3 stars' to 'neutral'", () => {
      expect(normalizeLabel("3 stars")).toBe("neutral");
    });

    it("maps '2 stars' to 'negative'", () => {
      expect(normalizeLabel("2 stars")).toBe("negative");
    });

    it("maps '1 star' to 'negative'", () => {
      expect(normalizeLabel("1 star")).toBe("negative");
    });

    it("always returns one of the three valid labels", () => {
      const testCases = [
        "Very Positive",
        "Positive",
        "Neutral",
        "Negative",
        "Very Negative",
        "5 stars",
        "4 stars",
        "3 stars",
        "2 stars",
        "1 star",
        "unknown label",
        "",
        "something else entirely",
        "POSITIVE",
        "NEGATIVE",
        "NEUTRAL",
      ];

      for (const label of testCases) {
        const result = normalizeLabel(label);
        expect(VALID_LABELS).toContain(result);
      }
    });

    it("handles case insensitivity", () => {
      expect(normalizeLabel("POSITIVE")).toBe("positive");
      expect(normalizeLabel("NEGATIVE")).toBe("negative");
      expect(normalizeLabel("NEUTRAL")).toBe("neutral");
    });
  });

  describe("fallbackSentiment", () => {
    it("returns 'positive' for positive text", () => {
      expect(fallbackSentiment("I love this amazing video!")).toBe("positive");
    });

    it("returns 'negative' for negative text", () => {
      expect(fallbackSentiment("This is terrible and awful")).toBe("negative");
    });

    it("returns 'neutral' for neutral text", () => {
      expect(fallbackSentiment("The video is about cooking")).toBe("neutral");
    });

    it("always returns one of the three valid labels", () => {
      const texts = [
        "Amazing!",
        "Terrible!",
        "Just a normal sentence",
        "",
        "🎉🎊",
        "Mixed good and bad feelings, love and hate",
      ];

      for (const text of texts) {
        const result = fallbackSentiment(text);
        expect(["positive", "negative", "neutral"]).toContain(result);
      }
    });
  });

  describe("analyzeSentimentBatch", () => {
    it("returns empty array for empty input", async () => {
      const result = await analyzeSentimentBatch([]);
      expect(result).toEqual([]);
    });

    it("returns valid labels for a batch of texts", async () => {
      const texts = ["I love this!", "This is bad", "Just a regular comment"];
      const results = await analyzeSentimentBatch(texts);

      expect(results).toHaveLength(3);
      for (const r of results) {
        expect(["positive", "negative", "neutral"]).toContain(r);
      }
    });

    it("handles a single text input", async () => {
      const results = await analyzeSentimentBatch(["Hello world"]);
      expect(results).toHaveLength(1);
      expect(["positive", "negative", "neutral"]).toContain(results[0]);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Proof URL tests
// ---------------------------------------------------------------------------

describe("Proof URL Validation", () => {
  it("generates valid proof URL format", () => {
    const videoId = "dQw4w9WgXcQ";
    const commentId = "UgzJ1L2X3Y4Z5A6B7C8";
    const proofUrl = `https://www.youtube.com/watch?v=${videoId}&lc=${commentId}`;

    expect(proofUrl).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=.+&lc=.+$/);
    expect(proofUrl).toContain(videoId);
    expect(proofUrl).toContain(commentId);
  });

  it("proof URL is never empty for valid inputs", () => {
    const testCases = [
      { videoId: "abc123", commentId: "comment1" },
      { videoId: "xyz789", commentId: "comment2" },
      { videoId: "test-video", commentId: "test-comment-id" },
    ];

    for (const tc of testCases) {
      const proofUrl = `https://www.youtube.com/watch?v=${tc.videoId}&lc=${tc.commentId}`;
      expect(proofUrl).toBeTruthy();
      expect(proofUrl.length).toBeGreaterThan(0);
      expect(proofUrl).toContain("youtube.com");
    }
  });
});

// ---------------------------------------------------------------------------
// 3 & 4. Aggregation and pagination tests (using SQLite)
// ---------------------------------------------------------------------------

describe("Talk Cache Database", () => {
  let testDbPath: string;

  beforeAll(() => {
    // Use a temporary test database
    testDbPath = path.join("/tmp", `talk_test_${Date.now()}.db`);
    process.env.TALK_TEST_DB = testDbPath;
  });

  afterAll(() => {
    // Clean up test database
    try {
      if (fs.existsSync(testDbPath)) {
        fs.unlinkSync(testDbPath);
      }
    } catch {
      // ignore
    }
  });

  it("creates database and tables without errors", () => {
    const db = getDb();
    expect(db).toBeTruthy();
  });

  it("aggregates talk items across multiple videos", () => {
    const items: TalkItemRow[] = [
      {
        commentId: "c1",
        videoId: "video1",
        text: "Great video!",
        author: "User A",
        authorChannelUrl: "",
        authorChannelId: "",
        publishedAt: "2024-01-01T00:00:00Z",
        videoTitle: "Video One",
        channelTitle: "Channel A",
        sentiment: "positive",
        proofUrl: "https://www.youtube.com/watch?v=video1&lc=c1",
        keyword: "test-keyword",
        fetchedAt: new Date().toISOString(),
        botScore: 0,
        botLabel: "human",
        botReasons: "[]",
      },
      {
        commentId: "c2",
        videoId: "video2",
        text: "Terrible content",
        author: "User B",
        authorChannelUrl: "",
        authorChannelId: "",
        publishedAt: "2024-01-02T00:00:00Z",
        videoTitle: "Video Two",
        channelTitle: "Channel B",
        sentiment: "negative",
        proofUrl: "https://www.youtube.com/watch?v=video2&lc=c2",
        keyword: "test-keyword",
        fetchedAt: new Date().toISOString(),
        botScore: 0,
        botLabel: "human",
        botReasons: "[]",
      },
      {
        commentId: "c3",
        videoId: "video3",
        text: "Just a comment",
        author: "User C",
        authorChannelUrl: "",
        authorChannelId: "",
        publishedAt: "2024-01-03T00:00:00Z",
        videoTitle: "Video Three",
        channelTitle: "Channel C",
        sentiment: "neutral",
        proofUrl: "https://www.youtube.com/watch?v=video3&lc=c3",
        keyword: "test-keyword",
        fetchedAt: new Date().toISOString(),
        botScore: 0,
        botLabel: "human",
        botReasons: "[]",
      },
    ];

    upsertTalkItems(items);

    const result = queryTalkItems({ keyword: "test-keyword" });

    // Verify items from multiple videos are aggregated
    expect(result.items.length).toBe(3);

    const videoIds = new Set(result.items.map((i) => i.videoId));
    expect(videoIds.size).toBe(3);
    expect(videoIds.has("video1")).toBe(true);
    expect(videoIds.has("video2")).toBe(true);
    expect(videoIds.has("video3")).toBe(true);
  });

  it("every returned talk item includes a non-empty proof URL", () => {
    const result = queryTalkItems({ keyword: "test-keyword" });

    for (const item of result.items) {
      expect(item.proofUrl).toBeTruthy();
      expect(item.proofUrl.length).toBeGreaterThan(0);
      expect(item.proofUrl).toContain("youtube.com");
    }
  });

  it("sentiment counts are correct across videos", () => {
    const result = queryTalkItems({ keyword: "test-keyword" });

    expect(result.sentimentCounts.positive).toBe(1);
    expect(result.sentimentCounts.negative).toBe(1);
    expect(result.sentimentCounts.neutral).toBe(1);
  });

  it("filters by sentiment correctly", () => {
    const positiveResult = queryTalkItems({ keyword: "test-keyword", sentiment: "positive" });
    expect(positiveResult.items.length).toBe(1);
    expect(positiveResult.items[0].sentiment).toBe("positive");

    const negativeResult = queryTalkItems({ keyword: "test-keyword", sentiment: "negative" });
    expect(negativeResult.items.length).toBe(1);
    expect(negativeResult.items[0].sentiment).toBe("negative");
  });

  it("pagination returns stable, non-duplicating results", () => {
    // Insert enough items for multiple pages
    const manyItems: TalkItemRow[] = [];
    for (let i = 0; i < 20; i++) {
      manyItems.push({
        commentId: `page-test-${i}`,
        videoId: `vid-${i % 3}`,
        text: `Comment number ${i}`,
        author: `Author ${i}`,
        authorChannelUrl: "",
        authorChannelId: "",
        publishedAt: new Date(2024, 0, i + 1).toISOString(),
        videoTitle: `Video ${i % 3}`,
        channelTitle: `Channel ${i % 3}`,
        sentiment: (["positive", "negative", "neutral"] as const)[i % 3],
        proofUrl: `https://www.youtube.com/watch?v=vid-${i % 3}&lc=page-test-${i}`,
        keyword: "pagination-test",
        fetchedAt: new Date().toISOString(),
        botScore: 0,
        botLabel: "human",
        botReasons: "[]",
      });
    }

    upsertTalkItems(manyItems);

    // Fetch two pages
    const page1 = queryTalkItems({ keyword: "pagination-test", page: 1, limit: 10 });
    const page2 = queryTalkItems({ keyword: "pagination-test", page: 2, limit: 10 });

    expect(page1.items.length).toBe(10);
    expect(page2.items.length).toBe(10);

    // No duplicates between pages
    const page1Ids = new Set(page1.items.map((i) => i.commentId));
    const page2Ids = new Set(page2.items.map((i) => i.commentId));

    for (const id of page2Ids) {
      expect(page1Ids.has(id)).toBe(false);
    }

    // Total is consistent
    expect(page1.total).toBe(20);
    expect(page2.total).toBe(20);
    expect(page1.totalPages).toBe(2);
  });

  it("text search works correctly", () => {
    const result = queryTalkItems({ keyword: "test-keyword", search: "Great" });
    expect(result.items.length).toBeGreaterThanOrEqual(1);
    expect(result.items[0].text).toContain("Great");
  });

  it("sorting by newest and oldest works correctly", () => {
    const newest = queryTalkItems({ keyword: "test-keyword", sort: "newest" });
    const oldest = queryTalkItems({ keyword: "test-keyword", sort: "oldest" });

    if (newest.items.length >= 2) {
      const newestFirst = new Date(newest.items[0].publishedAt).getTime();
      const newestSecond = new Date(newest.items[1].publishedAt).getTime();
      expect(newestFirst).toBeGreaterThanOrEqual(newestSecond);
    }

    if (oldest.items.length >= 2) {
      const oldestFirst = new Date(oldest.items[0].publishedAt).getTime();
      const oldestSecond = new Date(oldest.items[1].publishedAt).getTime();
      expect(oldestFirst).toBeLessThanOrEqual(oldestSecond);
    }
  });

  it("video fetch status tracking works", () => {
    upsertVideoFetchStatus({
      videoId: "fetch-test-video",
      keyword: "test",
      nextPageToken: "token123",
      totalFetched: 100,
      lastFetchedAt: new Date().toISOString(),
      fullyFetched: 0,
    });

    const status = getVideoFetchStatus("fetch-test-video", "test");
    expect(status).toBeTruthy();
    expect(status!.nextPageToken).toBe("token123");
    expect(status!.totalFetched).toBe(100);
    expect(status!.fullyFetched).toBe(0);

    // Update to fully fetched
    upsertVideoFetchStatus({
      videoId: "fetch-test-video",
      keyword: "test",
      nextPageToken: null,
      totalFetched: 500,
      lastFetchedAt: new Date().toISOString(),
      fullyFetched: 1,
    });

    const updatedStatus = getVideoFetchStatus("fetch-test-video", "test");
    expect(updatedStatus!.fullyFetched).toBe(1);
    expect(updatedStatus!.totalFetched).toBe(500);
  });

  it("getTotalCachedItems returns correct count", () => {
    const count = getTotalCachedItems("test-keyword");
    expect(count).toBe(3); // We inserted 3 items with this keyword
  });
});
