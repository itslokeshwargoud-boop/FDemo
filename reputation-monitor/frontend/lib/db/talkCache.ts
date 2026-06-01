/**
 * SQLite-based cache for Talk items (YouTube comments) and sentiment results.
 *
 * Uses better-sqlite3 (already a project dependency) to persist:
 *  - Fetched talk items keyed by commentId
 *  - Sentiment labels keyed by commentId
 *  - Per-video fetch status (tracks pagination tokens)
 *
 * The DB file lives at `<project-root>/data/talk_cache.db`.  The directory is
 * created automatically if it does not exist.
 */

import path from "path";
import fs from "fs";
import Database from "better-sqlite3";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TalkItemRow {
  commentId: string;
  videoId: string;
  text: string;
  author: string;
  authorChannelId: string;   // stable UC... channel ID — unique identity key
  authorChannelUrl: string;
  publishedAt: string;
  videoTitle: string;
  channelTitle: string;
  sentiment: "positive" | "negative" | "neutral";
  proofUrl: string;
  keyword: string;
  fetchedAt: string;
  botScore: number;
  botLabel: "human" | "suspicious" | "bot";
  botReasons: string; // JSON-encoded string[]
}

export interface VideoFetchStatus {
  videoId: string;
  keyword: string;
  nextPageToken: string | null;
  totalFetched: number;
  lastFetchedAt: string;
  fullyFetched: number; // 0 or 1
}

// ---------------------------------------------------------------------------
// Singleton DB connection
// ---------------------------------------------------------------------------

let _db: Database.Database | null = null;

/**
 * Safe migration: add bot columns to talk_items if they are missing.
 * Uses PRAGMA table_info to detect existing columns.
 */
function migrateBotColumns(db: Database.Database): void {
  const columns = db.prepare("PRAGMA table_info(talk_items)").all() as Array<{ name: string }>;
  const colNames = new Set(columns.map((c) => c.name));

  if (!colNames.has("botScore")) {
    db.exec("ALTER TABLE talk_items ADD COLUMN botScore INTEGER NOT NULL DEFAULT 0");
  }
  if (!colNames.has("botLabel")) {
    db.exec("ALTER TABLE talk_items ADD COLUMN botLabel TEXT NOT NULL DEFAULT 'human'");
  }
  if (!colNames.has("botReasons")) {
    db.exec("ALTER TABLE talk_items ADD COLUMN botReasons TEXT NOT NULL DEFAULT '[]'");
  }
  if (!colNames.has("authorChannelUrl")) {
    db.exec("ALTER TABLE talk_items ADD COLUMN authorChannelUrl TEXT NOT NULL DEFAULT ''");
  }
  if (!colNames.has("authorChannelId")) {
    db.exec("ALTER TABLE talk_items ADD COLUMN authorChannelId TEXT NOT NULL DEFAULT ''");
  }

  // Ensure index exists
  db.exec("CREATE INDEX IF NOT EXISTS idx_talk_botLabel ON talk_items(botLabel)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_talk_channelId ON talk_items(authorChannelId)");
}

function getDbPath(): string {
  // On serverless platforms (e.g. Vercel) the project directory is read-only.
  // Fall back to /tmp which is always writable.
  const baseDir = process.env.VERCEL ? "/tmp" : process.cwd();
  const dataDir = path.join(baseDir, "data");
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  return path.join(dataDir, "talk_cache.db");
}

export function getDb(): Database.Database {
  if (_db) return _db;

  _db = new Database(getDbPath());
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Create tables if they don't exist
  _db.exec(`
    CREATE TABLE IF NOT EXISTS talk_items (
      commentId   TEXT PRIMARY KEY,
      videoId     TEXT NOT NULL,
      text        TEXT NOT NULL,
      author      TEXT NOT NULL DEFAULT '',
      authorChannelId  TEXT NOT NULL DEFAULT '',
      authorChannelUrl TEXT NOT NULL DEFAULT '',
      publishedAt TEXT NOT NULL DEFAULT '',
      videoTitle  TEXT NOT NULL DEFAULT '',
      channelTitle TEXT NOT NULL DEFAULT '',
      sentiment   TEXT NOT NULL CHECK(sentiment IN ('positive','negative','neutral')),
      proofUrl    TEXT NOT NULL,
      keyword     TEXT NOT NULL DEFAULT '',
      fetchedAt   TEXT NOT NULL DEFAULT (datetime('now')),
      botScore    INTEGER NOT NULL DEFAULT 0,
      botLabel    TEXT NOT NULL DEFAULT 'human' CHECK(botLabel IN ('human','suspicious','bot')),
      botReasons  TEXT NOT NULL DEFAULT '[]'
    );

    CREATE INDEX IF NOT EXISTS idx_talk_keyword   ON talk_items(keyword);
    CREATE INDEX IF NOT EXISTS idx_talk_sentiment  ON talk_items(sentiment);
    CREATE INDEX IF NOT EXISTS idx_talk_videoId    ON talk_items(videoId);
    CREATE INDEX IF NOT EXISTS idx_talk_publishedAt ON talk_items(publishedAt);
    CREATE INDEX IF NOT EXISTS idx_talk_botLabel   ON talk_items(botLabel);

    CREATE TABLE IF NOT EXISTS video_fetch_status (
      videoId       TEXT NOT NULL,
      keyword       TEXT NOT NULL,
      nextPageToken TEXT,
      totalFetched  INTEGER NOT NULL DEFAULT 0,
      lastFetchedAt TEXT NOT NULL DEFAULT (datetime('now')),
      fullyFetched  INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (videoId, keyword)
    );
  `);

  // Safe migration: add bot columns if the table already existed without them
  migrateBotColumns(_db);

  return _db;
}

