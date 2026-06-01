import type { NextApiRequest, NextApiResponse } from "next";
import type { YouTubeVideo } from "./youtube";
import { fetchYouTubeVideos, type YouTubeFetchOptions } from "./youtube";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetricsKPI {
  totalVideos: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  avgViewsPerVideo: number;
  avgLikesPerVideo: number;
  engagementRate: number; // likes / views * 100
}

export interface ChannelBreakdown {
  channel: string;
  videoCount: number;
  totalViews: number;
}

export interface TrendPoint {
  date: string; // e.g. "Jan", "Feb"
  views: number;
  likes: number;
  videos: number;
}

export interface MetricsPayload {
  success: boolean;
  keyword: string;
  videos: YouTubeVideo[];
  kpis: MetricsKPI;
  channelBreakdown: ChannelBreakdown[];
  trend: TrendPoint[];
  error?: string;
  /** Pagination cursor for the next page of feed results, when available. */
  nextPageToken?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function computeKPIs(videos: YouTubeVideo[]): MetricsKPI {
  const totalVideos = videos.length;
  const totalViews = videos.reduce((s, v) => s + v.viewCount, 0);
  const totalLikes = videos.reduce((s, v) => s + v.likeCount, 0);
  const totalComments = videos.reduce((s, v) => s + v.commentCount, 0);
  const avgViewsPerVideo = totalVideos > 0 ? Math.round(totalViews / totalVideos) : 0;
  const avgLikesPerVideo = totalVideos > 0 ? Math.round(totalLikes / totalVideos) : 0;
  const engagementRate = totalViews > 0
    ? parseFloat(((totalLikes / totalViews) * 100).toFixed(2))
    : 0;

  return {
    totalVideos,
    totalViews,
    totalLikes,
    totalComments,
    avgViewsPerVideo,
    avgLikesPerVideo,
    engagementRate,
  };
}

function computeChannelBreakdown(videos: YouTubeVideo[]): ChannelBreakdown[] {
  const map: Record<string, { videoCount: number; totalViews: number }> = {};
  for (const v of videos) {
    const ch = v.channelTitle || "Unknown";
    if (!map[ch]) map[ch] = { videoCount: 0, totalViews: 0 };
    map[ch].videoCount += 1;
    map[ch].totalViews += v.viewCount;
  }
  return Object.entries(map)
    .map(([channel, data]) => ({ channel, ...data }))
    .sort((a, b) => b.totalViews - a.totalViews);
}

function computeTrend(videos: YouTubeVideo[]): TrendPoint[] {
  const monthMap: Record<string, { views: number; likes: number; videos: number }> = {};
  for (const v of videos) {
    const d = new Date(v.publishedAt);
    if (isNaN(d.getTime())) continue;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (!monthMap[key]) monthMap[key] = { views: 0, likes: 0, videos: 0 };
    monthMap[key].views += v.viewCount;
    monthMap[key].likes += v.likeCount;
    monthMap[key].videos += 1;
  }

  const sortedKeys = Object.keys(monthMap).sort().slice(-7);
  if (sortedKeys.length === 0) {
    return [{ date: new Date().toLocaleString("default", { month: "short" }), views: 0, likes: 0, videos: 0 }];
  }

  return sortedKeys.map((key) => {
    const bucket = monthMap[key];
    const d = new Date(`${key}-01`);
    return {
      date: d.toLocaleString("default", { month: "short" }),
      views: bucket.views,
      likes: bucket.likes,
      videos: bucket.videos,
    };
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MetricsPayload>
) {
  const keyword = typeof req.query.keyword === "string" ? req.query.keyword.trim() : "";

  // Timeline mode support — passed through to fetchYouTubeVideos
  const rawStart = typeof req.query.startDate === "string" ? req.query.startDate.trim() : "";
  const rawEnd = typeof req.query.endDate === "string" ? req.query.endDate.trim() : "";
  const dateRx = /^\d{4}-\d{2}-\d{2}$/;
  // Optional pagination cursor — forwarded to the YouTube fetch when present.
  const pageToken = typeof req.query.pageToken === "string" && req.query.pageToken.trim()
    ? req.query.pageToken.trim()
    : undefined;
  const fetchOptions: YouTubeFetchOptions = {
    ...(dateRx.test(rawStart) && dateRx.test(rawEnd) && rawStart <= rawEnd
      ? { startDate: rawStart, endDate: rawEnd }
      : {}),
    ...(pageToken ? { pageToken } : {}),
  };


  if (!keyword) {
    return res.status(400).json({
      success: false,
      keyword: "",
      videos: [],
      kpis: { totalVideos: 0, totalViews: 0, totalLikes: 0, totalComments: 0, avgViewsPerVideo: 0, avgLikesPerVideo: 0, engagementRate: 0 },
      channelBreakdown: [],
      trend: [],
      error: "Missing keyword parameter",
    });
  }

  // No CDN caching — Feed data must be fresh on every request
  res.setHeader("Cache-Control", "no-store, must-revalidate");

  try {
    const result = await fetchYouTubeVideos(keyword, fetchOptions);
    const videos: YouTubeVideo[] = result.videos;

    if (!videos || videos.length === 0) {
      return res.status(200).json({
        success: true,
        keyword,
        videos: [],
        kpis: { totalVideos: 0, totalViews: 0, totalLikes: 0, totalComments: 0, avgViewsPerVideo: 0, avgLikesPerVideo: 0, engagementRate: 0 },
        channelBreakdown: [],
        trend: [],
        error: result.error ?? undefined,
        nextPageToken: result.nextPageToken,
      });
    }

    const kpis = computeKPIs(videos);
    const channelBreakdown = computeChannelBreakdown(videos);
    const trend = computeTrend(videos);

    return res.status(200).json({
      success: true,
      keyword,
      videos,
      kpis,
      channelBreakdown,
      trend,
      nextPageToken: result.nextPageToken,
    });
  } catch (err) {
    const message = err instanceof Error
      ? (err.name === "AbortError" ? "Request timed out" : err.message)
      : "Unknown error";

    return res.status(200).json({
      success: true,
      keyword,
      videos: [],
      kpis: { totalVideos: 0, totalViews: 0, totalLikes: 0, totalComments: 0, avgViewsPerVideo: 0, avgLikesPerVideo: 0, engagementRate: 0 },
      channelBreakdown: [],
      trend: [],
      error: message,
    });
  }
}
