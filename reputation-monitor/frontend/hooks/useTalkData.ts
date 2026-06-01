/**
 * useTalkData — React hook for managing Talk (YouTube comments) data.
 * Handles fetching, pagination, filtering, and search state.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useKeyword } from "@/contexts/KeywordContext";
import {
  fetchTalkItems,
  type TalkDataResponse,
  type TalkItem,
  type SentimentLabel,
} from "@/lib/talkApi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TalkData {
  // Input state
  keyword: string;
  setKeyword: (kw: string) => void;
  search: () => void;

  // Data
  items: TalkItem[];
  total: number;
  totalTalkItems: number;
  sentimentCounts: { positive: number; negative: number; neutral: number };

  // Pagination
  page: number;
  totalPages: number;
  limit: number;
  goToPage: (page: number) => void;

  // Filters
  sentimentFilter: SentimentLabel | null;
  setSentimentFilter: (s: SentimentLabel | null) => void;
  botFilter: "human" | "suspicious" | "bot" | null;
  setBotFilter: (b: "human" | "suspicious" | "bot" | null) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  sortOrder: "newest" | "oldest";
  setSortOrder: (s: "newest" | "oldest") => void;

  // Status
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

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useTalkData(initialKeyword?: string): TalkData {
  const [keyword, setKeyword] = useState(initialKeyword ?? "");
  const [activeKeyword, setActiveKeyword] = useState(initialKeyword ?? "");

  const [items, setItems] = useState<TalkItem[]>([]);
  const [total, setTotal] = useState(0);
  const [totalTalkItems, setTotalTalkItems] = useState(0);
  const [sentimentCounts, setSentimentCounts] = useState<{
    positive: number;
    negative: number;
    neutral: number;
  }>({ positive: 0, negative: 0, neutral: 0 });

  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [limit] = useState(50);

  const [sentimentFilter, setSentimentFilter] = useState<SentimentLabel | null>(null);
  const [botFilter, setBotFilter] = useState<"human" | "suspicious" | "bot" | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasSearched, setHasSearched] = useState(false);

  const [fetchKey, setFetchKey] = useState(0);
  const isFetching = useRef(false);
  const prevInitial = useRef(initialKeyword);

  // Timeline dates from KeywordContext — single source of truth shared with Feed + all features
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
      const result: TalkDataResponse = await fetchTalkItems({
        keyword: activeKeyword,
        page,
        limit,
        sentiment: sentimentFilter ?? undefined,
        bot: botFilter ?? undefined,
        search: searchQuery || undefined,
        sort: sortOrder,
        startDate: startDate || undefined, // only sent in timeline mode
        endDate: endDate || undefined,
      });

      setItems(result.items);
      setTotal(result.total);
      setTotalPages(result.totalPages);
      setSentimentCounts(result.sentimentCounts);
      setTotalTalkItems(result.totalTalkItems);

      if (result.error) {
        setError(result.error);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load talk items");
    } finally {
      setIsLoading(false);
      isFetching.current = false;
      setHasSearched(true);
    }
  }, [activeKeyword, page, limit, sentimentFilter, botFilter, searchQuery, sortOrder, fetchKey, startDate, endDate]);

  // Initial load + auto-poll every 45 seconds so new comments appear without refresh.
  // 45s is safely under the 60s goal and avoids hammering the backend.
  const POLL_INTERVAL_MS = 45_000;

  useEffect(() => {
    if (!activeKeyword.trim()) return;

    loadData();

    // Pause polling in timeline mode — historical data is static, no need to poll
    if (isTimelineMode) return;

    const intervalId = setInterval(() => {
      // Only poll if not already loading and no other fetch is in flight
      if (!isFetching.current) {
        isFetching.current = false; // allow loadData to proceed
        loadData();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(intervalId);
    // Note: loadData is memoised by its own deps; the interval is reset whenever
    // loadData changes (i.e. filters / keyword change), which is correct behaviour.
  }, [loadData, activeKeyword]);

  const search = useCallback(() => {
    if (!keyword.trim()) return;
    isFetching.current = false;
    setActiveKeyword(keyword.trim());
    setPage(1);
    setFetchKey((k) => k + 1);
  }, [keyword]);

  const refresh = useCallback(() => {
    if (!activeKeyword.trim()) return;
    isFetching.current = false;
    setFetchKey((k) => k + 1);
  }, [activeKeyword]);

  const goToPage = useCallback((newPage: number) => {
    isFetching.current = false;
    setPage(newPage);
    setFetchKey((k) => k + 1);
  }, []);

  // Reset page to 1 when filters change
  const handleSetSentimentFilter = useCallback((s: SentimentLabel | null) => {
    setSentimentFilter(s);
    setPage(1);
    isFetching.current = false;
    setFetchKey((k) => k + 1);
  }, []);

  const handleSetBotFilter = useCallback((b: "human" | "suspicious" | "bot" | null) => {
    setBotFilter(b);
    setPage(1);
    isFetching.current = false;
    setFetchKey((k) => k + 1);
  }, []);

  const handleSetSearchQuery = useCallback((q: string) => {
    setSearchQuery(q);
    // Don't auto-fetch on every keystroke — user calls search or we debounce
  }, []);

  const handleSetSortOrder = useCallback((s: "newest" | "oldest") => {
    setSortOrder(s);
    setPage(1);
    isFetching.current = false;
    setFetchKey((k) => k + 1);
  }, []);

  const clearTimeline = useCallback(() => {
    ctxClearTimeline(); // clears dates in KeywordContext (shared with Feed + all features)
    setPage(1);
    isFetching.current = false;
    setFetchKey((k) => k + 1);
  }, [ctxClearTimeline]);

  return {
    keyword,
    setKeyword,
    search,
    items,
    total,
    totalTalkItems,
    sentimentCounts,
    page,
    totalPages,
    limit,
    goToPage,
    sentimentFilter,
    setSentimentFilter: handleSetSentimentFilter,
    botFilter,
    setBotFilter: handleSetBotFilter,
    searchQuery,
    setSearchQuery: handleSetSearchQuery,
    sortOrder,
    setSortOrder: handleSetSortOrder,
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
