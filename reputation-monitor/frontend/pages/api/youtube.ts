import type { NextApiRequest, NextApiResponse } from "next";
import {
  validateYouTubeProofUrl,
  logProofRejection,
} from "@/lib/proofValidation";

export interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  publishedAt: string;
  thumbnailUrl: string;
  description: string;
  proofUrl: string;
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

export interface YouTubeApiResponse {
  status: "ok" | "error" | "partial_data";
  videos: YouTubeVideo[];
  totalResults: number;
  reason?: string;
  query: string;
  /** Pagination cursor for the next page of results, when available. */
  nextPageToken?: string;
}

/** Structured JSON envelope required by the dashboard contract */
interface StructuredResponse {
  success: boolean;
  data: YouTubeVideo[];
  error?: string;
  totalResults: number;
  query: string;
  /** Pagination cursor for the next page of results, when available. */
  nextPageToken?: string;
}

/** Build both legacy and structured response from shared fields */
function buildResponse(
  res: NextApiResponse,
  statusCode: number,
  fields: { status: YouTubeApiResponse["status"]; videos: YouTubeVideo[]; totalResults: number; reason?: string; query: string; nextPageToken?: string }
) {
  const legacy: YouTubeApiResponse = {
    status: fields.status,
    videos: fields.videos,
    totalResults: fields.totalResults,
    reason: fields.reason,
    query: fields.query,
    nextPageToken: fields.nextPageToken,
  };
  const structured: StructuredResponse = {
    success: fields.status !== "error",
    data: fields.videos,
    error: fields.reason,
    totalResults: fields.totalResults,
    query: fields.query,
    nextPageToken: fields.nextPageToken,
  };
  return res.status(statusCode).json({ ...legacy, ...structured });
}

// ---------------------------------------------------------------------------
// Core YouTube fetch logic — shared between /api/youtube and /api/metrics
// ---------------------------------------------------------------------------

export interface YouTubeSearchResult {
  videos: YouTubeVideo[];
  totalResults: number;
  error?: string;
  /** Cursor returned by the YouTube API for fetching the next page, when present. */
  nextPageToken?: string;
}

/**
 * Fetch YouTube videos for a query string.
 * Reads YOUTUBE_API_KEY from process.env. Never throws.
 */
export interface YouTubeFetchOptions {
  /** Timeline mode: ISO string. When set together, overrides the default 7-day window. */
  startDate?: string; // YYYY-MM-DD
  endDate?: string;   // YYYY-MM-DD
  /** Pagination cursor from a previous response's nextPageToken. */
  pageToken?: string;
  /**
   * Number of results per page. Defaults to YOUTUBE_MAX_RESULTS (50).
   * The YouTube Search API accepts 1–50; values are clamped to that range.
   */
  maxResults?: number;
}

/** YouTube Search API hard ceiling for results per page. */
const YOUTUBE_MAX_RESULTS = 50;

/** Clamp a requested page size into the YouTube-supported 1–50 range. */
function resolveMaxResults(requested?: number): number {
  if (typeof requested !== "number" || !Number.isFinite(requested)) {
    return YOUTUBE_MAX_RESULTS;
  }
  return Math.min(YOUTUBE_MAX_RESULTS, Math.max(1, Math.trunc(requested)));
}

