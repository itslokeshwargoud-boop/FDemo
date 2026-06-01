/**
 * useDashboardData — fetches YouTube-only data via /api/metrics
 * for a user-provided keyword. No preset clients.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useKeyword } from "@/contexts/KeywordContext";
import {
  fetchMetrics,
  type FetchMetricsOptions,
  type DashboardResponse,
  type MetricsKPI,
  type ChannelBreakdown,
  type TrendPoint,
  type YouTubeVideo,
} from "@/lib/realApi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface DashboardData {
  keyword: string;
  setKeyword: (kw: string) => void;
  search: () => void;
  videos: YouTubeVideo[];
  kpis: MetricsKPI;
  channelBreakdown: ChannelBreakdown[];
  trend: TrendPoint[];
  isLoading: boolean;
  error: string | null;
  hasSearched: boolean;
  refresh: () => void;
  // Timeline mode
  startDate: string;
  setStartDate: (d: string) => void;
  endDate: string;
  setEndDate: (d: string) => void;
  isTimelineMode: boolean;
  clearTimeline: () => void;
}

const EMPTY_KPIS: MetricsKPI = {
  totalVideos: 0,
  totalViews: 0,
  totalLikes: 0,
  totalComments: 0,
  avgViewsPerVideo: 0,
  avgLikesPerVideo: 0,
  engagementRate: 0,
};

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useDashboardData(initialKeyword?: string): DashboardData {
  const [keyword, setKeyword] = useState(initialKeyword ?? "");
  const [activeKeyword, setActiveKeyword] = useState(initialKeyword ?? "");
  const [videos, setVideos] = useState<YouTubeVideo[]>([]);
  const [kpis, setKpis] = useState<MetricsKPI>(EMPTY_KPIS);
  const [channelBreakdown, setChannelBreakdown] = useState<ChannelBreakdown[]>([]);
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);
  const [fetchKey, setFetchKey] = useState(0);
  const isFetching = useRef(false);
  const prevInitial = useRef(initialKeyword);

  // Timeline dates come from KeywordContext — single source of truth shared with Talk + all features
  const { startDate, setStartDate, endDate, setEndDate, isTimelineMode, clearTimeline: ctxClearTimeline } = useKeyword();

  // Sync when the shared keyword changes (e.g. hydration from sessionStorage)
  useEffect(() => {
    if (initialKeyword && initialKeyword !== prevInitial.current) {
      prevInitial.current = initialKeyword;
      setKeyword(initialKeyword);
      setActiveKeyword(initialKeyword);
      isFetching.current = false;
      setFetchKey((k) => k + 1);
    }
  }, [initialKeyword]);

  const loadData = useCallback(async () => {
    if (isFetching.current || !activeKeyword.trim()) return;
    isFetching.current = true;
    setIsLoading(true);
    setError(null);

    try {
      const fetchOptions: FetchMetricsOptions =
        startDate && endDate ? { startDate, endDate } : {};
      const result: DashboardResponse = await fetchMetrics(activeKeyword, fetchOptions);

      setVideos(result.videos);
      setKpis(result.kpis);
      setChannelBreakdown(result.channelBreakdown);
      setTrend(result.trend);

      if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setIsLoading(false);
      isFetching.current = false;
      setHasSearched(true);
    }
  }, [activeKeyword, fetchKey, startDate, endDate]);

  useEffect(() => {
    if (activeKeyword.trim()) {
      loadData();
    }
  }, [loadData]);

  const search = useCallback(() => {
    if (!keyword.trim()) return;
    isFetching.current = false;
    setActiveKeyword(keyword.trim());
    setFetchKey((k) => k + 1);
  }, [keyword]);

  const refresh = useCallback(() => {
    if (!activeKeyword.trim()) return;
    isFetching.current = false;
    setFetchKey((k) => k + 1);
  }, [activeKeyword]);

  const clearTimeline = useCallback(() => {
    ctxClearTimeline(); // clears dates in KeywordContext (shared with Talk + all features)
    isFetching.current = false;
    setFetchKey((k) => k + 1);
  }, [ctxClearTimeline]);

  return {
    keyword,
    setKeyword,
    search,
    videos,
    kpis,
    channelBreakdown,
    trend,
    isLoading,
    error,
    hasSearched,
    refresh,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    isTimelineMode,
    clearTimeline,
  };
}
