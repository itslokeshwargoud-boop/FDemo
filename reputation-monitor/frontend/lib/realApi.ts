/**
 * Real API layer — fetches live YouTube data via /api/metrics
 * and returns structured data for the dashboard.
 *
 * YouTube-only. NEVER crashes. All errors surface as partial data with status flags.
 */

import type { YouTubeVideo } from "../pages/api/youtube";
import type {
  MetricsPayload,
  MetricsKPI,
  ChannelBreakdown,
  TrendPoint,
} from "../pages/api/metrics";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface DashboardResponse {
  success: boolean;
  keyword: string;
  videos: YouTubeVideo[];
  kpis: MetricsKPI;
  channelBreakdown: ChannelBreakdown[];
  trend: TrendPoint[];
  error?: string;
}

// Re-export for convenience
export type { MetricsKPI, ChannelBreakdown, TrendPoint, YouTubeVideo };

// ---------------------------------------------------------------------------
// Fetch — never throws
// ---------------------------------------------------------------------------

export interface FetchMetricsOptions {
  startDate?: string; // YYYY-MM-DD — activates timeline mode when paired with endDate
  endDate?: string;   // YYYY-MM-DD
}

export async function fetchMetrics(keyword: string, options: FetchMetricsOptions = {}): Promise<DashboardResponse> {
  const empty: DashboardResponse = {
    success: false,
    keyword,
    videos: [],
    kpis: {
      totalVideos: 0,
      totalViews: 0,
      totalLikes: 0,
      totalComments: 0,
      avgViewsPerVideo: 0,
      avgLikesPerVideo: 0,
      engagementRate: 0,
    },
    channelBreakdown: [],
    trend: [],
  };

  if (!keyword.trim()) {
    return { ...empty, error: "No keyword provided" };
  }

  try {
    const url = new URL("/api/metrics", window.location.origin);
    url.searchParams.set("keyword", keyword);
    if (options.startDate && options.endDate) {
      url.searchParams.set("startDate", options.startDate);
      url.searchParams.set("endDate", options.endDate);
    }
    const res = await fetch(url.toString());
    if (!res.ok) {
      return { ...empty, error: `HTTP ${res.status}` };
    }
    const data = (await res.json()) as MetricsPayload;
    return {
      success: data.success ?? false,
      keyword: data.keyword ?? keyword,
      videos: data.videos ?? [],
      kpis: data.kpis ?? empty.kpis,
      channelBreakdown: data.channelBreakdown ?? [],
      trend: data.trend ?? [],
      error: data.error,
    };
  } catch (err) {
    return {
      ...empty,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
