/**
 * useMbi — React Query hook for the Movie Buzz Indexer.
 *
 * ⚠️  ISOLATED FROM KeywordContext on purpose.
 *
 * MBI is a standalone movie market intelligence engine driven only by a
 * theatrical-release timeline.  It does NOT depend on keyword state shared
 * with Feed, Talk, or any other reputation-analysis feature.
 *
 * Timeline dates are managed entirely inside this hook and passed down to the
 * MBI page via the returned state setters.  No other feature is affected.
 */

import { useState, useCallback, useMemo } from "react";
import { useQuery }                        from "@tanstack/react-query";
import type { MbiApiResponse }             from "@/pages/api/mbi";

// ---------------------------------------------------------------------------
// Default window: last full calendar month
// ---------------------------------------------------------------------------

function defaultWindow(): { startDate: string; endDate: string } {
  const now   = new Date();
  // End = yesterday (avoid partial-day noise on "today")
  const end   = new Date(now);
  end.setDate(end.getDate() - 1);
  // Start = 30 days before end
  const start = new Date(end);
  start.setDate(start.getDate() - 30);
  return {
    startDate: start.toISOString().slice(0, 10),
    endDate:   end.toISOString().slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Fetch function — calls /api/mbi with ONLY date params, no keyword
// ---------------------------------------------------------------------------

async function fetchMbi(
  startDate: string,
  endDate:   string,
  region:    string,
): Promise<MbiApiResponse> {
  const params = new URLSearchParams({ startDate, endDate, region });
  const res    = await fetch(`/api/mbi?${params.toString()}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return res.json() as Promise<MbiApiResponse>;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseMbiReturn {
  // Data
  data:         MbiApiResponse | undefined;
  isLoading:    boolean;
  isFetching:   boolean;   // true during background refetch (data still visible)
  error:        Error | null;

  // Timeline state (MBI-private — does NOT touch KeywordContext)
  startDate:    string;
  endDate:      string;
  region:       string;
  setStartDate: (d: string) => void;
  setEndDate:   (d: string) => void;
  setRegion:    (r: string) => void;

  // Derived
  isTimelineValid: boolean;
  formattedRange:  string;

  // Actions
  refresh: () => void;
}

export function useMbi(): UseMbiReturn {
  const defaults = useMemo(defaultWindow, []);

  const [startDate, setStartDateRaw] = useState(defaults.startDate);
  const [endDate,   setEndDateRaw]   = useState(defaults.endDate);
  const [region,    setRegionRaw]    = useState("IN");

  const DATE_RX         = /^\d{4}-\d{2}-\d{2}$/;
  const isTimelineValid =
    DATE_RX.test(startDate) && DATE_RX.test(endDate) && startDate <= endDate;

  const setStartDate = useCallback((d: string) => setStartDateRaw(d), []);
  const setEndDate   = useCallback((d: string) => setEndDateRaw(d),   []);
  const setRegion    = useCallback((r: string) => setRegionRaw(r),    []);

  const formattedRange = useMemo(() => {
    if (!isTimelineValid) return "Select a valid date range";
    const fmt = (iso: string) =>
      new Date(iso).toLocaleDateString("en-IN", {
        day: "2-digit", month: "short", year: "numeric",
      });
    return `${fmt(startDate)} → ${fmt(endDate)}`;
  }, [startDate, endDate, isTimelineValid]);

  const query = useQuery<MbiApiResponse, Error>({
    queryKey:  ["mbi", startDate, endDate, region],
    queryFn:   () => fetchMbi(startDate, endDate, region),
    enabled:   isTimelineValid,
    staleTime: 5 * 60_000,   // 5 min — theatre data changes slowly
    retry:     1,
    // Keep previous data visible while refetching a new timeline window
    // so the UI doesn't flash a blank skeleton on every date change
    placeholderData: (prev) => prev,
  });

  const refresh = useCallback(() => {
    query.refetch();
  }, [query]);

  return {
    data:       query.data,
    isLoading:  query.isLoading && !query.data,  // true only on first fetch
    isFetching: query.isFetching,                // true also during background refetch
    error:      query.error,

    startDate,
    endDate,
    region,
    setStartDate,
    setEndDate,
    setRegion,

    isTimelineValid,
    formattedRange,

    refresh,
  };
}
