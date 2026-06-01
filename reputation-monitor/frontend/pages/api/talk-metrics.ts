/**
 * /api/talk-metrics — Computes reputation health index for a keyword.
 *
 * Orchestrates:
 *  1. Fetch YouTube videos via shared fetchYouTubeVideos()
 *  2. Fetch cached talk items (comments with sentiment) from SQLite
 *  3. Run the metricsAnalyst engine
 *  4. Return strict JSON output
 *
 * Query parameters:
 *   keyword     (required)  — search keyword
 *   time_window (optional)  — "24h" | "7d" | "30d" | "all" (default: "all")
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { fetchYouTubeVideos } from "./youtube";
import {
  getDb,
  queryTalkItems,
  getTotalCachedItems,
} from "@/lib/db/talkCache";
import {
  runMetricsAnalysis,
  type LiveData,
  type TalkComment,
  type MetricsOutput,
  type TimeWindow,
} from "@/lib/metricsAnalyst";

// ---------------------------------------------------------------------------
// Response type
// ---------------------------------------------------------------------------

export type TalkMetricsResponse =
  | MetricsOutput
  | { success: false; error: string };

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<TalkMetricsResponse>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  const keyword =
    typeof req.query.keyword === "string" ? req.query.keyword.trim() : "";
  if (!keyword) {
    return res
      .status(400)
      .json({ success: false, error: "Missing keyword parameter" });
  }

  const validWindows = ["24h", "7d", "30d", "all"];
  const timeWindow: TimeWindow = validWindows.includes(
    String(req.query.time_window)
  )
    ? (String(req.query.time_window) as TimeWindow)
    : "all";

  // Cache headers — 60s browser cache, 120s CDN stale-while-revalidate
  // No CDN caching — comments must be fresh on every request
  res.setHeader("Cache-Control", "no-store, must-revalidate");

  try {
    // Fetch YouTube videos
    const videoResult = await fetchYouTubeVideos(keyword);
    const videos = videoResult.videos;

    // Try to get cached talk items (comments) from SQLite
    let comments: TalkComment[] = [];
    let sentimentCounts = { positive: 0, negative: 0, neutral: 0 };
    let totalComments = 0;

    try {
      getDb(); // ensure DB is initialized
      const cachedCount = getTotalCachedItems(keyword);

      if (cachedCount > 0) {
        // Fetch all cached comments for this keyword (up to 5000)
        const result = queryTalkItems({
          keyword,
          page: 1,
          limit: 5000,
        });

        comments = result.items.map((item) => ({
          commentId: item.commentId,
          text: item.text,
          author: item.author,
          publishedAt: item.publishedAt,
          videoId: item.videoId,
          videoTitle: item.videoTitle,
          channelTitle: item.channelTitle,
          sentiment: item.sentiment,
          proofUrl: item.proofUrl,
        }));

        sentimentCounts = result.sentimentCounts;
        totalComments = cachedCount;
      }
    } catch {
      // DB access failed — proceed with video data only
      console.warn("Talk cache unavailable for metrics — proceeding with video data only");
    }

    const liveData: LiveData = {
      videos,
      comments,
      sentimentCounts,
      totalComments,
    };

    // Run the metrics analyst engine
    const output = runMetricsAnalysis(keyword, liveData, timeWindow);

    return res.status(200).json(output);
  } catch (err) {
    console.error("Talk Metrics API error:", err);
    return res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : "Internal server error",
    });
  }
}
