/**
 * DATA INGESTION LAYER
 *
 * Centralizes access to the two real-time data sources (Talk + Feed)
 * and normalizes the data into a common format consumable by the
 * Reputation Engine processing layer.
 *
 * Talk source → YouTube comments (cached in SQLite with sentiment + bot scores)
 * Feed source → YouTube videos with engagement metrics
 */

import {
  getDb,
  getTotalCachedItems,
  type TalkItemRow,
} from "@/lib/db/talkCache";
import { fetchYouTubeVideos, type YouTubeVideo, type YouTubeFetchOptions } from "@/pages/api/youtube";
import { ANIL_DISPLAY_NAME } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Unified data types
// ---------------------------------------------------------------------------

export interface SentimentCounts {
  positive: number;
  negative: number;
  neutral: number;
  total: number;
}

export interface BotCounts {
  human: number;
  suspicious: number;
  bot: number;
  total: number;
}

export interface ChannelStats {
  channelTitle: string;
  videoCount: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  commentSentiment: SentimentCounts;
}

/** Date range filter — both fields must be present to activate filtering. */
export interface DateFilter {
  startDate?: string; // YYYY-MM-DD (inclusive)
  endDate?: string;   // YYYY-MM-DD (inclusive, extended to end-of-day T23:59:59Z)
}

export interface IngestedData {
  keyword: string;
  /** YouTube videos with engagement stats */
  videos: YouTubeVideo[];
  /** All cached talk items for the keyword */
  talkItems: TalkItemRow[];
  /** Aggregated sentiment counts */
  sentimentCounts: SentimentCounts;
  /** Aggregated bot detection counts */
  botCounts: BotCounts;
  /** Per-channel aggregated stats */
  channelStats: ChannelStats[];
  /** Overall engagement metrics */
  engagement: {
    totalVideos: number;
    totalViews: number;
    totalLikes: number;
    totalComments: number;
    avgViewsPerVideo: number;
    engagementRate: number;
  };
  /** Timestamp of data ingestion */
  ingestedAt: string;
}

// ---------------------------------------------------------------------------
// Talk data ingestion (from SQLite cache)
// ---------------------------------------------------------------------------

function ingestTalkData(keyword: string, dateFilter?: DateFilter): {
  items: TalkItemRow[];
  sentimentCounts: SentimentCounts;
  botCounts: BotCounts;
} {
  const db = getDb();

  const total = getTotalCachedItems(keyword);
  if (total === 0) {
    return {
      items: [],
      sentimentCounts: { positive: 0, negative: 0, neutral: 0, total: 0 },
      botCounts: { human: 0, suspicious: 0, bot: 0, total: 0 },
    };
  }

  // Build optional date clause — both dates must be present to filter.
  // endDate is extended to T23:59:59Z so the full end day is inclusive.
  const hasDateFilter = !!(dateFilter?.startDate && dateFilter?.endDate);
  const dateClause = hasDateFilter
    ? " AND publishedAt >= ? AND publishedAt <= ?"
    : "";
  // Bind params: keyword always first; date params appended when filtering
  const dateParams = hasDateFilter
    ? [dateFilter!.startDate!, dateFilter!.endDate! + "T23:59:59Z"]
    : [];

  // Fetch talk items — filtered by date when in timeline mode
  const items = db
    .prepare(
      `SELECT commentId, videoId, text, author, publishedAt, videoTitle, channelTitle,
              sentiment, proofUrl, keyword, fetchedAt, botScore, botLabel, botReasons,
              authorChannelId, authorChannelUrl
       FROM talk_items WHERE keyword = ?${dateClause} ORDER BY publishedAt DESC`
    )
    .all(keyword, ...dateParams) as TalkItemRow[];

  // Aggregate sentiment within the same date window
  const sentimentRows = db
    .prepare(
      `SELECT sentiment, COUNT(*) AS cnt FROM talk_items
       WHERE keyword = ?${dateClause} GROUP BY sentiment`
    )
    .all(keyword, ...dateParams) as Array<{ sentiment: string; cnt: number }>;

  const sentimentCounts: SentimentCounts = { positive: 0, negative: 0, neutral: 0, total: items.length };
  for (const row of sentimentRows) {
    if (row.sentiment === "positive") sentimentCounts.positive = row.cnt;
    else if (row.sentiment === "negative") sentimentCounts.negative = row.cnt;
    else if (row.sentiment === "neutral") sentimentCounts.neutral = row.cnt;
  }

  // Aggregate bot counts within the same date window
  const botRows = db
    .prepare(
      `SELECT botLabel, COUNT(*) AS cnt FROM talk_items
       WHERE keyword = ?${dateClause} GROUP BY botLabel`
    )
    .all(keyword, ...dateParams) as Array<{ botLabel: string; cnt: number }>;

  const botCounts: BotCounts = { human: 0, suspicious: 0, bot: 0, total: items.length };
  for (const row of botRows) {
    if (row.botLabel === "human") botCounts.human = row.cnt;
    else if (row.botLabel === "suspicious") botCounts.suspicious = row.cnt;
    else if (row.botLabel === "bot") botCounts.bot = row.cnt;
  }

  return { items, sentimentCounts, botCounts };
}

