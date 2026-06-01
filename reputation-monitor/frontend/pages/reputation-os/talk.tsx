/**
 * Talk — Comment sentiment analysis integrated into Reputation OS.
 *
 * This is the Talk feature within the unified Reputation OS layout.
 * Proof links are allowed here (context: "talk_comment").
 */

import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/router";
import { TenantProvider, useTenant } from "@/contexts/TenantContext";
import { useKeyword } from "@/contexts/KeywordContext";
import { useTalkData } from "@/hooks/useTalkData";
import ROLayout from "@/components/reputation-os/ROLayout";
import KeywordSearchBar from "@/components/reputation-os/KeywordSearchBar";
import type { TalkItem } from "@/lib/talkApi";
import type { SentimentLabel } from "@/lib/sentiment";
import ROProofLink from "@/components/reputation-os/ROProofLink";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Exact timestamp formatted for India locale, e.g. "28 Apr 2026, 3:45 PM" */
function formatExactTime(iso: string): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } catch {
    return iso;
  }
}

/** Compact relative time for quick scanning */
function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 0) return "just now";
  if (diff < 60) return "just now";
  if (diff < 3_600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86_400) return `${Math.floor(diff / 3_600)}h ago`;
  if (diff < 2_592_000) return `${Math.floor(diff / 86_400)}d ago`;
  return `${Math.floor(diff / 2_592_000)}mo ago`;
}

function sentimentColor(s: SentimentLabel): string {
  switch (s) {
    case "positive":
      return "text-emerald-400";
    case "negative":
      return "text-red-400";
    case "neutral":
      return "text-slate-400";
  }
}

function sentimentBg(s: SentimentLabel): string {
  switch (s) {
    case "positive":
      return "bg-emerald-500/15 border-emerald-500/30";
    case "negative":
      return "bg-red-500/15 border-red-500/30";
    case "neutral":
      return "bg-slate-500/15 border-slate-500/30";
  }
}

