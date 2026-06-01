/**
 * Talk API client — fetches talk items from /api/talk.
 * Never throws. All errors surface as partial data with status flags.
 */

import type { TalkItem, TalkApiResponse } from "@/pages/api/talk";
import type { SentimentLabel } from "@/lib/sentiment";

// Re-export for convenience
export type { TalkItem, SentimentLabel };

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TalkDataResponse {
  success: boolean;
  items: TalkItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  sentimentCounts: { positive: number; negative: number; neutral: number };
  totalTalkItems: number;
  error?: string;
}

export interface FetchTalkParams {
  keyword: string;
  page?: number;
  limit?: number;
  sentiment?: SentimentLabel;
  bot?: "human" | "suspicious" | "bot";
  search?: string;
  sort?: "newest" | "oldest";
  /** Timeline mode: YYYY-MM-DD. Both must be set to activate. */
  startDate?: string;
  endDate?: string;
}

// ---------------------------------------------------------------------------
// Fetch — never throws
// ---------------------------------------------------------------------------

const EMPTY_RESPONSE: TalkDataResponse = {
  success: false,
  items: [],
  total: 0,
  page: 1,
  limit: 50,
  totalPages: 0,
  sentimentCounts: { positive: 0, negative: 0, neutral: 0 },
  totalTalkItems: 0,
};

export async function fetchTalkItems(params: FetchTalkParams): Promise<TalkDataResponse> {
  if (!params.keyword.trim()) {
    return { ...EMPTY_RESPONSE, error: "No keyword provided" };
  }

  try {
    const url = new URL("/api/talk", window.location.origin);
    url.searchParams.set("keyword", params.keyword);
    if (params.page) url.searchParams.set("page", String(params.page));
    if (params.limit) url.searchParams.set("limit", String(params.limit));
    if (params.sentiment) url.searchParams.set("sentiment", params.sentiment);
    if (params.bot) url.searchParams.set("bot", params.bot);
    if (params.search) url.searchParams.set("search", params.search);
    if (params.sort) url.searchParams.set("sort", params.sort);
    // Timeline mode — only sent when both dates are present
    if (params.startDate && params.endDate) {
      url.searchParams.set("startDate", params.startDate);
      url.searchParams.set("endDate", params.endDate);
    }

    const res = await fetch(url.toString());
    if (!res.ok) {
      return { ...EMPTY_RESPONSE, error: `HTTP ${res.status}` };
    }

    const data = (await res.json()) as TalkApiResponse;
    return {
      success: data.success,
      items: data.data?.items ?? [],
      total: data.data?.total ?? 0,
      page: data.data?.page ?? 1,
      limit: data.data?.limit ?? 50,
      totalPages: data.data?.totalPages ?? 0,
      sentimentCounts: data.data?.sentimentCounts ?? { positive: 0, negative: 0, neutral: 0 },
      totalTalkItems: data.data?.totalTalkItems ?? 0,
      error: data.error,
    };
  } catch (err) {
    return {
      ...EMPTY_RESPONSE,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