// ---------------------------------------------------------------------------
// Feed data ingestion (from YouTube API)
// ---------------------------------------------------------------------------

async function ingestFeedData(
  keyword: string,
  options: YouTubeFetchOptions = {}
): Promise<{ videos: YouTubeVideo[] }> {
  // Pass options through so order=date and publishedAfter (7-day window) apply
  const result = await fetchYouTubeVideos(keyword, options);
  return { videos: result.videos };
}

// ---------------------------------------------------------------------------
// Channel stats aggregation
// ---------------------------------------------------------------------------

function aggregateChannelStats(
  videos: YouTubeVideo[],
  talkItems: TalkItemRow[]
): ChannelStats[] {
  const map = new Map<
    string,
    {
      videoCount: number;
      totalViews: number;
      totalLikes: number;
      totalComments: number;
      positive: number;
      negative: number;
      neutral: number;
    }
  >();

  for (const v of videos) {
    const ch = v.channelTitle || "Unknown";
    const existing = map.get(ch) || {
      videoCount: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      positive: 0,
      negative: 0,
      neutral: 0,
    };
    existing.videoCount += 1;
    existing.totalViews += v.viewCount;
    existing.totalLikes += v.likeCount;
    existing.totalComments += v.commentCount;
    map.set(ch, existing);
  }

  // Overlay comment-level sentiment per channel
  for (const item of talkItems) {
    const ch = item.channelTitle || "Unknown";
    const existing = map.get(ch);
    if (existing) {
      if (item.sentiment === "positive") existing.positive++;
      else if (item.sentiment === "negative") existing.negative++;
      else existing.neutral++;
    }
  }

  return Array.from(map.entries())
    .map(([channelTitle, stats]) => ({
      channelTitle,
      videoCount: stats.videoCount,
      totalViews: stats.totalViews,
      totalLikes: stats.totalLikes,
      totalComments: stats.totalComments,
      commentSentiment: {
        positive: stats.positive,
        negative: stats.negative,
        neutral: stats.neutral,
        total: stats.positive + stats.negative + stats.neutral,
      },
    }))
    .sort((a, b) => b.totalViews - a.totalViews);
}

// ---------------------------------------------------------------------------
// Main ingestion function
// ---------------------------------------------------------------------------

/**
 * Ingest and normalize data from Talk (SQLite cache) and Feed (YouTube API).
 *
 * The keyword defaults to ANIL_DISPLAY_NAME if not provided, matching the
 * single-tenant architecture.
 */
export async function ingestData(keyword?: string, options: YouTubeFetchOptions = {}, dateFilter?: DateFilter): Promise<IngestedData> {
  const kw = keyword || ANIL_DISPLAY_NAME;

  // Ingest from both sources in parallel.
  // dateFilter scopes talk items to the selected date range; feedData uses publishedAfter/Before on YT API.
  const [talkResult, feedResult] = await Promise.all([
    Promise.resolve(ingestTalkData(kw, dateFilter)),
    ingestFeedData(kw, options),
  ]);

  const { items: talkItems, sentimentCounts, botCounts } = talkResult;
  const { videos } = feedResult;

  // Compute engagement metrics from videos
  const totalVideos = videos.length;
  const totalViews = videos.reduce((s, v) => s + v.viewCount, 0);
  const totalLikes = videos.reduce((s, v) => s + v.likeCount, 0);
  const totalComments = videos.reduce((s, v) => s + v.commentCount, 0);
  const avgViewsPerVideo = totalVideos > 0 ? Math.round(totalViews / totalVideos) : 0;
  const engagementRate =
    totalViews > 0
      ? parseFloat(((totalLikes / totalViews) * 100).toFixed(2))
      : 0;

  // Aggregate channel stats
  const channelStats = aggregateChannelStats(videos, talkItems);

  return {
    keyword: kw,
    videos,
    talkItems,
    sentimentCounts,
    botCounts,
    channelStats,
    engagement: {
      totalVideos,
      totalViews,
      totalLikes,
      totalComments,
      avgViewsPerVideo,
      engagementRate,
    },
    ingestedAt: new Date().toISOString(),
  };
}