function sentimentIcon(s: SentimentLabel): string {
  switch (s) {
    case "positive":
      return "👍";
    case "negative":
      return "👎";
    case "neutral":
      return "😐";
  }
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// ---------------------------------------------------------------------------
// Bot badge helpers
// ---------------------------------------------------------------------------

type BotLabel = "human" | "suspicious" | "bot";

function botBadgeColor(label: BotLabel): string {
  switch (label) {
    case "human":
      return "bg-emerald-500/15 border-emerald-500/30 text-emerald-400";
    case "suspicious":
      return "bg-amber-500/15 border-amber-500/30 text-amber-400";
    case "bot":
      return "bg-red-500/15 border-red-500/30 text-red-400";
  }
}

function botIcon(label: BotLabel): string {
  switch (label) {
    case "human":
      return "👤";
    case "suspicious":
      return "⚠️";
    case "bot":
      return "🤖";
  }
}

function formatBotReason(reason: string): string {
  return reason
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ---------------------------------------------------------------------------
// Sentiment Summary
// ---------------------------------------------------------------------------

function SentimentSummary({
  counts,
  total,
  activeFilter,
  onFilter,
}: {
  counts: { positive: number; negative: number; neutral: number };
  total: number;
  activeFilter: SentimentLabel | null;
  onFilter: (s: SentimentLabel | null) => void;
}) {
  const cards: Array<{
    label: SentimentLabel;
    count: number;
    emoji: string;
    color: string;
    bgHover: string;
  }> = [
    { label: "positive", count: counts.positive, emoji: "👍", color: "text-emerald-400", bgHover: "hover:bg-emerald-500/10" },
    { label: "neutral", count: counts.neutral, emoji: "😐", color: "text-slate-400", bgHover: "hover:bg-slate-500/10" },
    { label: "negative", count: counts.negative, emoji: "👎", color: "text-red-400", bgHover: "hover:bg-red-500/10" },
  ];

  return (
    <div className="grid grid-cols-3 gap-3">
      {cards.map((card) => {
        const isActive = activeFilter === card.label;
        return (
          <button
            key={card.label}
            onClick={() => onFilter(isActive ? null : card.label)}
            className={`rounded-xl border border-slate-800/60 bg-slate-900/50 p-4 text-left transition-all duration-200 backdrop-blur ${card.bgHover} ${
              isActive ? "ring-1 ring-rose-500/50 bg-rose-500/5" : ""
            }`}
          >
            <div className="flex items-center gap-2 mb-1">
              <span className="text-lg">{card.emoji}</span>
              <span
                className={`text-xs font-medium uppercase tracking-wider ${card.color}`}
              >
                {capitalize(card.label)}
              </span>
            </div>
            <div className="text-2xl font-bold text-white">
              {card.count.toLocaleString()}
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {total > 0 ? `${((card.count / total) * 100).toFixed(1)}%` : "0%"}{" "}
              of total
            </div>
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Talk Item Card — proof links allowed (context: talk_comment)
// ---------------------------------------------------------------------------

function TalkCard({ item }: { item: TalkItem }) {
  const [showReasons, setShowReasons] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const botLabel = (item.botLabel ?? "human") as BotLabel;
  const botReasons: string[] = Array.isArray(item.botReasons) ? item.botReasons : [];
  const botScore = item.botScore ?? 0;

  // Close popover on click outside or Escape key
  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
      setShowReasons(false);
    }
  }, []);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") setShowReasons(false);
  }, []);

  useEffect(() => {
    if (showReasons) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [showReasons, handleClickOutside, handleKeyDown]);

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/50 p-3 hover:border-slate-600/60 transition-all duration-200 backdrop-blur">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3 mb-1.5">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div className="h-7 w-7 rounded-full bg-slate-700 flex items-center justify-center text-xs text-slate-300 font-semibold flex-shrink-0">
            {item.author ? item.author.charAt(0).toUpperCase() : "?"}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium text-slate-200 truncate">
              {item.author || "Anonymous"}
            </div>
            <div className="text-xs text-slate-500" title={formatExactTime(item.publishedAt)}>
              <span className="text-slate-300">{formatExactTime(item.publishedAt)}</span>
              <span className="ml-1 text-slate-600">({timeAgo(item.publishedAt)})</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Bot badge */}
          <div className="relative" ref={popoverRef}>
            <button
              onClick={() => setShowReasons(!showReasons)}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium cursor-pointer transition-colors ${botBadgeColor(botLabel)}`}
              title={`Bot score: ${botScore}/100. Click for details.`}
            >
              {botIcon(botLabel)} {capitalize(botLabel)}
              {botScore > 0 && (
                <span className="opacity-70 ml-0.5">{botScore}</span>
              )}
            </button>
            {/* Reasons popover */}
            {showReasons && botReasons.length > 0 && (
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-slate-700 bg-slate-800 p-3 shadow-xl">
                <div className="text-xs font-semibold text-slate-300 mb-2">
                  Bot Detection Reasons
                </div>
                <ul className="space-y-1">
                  {botReasons.map((r, idx) => (
                    <li
                      key={idx}
                      className="text-xs text-slate-400 flex items-center gap-1.5"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-amber-400 flex-shrink-0" />
                      {formatBotReason(r)}
                    </li>
                  ))}
                </ul>
                <div className="text-xs text-slate-500 mt-2 pt-2 border-t border-slate-700">
                  Score: {botScore}/100
                </div>
              </div>
            )}
          </div>
          {/* Sentiment badge */}
          <span
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${sentimentBg(
              item.sentiment
            )} ${sentimentColor(item.sentiment)}`}
          >
            {sentimentIcon(item.sentiment)} {capitalize(item.sentiment)}
          </span>
        </div>
      </div>

      {/* Text */}
      <p className="text-sm text-slate-300 leading-snug mb-2 line-clamp-3 break-words">
        {item.text}
      </p>

      {/* Footer: video info + proof link (allowed in talk_comment context) */}
      <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-slate-800/60">
        <div
          className="text-xs text-slate-500 truncate flex-1"
          title={item.videoTitle}
        >
          <span className="text-slate-600">on</span>{" "}
          <span className="text-slate-400">
            {item.videoTitle || "Unknown video"}
          </span>
          {item.channelTitle && (
            <>
              {" "}
              <span className="text-slate-600">by</span>{" "}
              <span className="text-slate-400">{item.channelTitle}</span>
            </>
          )}
        </div>
        <div className="flex-shrink-0">
          <ROProofLink
            href={item.proofUrl}
            label="Proof"
            context="talk_comment"
          />
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  onPageChange: (p: number) => void;
}) {
  if (totalPages <= 1) return null;

  const pages: (number | "...")[] = [];
  if (totalPages <= 7) {
    for (let i = 1; i <= totalPages; i++) pages.push(i);
  } else {
    pages.push(1);
    if (page > 3) pages.push("...");
    for (
      let i = Math.max(2, page - 1);
      i <= Math.min(totalPages - 1, page + 1);
      i++
    ) {
      pages.push(i);
    }
    if (page < totalPages - 2) pages.push("...");
    pages.push(totalPages);
  }

  return (
    <div className="flex items-center justify-center gap-1 mt-6">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1.5 text-xs rounded-lg bg-slate-800/60 text-slate-400 hover:bg-slate-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        ← Prev
      </button>
      {pages.map((p, i) =>
        p === "..." ? (
          <span key={`ellipsis-${i}`} className="px-2 text-slate-600">
            …
          </span>
        ) : (
          <button
            key={p}
            onClick={() => onPageChange(p)}
            className={`px-3 py-1.5 text-xs rounded-lg transition-colors ${
              p === page
                ? "bg-rose-500/20 text-rose-400 font-semibold"
                : "bg-slate-800/60 text-slate-400 hover:bg-slate-700/60"
            }`}
          >
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1.5 text-xs rounded-lg bg-slate-800/60 text-slate-400 hover:bg-slate-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
      >
        Next →
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading / Empty
// ---------------------------------------------------------------------------

function LoadingSpinner() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="h-10 w-10 rounded-full border-2 border-slate-700 border-t-rose-500 animate-spin" />
      <p className="text-sm text-slate-500">Loading talk items…</p>
      <p className="text-xs text-slate-600">
        Fetching and analyzing sentiment across all videos. This may take a
        moment for the first load.
      </p>
    </div>
  );
}

function EmptyState({ hasSearched }: { hasSearched: boolean }) {
  if (!hasSearched) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <div className="text-5xl">💬</div>
        <h3 className="text-lg font-semibold text-slate-300">
          Discover what people are saying
        </h3>
        <p className="text-sm text-slate-500 text-center max-w-md">
          Enter a keyword above to aggregate talk items from YouTube videos and
          analyze their sentiment.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="text-5xl">🔇</div>
      <h3 className="text-lg font-semibold text-slate-300">
        No talk items found
      </h3>
      <p className="text-sm text-slate-500 text-center max-w-md">
        Try a different keyword or adjust your filters.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page content
// ---------------------------------------------------------------------------

function TalkContent() {
  const router = useRouter();
  const { tenantName } = useTenant();
  const shared = useKeyword();
  const talk = useTalkData(shared.activeKeyword);

  useEffect(() => {
    if (router.query.q && typeof router.query.q === "string") {
      talk.setKeyword(router.query.q);
      shared.commitKeyword(router.query.q);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.q]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    talk.search();
    shared.commitKeyword(talk.keyword.trim());
  }

  function handleTextSearch(e: React.FormEvent) {
    e.preventDefault();
    talk.refresh();
  }

  const totalSentiment =
    talk.sentimentCounts.positive +
    talk.sentimentCounts.negative +
    talk.sentimentCounts.neutral;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-xl">💬</span>
        <h1 className="text-xl font-bold text-white">Talk</h1>
        <span className="rounded-full bg-slate-800/60 px-2.5 py-0.5 text-xs text-slate-400">
          {tenantName}
        </span>
      </div>

      {/* Keyword search */}
      <KeywordSearchBar
        keyword={talk.keyword}
        onKeywordChange={talk.setKeyword}
        onSearch={handleSearch}
        isLoading={talk.isLoading}
        placeholder="Search for a brand or topic…"
      />

      {/* Error banner */}
      {talk.error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          ⚠️ {talk.error}
        </div>
      )}

      {talk.isLoading ? (
        <LoadingSpinner />
      ) : !talk.hasSearched ? (
        <EmptyState hasSearched={false} />
      ) : (
        <>
          {/* Sentiment summary */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-medium text-slate-400 uppercase tracking-wider">
                Sentiment Overview
              </h2>
              <span className="text-xs text-slate-500">
                {talk.totalTalkItems.toLocaleString()} talk items total
              </span>
            </div>
            <SentimentSummary
              counts={talk.sentimentCounts}
              total={totalSentiment}
              activeFilter={talk.sentimentFilter}
              onFilter={talk.setSentimentFilter}
            />
          </div>

          {/* Filters bar */}
          <div className="flex flex-wrap items-center gap-3">

            {/* ── Timeline date range picker ── */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-slate-500 whitespace-nowrap">From</span>
              <input
                type="date"
                value={talk.startDate}
                onChange={(e) => talk.setStartDate(e.target.value)}
                className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-2 py-1.5 text-xs text-slate-300 focus:border-rose-500/50 focus:outline-none cursor-pointer transition-colors"
              />
              <span className="text-[11px] text-slate-500">To</span>
              <input
                type="date"
                value={talk.endDate}
                onChange={(e) => talk.setEndDate(e.target.value)}
                className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-2 py-1.5 text-xs text-slate-300 focus:border-rose-500/50 focus:outline-none cursor-pointer transition-colors"
              />
              {talk.isTimelineMode && (
                <button
                  onClick={talk.clearTimeline}
                  className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-xs text-amber-400 hover:bg-amber-500/20 transition-colors"
                  title="Clear date filter and return to real-time mode"
                >
                  🗓 {talk.startDate} → {talk.endDate} ×
                </button>
              )}
            </div>

            <form
              onSubmit={handleTextSearch}
              className="flex-1 min-w-[200px] max-w-sm"
            >
              <input
                type="text"
                value={talk.searchQuery}
                onChange={(e) => talk.setSearchQuery(e.target.value)}
                placeholder="Search within talk items…"
                className="w-full rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-1.5 text-xs text-slate-300 placeholder-slate-500 focus:border-rose-500/50 focus:outline-none transition-colors"
                onBlur={talk.refresh}
              />
            </form>

            <select
              value={talk.sortOrder}
              onChange={(e) =>
                talk.setSortOrder(e.target.value as "newest" | "oldest")
              }
              className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-1.5 text-xs text-slate-300 focus:outline-none cursor-pointer"
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>

            {talk.sentimentFilter && (
              <button
                onClick={() => talk.setSentimentFilter(null)}
                className="inline-flex items-center gap-1 rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-1 text-xs text-rose-400 hover:bg-rose-500/20 transition-colors"
              >
                {sentimentIcon(talk.sentimentFilter)}{" "}
                {capitalize(talk.sentimentFilter)}
                <span className="ml-1">×</span>
              </button>
            )}

            {/* Bot filter chips */}
            <div className="flex items-center gap-1.5">
              {(["human", "suspicious", "bot"] as const).map((label) => {
                const isActive = talk.botFilter === label;
                return (
                  <button
                    key={label}
                    onClick={() => talk.setBotFilter(isActive ? null : label)}
                    className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors ${
                      isActive
                        ? botBadgeColor(label)
                        : "border-slate-700/60 text-slate-500 hover:border-slate-600 hover:text-slate-400"
                    }`}
                  >
                    {botIcon(label)} {capitalize(label)}
                  </button>
                );
              })}
            </div>

            <span className="text-xs text-slate-500 ml-auto">
              Showing {talk.items.length} of {talk.total.toLocaleString()}{" "}
              results
            </span>
          </div>

          {/* Talk items list */}
          {talk.items.length === 0 ? (
            <EmptyState hasSearched={true} />
          ) : (
            <div className="grid gap-3">
              {talk.items.map((item) => (
                <TalkCard key={item.commentId} item={item} />
              ))}
            </div>
          )}

          {/* Pagination */}
          <Pagination
            page={talk.page}
            totalPages={talk.totalPages}
            onPageChange={talk.goToPage}
          />
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported page
// ---------------------------------------------------------------------------

export default function ROTalkPage() {
  return (
    <TenantProvider>
      <ROLayout activeModule="talk">
        <TalkContent />
      </ROLayout>
    </TenantProvider>
  );
}