// ---------------------------------------------------------------------------
// Talk item CRUD
// ---------------------------------------------------------------------------

export function upsertTalkItem(item: TalkItemRow): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO talk_items (commentId, videoId, text, author, authorChannelId, authorChannelUrl, publishedAt,
                            videoTitle, channelTitle, sentiment, proofUrl, keyword, fetchedAt,
                            botScore, botLabel, botReasons)
    VALUES (@commentId, @videoId, @text, @author, @authorChannelId, @authorChannelUrl, @publishedAt,
            @videoTitle, @channelTitle, @sentiment, @proofUrl, @keyword, @fetchedAt,
            @botScore, @botLabel, @botReasons)
    ON CONFLICT(commentId) DO UPDATE SET
      sentiment = excluded.sentiment,
      authorChannelId  = excluded.authorChannelId,
      authorChannelUrl = excluded.authorChannelUrl,
      fetchedAt = excluded.fetchedAt,
      botScore  = excluded.botScore,
      botLabel  = excluded.botLabel,
      botReasons = excluded.botReasons
  `).run(item);
}

export function upsertTalkItems(items: TalkItemRow[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO talk_items (commentId, videoId, text, author, authorChannelId, authorChannelUrl, publishedAt,
                            videoTitle, channelTitle, sentiment, proofUrl, keyword, fetchedAt,
                            botScore, botLabel, botReasons)
    VALUES (@commentId, @videoId, @text, @author, @authorChannelId, @authorChannelUrl, @publishedAt,
            @videoTitle, @channelTitle, @sentiment, @proofUrl, @keyword, @fetchedAt,
            @botScore, @botLabel, @botReasons)
    ON CONFLICT(commentId) DO UPDATE SET
      sentiment = excluded.sentiment,
      authorChannelId  = excluded.authorChannelId,
      authorChannelUrl = excluded.authorChannelUrl,
      fetchedAt = excluded.fetchedAt,
      botScore  = excluded.botScore,
      botLabel  = excluded.botLabel,
      botReasons = excluded.botReasons
  `);

  const insertMany = db.transaction((rows: TalkItemRow[]) => {
    for (const row of rows) stmt.run(row);
  });

  insertMany(items);
}

export function getCachedSentiment(commentId: string): "positive" | "negative" | "neutral" | null {
  const db = getDb();
  const row = db.prepare("SELECT sentiment FROM talk_items WHERE commentId = ?").get(commentId) as
    | { sentiment: string }
    | undefined;
  if (!row) return null;
  return row.sentiment as "positive" | "negative" | "neutral";
}

export interface TalkQueryParams {
  keyword: string;
  sentiment?: "positive" | "negative" | "neutral";
  bot?: "human" | "suspicious" | "bot";
  search?: string;
  sort?: "newest" | "oldest";
  page?: number;
  limit?: number;
  /** Timeline mode: ISO date string (YYYY-MM-DD). Both must be set to activate. */
  startDate?: string;
  endDate?: string;
}