export async function fetchYouTubeVideos(query: string, options: YouTubeFetchOptions = {}): Promise<YouTubeSearchResult> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    return { videos: [], totalResults: 0, error: "YouTube API key not configured" };
  }

  if (!query.trim()) {
    return { videos: [], totalResults: 0, error: "Missing query" };
  }

  try {
    // 15-second timeout for all YouTube API calls
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    // Step 1: Search for videos — ordered by date
    // Timeline mode uses the user-supplied range; real-time mode uses last 7 days.
    const { startDate, endDate } = options;
    const isTimelineMode = !!(startDate && endDate);
    const maxResults = resolveMaxResults(options.maxResults);

    const publishedAfter = isTimelineMode
      ? new Date(startDate).toISOString()
      : (() => { const d = new Date(); d.setDate(d.getDate() - 7); return d.toISOString(); })();

    const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
    searchUrl.searchParams.set("part", "snippet");
    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", "video");
    // YouTube Search API supports up to 50 results per request.
    searchUrl.searchParams.set("maxResults", String(maxResults));
    searchUrl.searchParams.set("order", "date");       // newest uploads first
    searchUrl.searchParams.set("publishedAfter", publishedAfter);
    // Pagination: forward the caller-supplied cursor when present.
    if (options.pageToken) {
      searchUrl.searchParams.set("pageToken", options.pageToken);
    }
    if (isTimelineMode) {
      // publishedBefore is only used in timeline mode; real-time has no upper bound
      const before = new Date(endDate);
      before.setDate(before.getDate() + 1); // make endDate inclusive
      searchUrl.searchParams.set("publishedBefore", before.toISOString());
    }
    searchUrl.searchParams.set("key", apiKey);

    const searchRes = await fetch(searchUrl.toString(), { signal: controller.signal });
    const searchData = (await searchRes.json().catch(() => ({}))) as {
      items?: Array<{
        id: { videoId: string };
        snippet: {
          title: string;
          channelTitle: string;
          publishedAt: string;
          description: string;
          thumbnails?: {
            medium?: { url: string };
            default?: { url: string };
          };
        };
      }>;
      pageInfo?: { totalResults: number };
      nextPageToken?: string;
      error?: { message: string };
    };

    if (!searchRes.ok || !Array.isArray(searchData.items)) {
      clearTimeout(timeout);
      // Surface quota/rate-limit failures gracefully instead of crashing.
      const reason =
        searchData.error?.message ??
        (searchRes.status === 403
          ? "YouTube API quota exceeded or access forbidden"
          : searchRes.status === 429
          ? "YouTube API rate limit reached"
          : `YouTube search failed (HTTP ${searchRes.status})`);
      return {
        videos: [],
        totalResults: 0,
        error: reason,
      };
    }

    const validItems = searchData.items.filter((item) => !!item?.id?.videoId);
    const videoIds = validItems.map((item) => item.id.videoId);
    const totalResults = searchData.pageInfo?.totalResults ?? 0;
    const nextPageToken = searchData.nextPageToken;

    if (videoIds.length === 0) {
      clearTimeout(timeout);
      return { videos: [], totalResults, nextPageToken };
    }

    // Step 2: Fetch statistics for each video
    const statsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
    statsUrl.searchParams.set("part", "statistics");
    statsUrl.searchParams.set("id", videoIds.join(","));
    statsUrl.searchParams.set("key", apiKey);

    const statsRes = await fetch(statsUrl.toString(), { signal: controller.signal });
    clearTimeout(timeout);
    const statsData = (await statsRes.json().catch(() => ({}))) as {
      items?: Array<{
        id: string;
        statistics: {
          viewCount?: string;
          likeCount?: string;
          commentCount?: string;
        };
      }>;
    };

    const statsMap: Record<string, { viewCount?: string; likeCount?: string; commentCount?: string }> = {};
    if (Array.isArray(statsData.items)) {
      for (const item of statsData.items) {
        if (item?.id) {
          statsMap[item.id] = item.statistics ?? {};
        }
      }
    }

    // Build response — only include items with a valid videoId (ensures a proof URL exists)
    const videos: YouTubeVideo[] = validItems
      .map((item) => {
        const videoId = item.id.videoId;
        const stats = statsMap[videoId] ?? {};
        const snippet = item.snippet ?? ({} as typeof item.snippet);
        const proofUrl = `https://www.youtube.com/watch?v=${videoId}`;
        return {
          id: videoId,
          title: snippet?.title ?? "",
          channelTitle: snippet?.channelTitle ?? "",
          publishedAt: snippet?.publishedAt ?? "",
          thumbnailUrl:
            snippet?.thumbnails?.medium?.url ??
            snippet?.thumbnails?.default?.url ??
            "",
          description: snippet?.description ?? "",
          proofUrl,
          viewCount: parseInt(stats.viewCount ?? "0", 10) || 0,
          likeCount: parseInt(stats.likeCount ?? "0", 10) || 0,
          commentCount: parseInt(stats.commentCount ?? "0", 10) || 0,
        };
      })
      .filter((v) => {
        const result = validateYouTubeProofUrl(v.proofUrl);
        if (result.status === "invalid") {
          logProofRejection("youtube-api", v.proofUrl, result);
          return false;
        }
        return true;
      });

    return { videos, totalResults, nextPageToken };
  } catch (err) {
    const message = err instanceof Error
      ? (err.name === "AbortError" ? "Request timed out" : err.message)
      : "Unknown error";
    return { videos: [], totalResults: 0, error: message };
  }
}

// ---------------------------------------------------------------------------
// API Route Handler
// ---------------------------------------------------------------------------

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const query = typeof req.query.q === "string" ? req.query.q : "";

  if (!query) {
    return buildResponse(res, 400, {
      status: "error",
      videos: [],
      totalResults: 0,
      reason: "Missing query parameter",
      query,
    });
  }

  // Pagination: optional cursor from a previous response's nextPageToken.
  const pageToken = typeof req.query.pageToken === "string" ? req.query.pageToken : undefined;
  // Optional per-page size override; resolveMaxResults clamps it to 1–50.
  const rawMax = typeof req.query.maxResults === "string" ? parseInt(req.query.maxResults, 10) : NaN;
  const maxResults = Number.isFinite(rawMax) ? rawMax : undefined;

  const result = await fetchYouTubeVideos(query, { pageToken, maxResults });

  if (result.error) {
    return buildResponse(res, 200, {
      status: "error",
      videos: result.videos,
      totalResults: result.totalResults,
      reason: result.error,
      query,
      nextPageToken: result.nextPageToken,
    });
  }

  return buildResponse(res, 200, {
    status: "ok",
    videos: result.videos,
    totalResults: result.totalResults,
    query,
    nextPageToken: result.nextPageToken,
  });
}
