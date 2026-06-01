/**
 * useMetricsAnalyst — React hook for managing Metrics Analyst state.
 * Fetches reputation health index data from /api/talk-metrics.
 */

import { useState, useCallback, useRef } from "react";
import {
  fetchMetricsAnalyst,
  type MetricsAnalystResponse,
} from "@/lib/metricsAnalystApi";
import type {
  MetricsOutput,
  TimeWindow,
} from "@/lib/metricsAnalyst";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MetricsAnalystData {
  /** The computed metrics output (null until first fetch) */
  data: MetricsOutput | null;
  /** Whether a fetch is in progress */
  isLoading: boolean;
  /** Last error message, if any */
  error: string | null;
  /** Whether at least one fetch has completed */
  hasLoaded: boolean;
  /** Fetch metrics for a keyword */
  fetchMetrics: (keyword: string, timeWindow?: TimeWindow) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useMetricsAnalyst(): MetricsAnalystData {
  const [data, setData] = useState<MetricsOutput | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const isFetching = useRef(false);

  const fetchMetrics = useCallback(
    async (keyword: string, timeWindow?: TimeWindow) => {
      if (isFetching.current || !keyword.trim()) return;
      isFetching.current = true;
      setIsLoading(true);
      setError(null);

      try {
        const result: MetricsAnalystResponse = await fetchMetricsAnalyst({
          keyword,
          timeWindow,
        });

        if (result.success) {
          setData(result);
          setError(null);
        } else {
          setError(result.error);
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to load metrics"
        );
      } finally {
        setIsLoading(false);
        isFetching.current = false;
        setHasLoaded(true);
      }
    },
    []
  );

  return {
    data,
    isLoading,
    error,
    hasLoaded,
    fetchMetrics,
  };
}