export interface TalkQueryResult {
  items: TalkItemRow[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  sentimentCounts: { positive: number; negative: number; neutral: number };
}

export function queryTalkItems(params: TalkQueryParams): TalkQueryResult {
  const db = getDb();
  const { keyword, sentiment, bot, search, sort = "newest", page = 1, limit = 50, startDate, endDate } = params;

  const conditions: string[] = ["keyword = @keyword"];
  const bindings: Record<string, string | number> = { keyword };

  if (sentiment) {
    conditions.push("sentiment = @sentiment");
    bindings.sentiment = sentiment;
  }

  if (bot) {
    conditions.push("botLabel = @bot");
    bindings.bot = bot;
  }

  if (search) {
    conditions.push("text LIKE @search");
    bindings.search = `%${search}%`;
  }

  // Timeline mode: filter by the comment's own publishedAt timestamp.
  // startDate: inclusive from start of day UTC
  // endDate:   we use < start of next day so ISO timestamps with milliseconds
  //            (e.g. T23:59:59.999Z) are correctly included — string comparison
  //            puts T23:59:59.001Z AFTER T23:59:59Z so <= would miss them.
  if (startDate && endDate) {
    conditions.push("publishedAt >= @startDate");
    conditions.push("publishedAt < @endDateExclusive");
    bindings.startDate = startDate + "T00:00:00Z";
    // Advance by one calendar day so endDate itself is fully included
    const nextDay = new Date(endDate);
    nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    bindings.endDateExclusive = nextDay.toISOString().slice(0, 10) + "T00:00:00Z";
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const orderBy = sort === "oldest" ? "publishedAt ASC" : "publishedAt DESC";
  const offset = (page - 1) * limit;

  const countRow = db.prepare(`SELECT COUNT(*) AS cnt FROM talk_items ${where}`).get(bindings) as { cnt: number };
  const total = countRow.cnt;

  const items = db.prepare(
    `SELECT * FROM talk_items ${where} ORDER BY ${orderBy} LIMIT @limit OFFSET @offset`
  ).all({ ...bindings, limit, offset }) as TalkItemRow[];

  // Sentiment counts (always for the keyword, ignoring other filters)
  const countsRows = db.prepare(
    `SELECT sentiment, COUNT(*) AS cnt FROM talk_items WHERE keyword = @kw GROUP BY sentiment`
  ).all({ kw: keyword }) as Array<{ sentiment: string; cnt: number }>;

  const sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
  for (const row of countsRows) {
    if (row.sentiment === "positive") sentimentCounts.positive = row.cnt;
    else if (row.sentiment === "negative") sentimentCounts.negative = row.cnt;
    else if (row.sentiment === "neutral") sentimentCounts.neutral = row.cnt;
  }

  return {
    items,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
    sentimentCounts,
  };
}

// ---------------------------------------------------------------------------
// Video fetch status
// ---------------------------------------------------------------------------

export function getVideoFetchStatus(videoId: string, keyword: string): VideoFetchStatus | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT * FROM video_fetch_status WHERE videoId = ? AND keyword = ?"
  ).get(videoId, keyword) as VideoFetchStatus | undefined;
  return row ?? null;
}

export function upsertVideoFetchStatus(status: VideoFetchStatus): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO video_fetch_status (videoId, keyword, nextPageToken, totalFetched, lastFetchedAt, fullyFetched)
    VALUES (@videoId, @keyword, @nextPageToken, @totalFetched, @lastFetchedAt, @fullyFetched)
    ON CONFLICT(videoId, keyword) DO UPDATE SET
      nextPageToken = excluded.nextPageToken,
      totalFetched  = excluded.totalFetched,
      lastFetchedAt = excluded.lastFetchedAt,
      fullyFetched  = excluded.fullyFetched
  `).run(status);
}

export function getTotalCachedItems(keyword: string): number {
  const db = getDb();
  const row = db.prepare("SELECT COUNT(*) AS cnt FROM talk_items WHERE keyword = ?").get(keyword) as { cnt: number };
  return row.cnt;
}

// ---------------------------------------------------------------------------
// Keyword-level fetch timing — used for TTL-based refresh
// ---------------------------------------------------------------------------

/**
 * Returns the ISO timestamp of the most recent fetch for a keyword,
 * or null if the keyword has never been fetched.
 */
export function getLastFetchTime(keyword: string): string | null {
  const db = getDb();
  const row = db.prepare(
    "SELECT MAX(lastFetchedAt) AS lastFetch FROM video_fetch_status WHERE keyword = ?"
  ).get(keyword) as { lastFetch: string | null } | undefined;
  return row?.lastFetch ?? null;
}

/**
 * Records the current time as the most recent fetch time for all videos
 * under a keyword. Called after a successful refresh cycle.
 */
export function setLastFetchTime(keyword: string): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(
    "UPDATE video_fetch_status SET lastFetchedAt = ? WHERE keyword = ?"
  ).run(now, keyword);
}

/**
 * Resets the fullyFetched flag for all videos under a keyword so that
 * aggregateTalkItems will re-fetch them and pick up new comments.
 * Existing rows in talk_items are preserved (upsert handles dedup).
 */
export function resetVideoFetchStatus(keyword: string): void {
  const db = getDb();
  db.prepare(
    "UPDATE video_fetch_status SET fullyFetched = 0, nextPageToken = NULL WHERE keyword = ?"
  ).run(keyword);
}
