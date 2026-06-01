/**
 * useReputationOs — React hook for all REPUTATION OS modules.
 * Uses @tanstack/react-query for caching, deduplication, and background refresh.
 *
 * Single-tenant: always uses Anil Ravipudi data.
 * Optionally subscribes to a WebSocket live feed for real-time score updates.
 */

import { useEffect, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as api from "@/lib/reputationOs";
import { createLiveFeed, type LiveFeedConnection } from "@/lib/websocket";
import { ANIL_TENANT_ID, ANIL_DISPLAY_NAME } from "@/lib/constants";
import { useKeyword } from "@/contexts/KeywordContext";

// Re-export types for consumer convenience
export type {
  ReputationScore,
  Alert,
  NarrativeCluster,
  Influencer,
  AuthenticityReport,
  ActionRecommendation,
  PredictionsReport,
  CampaignReport,
} from "@/lib/reputationOs";

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

const STALE_TIME = 30_000; // 30 seconds

export function useReputationOs() {
  const queryClient = useQueryClient();
  const feedRef = useRef<LiveFeedConnection | null>(null);

  // Use the shared active keyword so all features query the same data as Talk/Feed.
  // Falls back to ANIL_DISPLAY_NAME so the Overview still loads on first visit.
  const { activeKeyword, startDate, endDate, isTimelineMode } = useKeyword();
  const keyword = activeKeyword.trim() || ANIL_DISPLAY_NAME;

  // ── React Query hooks ───────────────────────────────────────────────────

  const score = useQuery({
    queryKey: ["rep-score", keyword, startDate, endDate],
    queryFn: () => api.fetchReputationScore(keyword, startDate || undefined, endDate || undefined),
    staleTime: STALE_TIME,
  });

  const alerts = useQuery({
    queryKey: ["rep-alerts", keyword, startDate, endDate],
    queryFn: () => api.fetchAlerts(keyword, startDate || undefined, endDate || undefined),
    staleTime: STALE_TIME,
  });

  const narratives = useQuery({
    queryKey: ["rep-narratives", keyword, startDate, endDate],
    queryFn: () => api.fetchNarratives(keyword, startDate || undefined, endDate || undefined),
    staleTime: STALE_TIME,
  });

  const influencers = useQuery({
    queryKey: ["rep-influencers", keyword, startDate, endDate],
    queryFn: () => api.fetchInfluencers(keyword, startDate || undefined, endDate || undefined),
    staleTime: STALE_TIME,
  });

  const authenticity = useQuery({
    queryKey: ["rep-authenticity", keyword, startDate, endDate],
    queryFn: () => api.fetchAuthenticity(keyword, startDate || undefined, endDate || undefined),
    staleTime: STALE_TIME,
  });

  const actions = useQuery({
    queryKey: ["rep-actions", keyword, startDate, endDate],
    queryFn: () => api.fetchActions(keyword, startDate || undefined, endDate || undefined),
    staleTime: STALE_TIME,
  });

  const predictions = useQuery({
    queryKey: ["rep-predictions", keyword, startDate, endDate],
    queryFn: () => api.fetchPredictions(keyword, startDate || undefined, endDate || undefined),
    staleTime: STALE_TIME,
  });

  const campaigns = useQuery({
    queryKey: ["rep-campaigns", keyword, startDate, endDate],
    queryFn: () => api.fetchCampaignImpact(keyword, startDate || undefined, endDate || undefined),
    staleTime: STALE_TIME,
  });

  // ── WebSocket real-time updates ─────────────────────────────────────────

  useEffect(() => {
    // Only connect if we're in the browser and have a WS URL configured
    if (typeof window === "undefined") return;

    const wsUrl = process.env.NEXT_PUBLIC_WS_URL;
    if (!wsUrl) return; // WebSocket not configured — skip

    // TODO: Read JWT token from existing auth storage when auth is implemented.
    const token = "";
    if (!token) return; // No auth token — cannot connect to WS

    const feed = createLiveFeed({
      keyword: ANIL_TENANT_ID,
      token,
      wsBaseUrl: wsUrl,
    });

    feed.on("stats_update", () => {
      // Invalidate score query so it refetches from the backend
      queryClient.invalidateQueries({ queryKey: ["rep-score"] });
    });

    feed.on("new_post", () => {
      // Invalidate alerts and narratives on new content
      queryClient.invalidateQueries({ queryKey: ["rep-alerts"] });
      queryClient.invalidateQueries({ queryKey: ["rep-narratives"] });
    });

    feed.connect();
    feedRef.current = feed;

    return () => {
      feed.disconnect();
      feedRef.current = null;
    };
  }, [queryClient]);

  return {
    score,
    alerts,
    narratives,
    influencers,
    authenticity,
    actions,
    predictions,
    campaigns,
  };
}
