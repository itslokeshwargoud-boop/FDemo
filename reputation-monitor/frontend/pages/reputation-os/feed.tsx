/**
 * Feed — YouTube keyword intelligence merged into Reputation OS.
 *
 * This replaces the standalone /dashboard keyword search experience.
 * Users can search YouTube keywords within the Reputation OS context.
 */

import { useState, useEffect } from "react";
import { TenantProvider, useTenant } from "@/contexts/TenantContext";
import { useKeyword } from "@/contexts/KeywordContext";
import { useDashboardData } from "@/hooks/useDashboardData";
import ROLayout from "@/components/reputation-os/ROLayout";
import KeywordSearchBar from "@/components/reputation-os/KeywordSearchBar";
import KeywordInsightsPanels from "@/components/reputation-os/KeywordInsightsPanels";
import FeedResults from "@/components/reputation-os/FeedResults";

// ---------------------------------------------------------------------------
// Suggestions
// ---------------------------------------------------------------------------

const DEFAULT_SUGGESTIONS = [
  "Anil Ravipudi",
  "Prabhas",
  "Next.js tutorial",
  "machine learning",
  "web development",
];

// ---------------------------------------------------------------------------
// Page content
// ---------------------------------------------------------------------------

function FeedContent() {
  const { tenantName } = useTenant();
  const shared = useKeyword();
  const {
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
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    isTimelineMode,
    clearTimeline,
  } = useDashboardData(shared.activeKeyword);

  const [recentSearches, setRecentSearches] = useState<string[]>([]);

  // Hydrate recent searches from sessionStorage
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("repscan_recent_searches");
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch {
      // ignore
    }
  }, []);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!keyword.trim()) return;
    search();
    shared.commitKeyword(keyword.trim());
    setRecentSearches((prev) => {
      const filtered = prev.filter((s) => s !== keyword.trim());
      const next = [keyword.trim(), ...filtered].slice(0, 5);
      try {
        sessionStorage.setItem("repscan_recent_searches", JSON.stringify(next));
      } catch {
        // ignore
      }
      return next;
    });
  }

  function handleSuggestionClick(suggestion: string) {
    setKeyword(suggestion);
  }

  // Determine which suggestions to show
  const suggestions =
    !hasSearched && recentSearches.length === 0
      ? DEFAULT_SUGGESTIONS
      : recentSearches;

  return (
    <div className="space-y-6">
      {/* Context indicator */}
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-white">YouTube Feed</h1>
        <span className="rounded-full bg-slate-800/60 px-2.5 py-0.5 text-xs text-slate-400">
          {tenantName}
        </span>
        {hasSearched && keyword.trim() && (
          <span className="rounded-full bg-rose-500/15 px-2.5 py-0.5 text-xs text-rose-400">
            Keyword: {keyword.trim()}
          </span>
        )}
      </div>

      {/* Search bar */}
      <KeywordSearchBar
        keyword={keyword}
        onKeywordChange={setKeyword}
        onSearch={handleSearch}
        isLoading={isLoading}
        suggestions={!hasSearched ? suggestions : []}
        onSuggestionClick={handleSuggestionClick}
      />

      {/* ── Timeline date range picker ── */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] text-slate-500">From</span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-2 py-1.5 text-xs text-slate-300 focus:border-rose-500/50 focus:outline-none cursor-pointer transition-colors"
        />
        <span className="text-[11px] text-slate-500">To</span>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-2 py-1.5 text-xs text-slate-300 focus:border-rose-500/50 focus:outline-none cursor-pointer transition-colors"
        />
        {isTimelineMode && (
          <button
            onClick={clearTimeline}
            className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400 hover:bg-amber-500/20 transition-colors"
            title="Clear date filter and return to real-time mode"
          >
            🗓 {startDate} → {endDate} ×
          </button>
        )}
        {!isTimelineMode && (
          <span className="text-[11px] text-slate-600">Leave blank for latest 7 days</span>
        )}
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-20">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-rose-500 border-t-transparent" />
            <p className="text-sm text-slate-400">
              Fetching YouTube data…
            </p>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && hasSearched && !isLoading && (
        <div className="rounded-xl border border-orange-800/40 bg-orange-950/20 px-4 py-3 text-sm text-orange-400">
          ⚠️ {error}
        </div>
      )}

      {/* Empty state */}
      {!hasSearched && !isLoading && (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="text-6xl mb-6">🔍</div>
          <h2 className="text-xl font-bold text-slate-200 mb-2">
            Search YouTube
          </h2>
          <p className="text-sm text-slate-500 max-w-md">
            Enter a keyword above to fetch real-time YouTube data. You&apos;ll see
            video results, KPIs, trend charts, and channel breakdowns — all
            inside Reputation OS.
          </p>
        </div>
      )}

      {/* Results */}
      {hasSearched && !isLoading && (
        <>
          <KeywordInsightsPanels
            kpis={kpis}
            trend={trend}
            channelBreakdown={channelBreakdown}
          />
          <FeedResults videos={videos} />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported page
// ---------------------------------------------------------------------------

export default function FeedPage() {
  return (
    <TenantProvider>
      <ROLayout activeModule="feed">
        <FeedContent />
      </ROLayout>
    </TenantProvider>
  );
}
