/**
 * Metrics Analyst API client — fetches reputation metrics from /api/talk-metrics.
 * Never throws. All errors surface as partial data with status flags.
 */

import type {
  MetricsOutput,
  TimeWindow,
} from "@/lib/metricsAnalyst";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MetricsAnalystResponse =
  | (MetricsOutput & { success: true })
  | { success: false; error: string };

export interface FetchMetricsAnalystParams {
  keyword: string;
  timeWindow?: TimeWindow;
}

// ---------------------------------------------------------------------------
// Fetch — never throws
// ---------------------------------------------------------------------------

export async function fetchMetricsAnalyst(
  params: FetchMetricsAnalystParams
): Promise<MetricsAnalystResponse> {
  if (!params.keyword.trim()) {
    return { success: false, error: "No keyword provided" };
  }

  try {
    const url = new URL("/api/talk-metrics", window.location.origin);
    url.searchParams.set("keyword", params.keyword);
    if (params.timeWindow) {
      url.searchParams.set("time_window", params.timeWindow);
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      const errData = (await res.json().catch(() => ({}))) as {
        error?: string;
      };
      return {
        success: false,
        error: errData.error ?? `HTTP ${res.status}`,
      };
    }

    const data = await res.json();

    // Check if error response
    if (data.success === false) {
      return { success: false, error: data.error ?? "Unknown error" };
    }

    // Successful MetricsOutput
    return { ...data, success: true } as MetricsOutput & { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
