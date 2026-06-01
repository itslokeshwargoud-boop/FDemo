/**
 * MBI — Movie Buzz Indexer
 *
 * A standalone movie market intelligence engine.
 *
 * ──────────────────────────────────────────────────────────────────────────
 * ARCHITECTURAL NOTE
 * ──────────────────────────────────────────────────────────────────────────
 * This page is COMPLETELY INDEPENDENT of KeywordContext.
 * It does NOT share state with Feed, Talk, Alerts, or any other feature.
 *
 * Changing the timeline here affects ONLY MBI.
 * All other dashboard features remain unaffected.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { useMemo }       from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
} from "recharts";
import {
  Flame, Film, TrendingUp, TrendingDown, Minus,
  Eye, Play, Star, Calendar, BarChart3, Trophy, RefreshCw, Globe,
} from "lucide-react";
import { TenantProvider }                from "@/contexts/TenantContext";
import { useMbi }                        from "@/hooks/useMbi";
import ROLayout                          from "@/components/reputation-os/ROLayout";
import ROCard                            from "@/components/reputation-os/ROCard";
import type { MbiMovie }                 from "@/lib/mbi";
import { formatViews }                   from "@/lib/mbi";

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-800/60 ${className}`} />;
}

// ---------------------------------------------------------------------------
// Rank decorations
// ---------------------------------------------------------------------------

const RANK_MEDALS = ["🥇", "🥈", "🥉", "#4", "#5", "#6", "#7", "#8", "#9", "#10"];
const RANK_COLORS = [
  "#f59e0b", "#94a3b8", "#a16207", "#64748b", "#475569",
  "#475569", "#475569", "#475569", "#475569", "#475569",
];
const BAR_PALETTE = [
  "#f97316", "#fb923c", "#fbbf24", "#a3e635",
  "#34d399", "#22d3ee", "#818cf8", "#e879f9", "#f43f5e", "#94a3b8",
];

// ---------------------------------------------------------------------------
// Stat cell
// ---------------------------------------------------------------------------

function Stat({
  icon, label, value, accent = false,
}: { icon: React.ReactNode; label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-slate-500">
        <span className="text-slate-600">{icon}</span>
        {label}
      </div>
      <span className={`text-sm font-semibold ${accent ? "text-amber-400" : "text-white"}`}>
        {value}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Winner banner
// ---------------------------------------------------------------------------

function WinnerBanner({
  movie, trendDelta,
}: { movie: MbiMovie; trendDelta?: number }) {
  const hasTrend  = trendDelta !== undefined;
  const trendUp   = hasTrend && trendDelta > 0;
  const trendFlat = hasTrend && trendDelta === 0;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/40 via-slate-900 to-slate-900 p-6 shadow-[0_0_40px_rgba(245,158,11,0.12)]">
      {/* Glow */}
      <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 -translate-y-1/3 translate-x-1/3 rounded-full bg-amber-500/8 blur-3xl" />

      <div className="relative flex flex-col gap-5 sm:flex-row sm:items-start">
        {/* Thumbnail */}
        {movie.thumbnailUrl && (
          <div className="relative flex-shrink-0">
            <img
              src={movie.thumbnailUrl}
              alt={movie.name}
              className="h-28 w-48 rounded-xl object-cover ring-2 ring-amber-500/30"
            />
            <div className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full bg-amber-500 text-sm shadow-lg">
              🏆
            </div>
          </div>
        )}

        {/* Details */}
        <div className="flex-1 min-w-0">
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold uppercase tracking-widest text-amber-400">
              Buzz Winner
            </span>
            {hasTrend && (
              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                trendFlat
                  ? "bg-slate-800 text-slate-400"
                  : trendUp
                  ? "bg-emerald-900/50 text-emerald-400"
                  : "bg-red-900/40 text-red-400"
              }`}>
                {trendFlat ? <Minus size={10} /> : trendUp ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                {trendFlat
                  ? "Unchanged vs prev period"
                  : `${trendUp ? "+" : ""}${formatViews(Math.abs(trendDelta!))} vs prev period`}
              </span>
            )}
          </div>

          <h2 className="truncate text-2xl font-bold text-white leading-tight">
            {movie.name}
          </h2>

          <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            <Stat icon={<Eye size={13} />}      label="Total Views"     value={formatViews(movie.totalViews)} accent />
            <Stat icon={<Play size={13} />}      label="Videos"         value={movie.videoCount.toString()} />
            <Stat icon={<BarChart3 size={13} />} label="Avg Views/Video" value={formatViews(movie.engagementScore)} />
            <Stat icon={<Star size={13} />}      label="Engagement"     value={`${movie.engagementRate}%`} />
          </div>

          {movie.topChannels.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {movie.topChannels.slice(0, 3).map((ch) => (
                <span
                  key={ch.name}
                  className="inline-flex items-center gap-1.5 rounded-full border border-slate-700/50 bg-slate-800/50 px-3 py-1 text-xs text-slate-300"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                  {ch.name}
                  <span className="text-slate-500">·</span>
                  <span className="text-amber-400">{formatViews(ch.views)}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Leaderboard row
// ---------------------------------------------------------------------------

function MovieRow({ movie, rank }: { movie: MbiMovie; rank: number }) {
  const medal     = RANK_MEDALS[rank] ?? `#${rank + 1}`;
  const rankColor = RANK_COLORS[rank] ?? "#475569";

  return (
    <div className={`flex items-center gap-4 rounded-xl border px-4 py-3 transition-colors ${
      rank === 0
        ? "border-amber-500/20 bg-amber-950/10"
        : "border-slate-800/40 bg-slate-900/30 hover:border-slate-700/60 hover:bg-slate-800/30"
    }`}>
      {/* Rank */}
      <div className="flex w-8 flex-shrink-0 items-center justify-center text-base">{medal}</div>

      {/* Thumbnail */}
      {movie.thumbnailUrl ? (
        <img
          src={movie.thumbnailUrl}
          alt={movie.name}
          className="h-10 w-16 flex-shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div className="flex h-10 w-16 flex-shrink-0 items-center justify-center rounded-lg bg-slate-800">
          <Film size={16} className="text-slate-600" />
        </div>
      )}

      {/* Name + top channel */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-white">{movie.name}</p>
        <p className="truncate text-[11px] text-slate-500">
          {movie.topChannels[0]?.name ?? "—"}
          {movie.topChannels.length > 1 && ` +${movie.topChannels.length - 1} more`}
        </p>
      </div>

      {/* Video count */}
      <div className="hidden flex-shrink-0 text-center sm:block">
        <p className="text-xs font-medium text-white">{movie.videoCount}</p>
        <p className="text-[10px] text-slate-600">videos</p>
      </div>

      {/* Total views */}
      <div className="flex-shrink-0 text-right">
        <p className="text-sm font-bold" style={{ color: rankColor }}>
          {formatViews(movie.totalViews)}
        </p>
        <p className="text-[10px] text-slate-500">views</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Horizontal bar chart
// ---------------------------------------------------------------------------

function ViewsBarChart({ movies }: { movies: MbiMovie[] }) {
  const data = useMemo(
    () =>
      movies.slice(0, 10).map((m, i) => ({
        name:  m.name.length > 18 ? m.name.slice(0, 16) + "…" : m.name,
        views: m.totalViews,
        color: BAR_PALETTE[i] ?? "#94a3b8",
      })),
    [movies],
  );

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} layout="vertical" margin={{ left: 0, right: 16, top: 4, bottom: 4 }}>
        <XAxis
          type="number"
          tickFormatter={(v: number) => formatViews(v)}
          tick={{ fill: "#64748b", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          dataKey="name"
          type="category"
          width={120}
          tick={{ fill: "#94a3b8", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip
          formatter={(value: number) => [formatViews(value), "Total Views"]}
          contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8, fontSize: 12 }}
          labelStyle={{ color: "#f1f5f9" }}
          cursor={{ fill: "rgba(255,255,255,0.03)" }}
        />
        <Bar dataKey="views" radius={[0, 4, 4, 0]}>
          {data.map((entry, i) => <Cell key={i} fill={entry.color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ---------------------------------------------------------------------------
// Channel breakdown
// ---------------------------------------------------------------------------

function ChannelBreakdown({ movies }: { movies: MbiMovie[] }) {
  const channels = useMemo(() => {
    const map = new Map<string, { views: number; movies: Set<string> }>();
    for (const movie of movies) {
      for (const ch of movie.topChannels) {
        const e = map.get(ch.name) ?? { views: 0, movies: new Set() };
        e.views += ch.views;
        e.movies.add(movie.name);
        map.set(ch.name, e);
      }
    }
    return [...map.entries()]
      .map(([name, s]) => ({ name, views: s.views, movieCount: s.movies.size }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);
  }, [movies]);

  const maxViews = channels[0]?.views ?? 1;

  return (
    <div className="space-y-2">
      {channels.map((ch, i) => (
        <div key={ch.name} className="flex items-center gap-3">
          <span className="w-5 flex-shrink-0 text-right text-[10px] text-slate-600">
            #{i + 1}
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-0.5">
              <span className="truncate text-xs font-medium text-slate-300">{ch.name}</span>
              <span className="ml-2 flex-shrink-0 text-xs font-semibold text-white">
                {formatViews(ch.views)}
              </span>
            </div>
            <div className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-gradient-to-r from-rose-500 to-orange-400 transition-all"
                style={{ width: `${(ch.views / maxViews) * 100}%` }}
              />
            </div>
            <p className="mt-0.5 text-[10px] text-slate-600">
              {ch.movieCount} {ch.movieCount === 1 ? "movie" : "movies"}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MBI Timeline Picker — completely isolated from KeywordContext
// ---------------------------------------------------------------------------

const REGION_OPTIONS = [
  { value: "IN", label: "🇮🇳 India" },
  { value: "US", label: "🇺🇸 USA" },
  { value: "GB", label: "🇬🇧 UK" },
  { value: "AU", label: "🇦🇺 Australia" },
];

const QUICK_RANGES = [
  { label: "Last 30 days", days: 30 },
  { label: "Last 60 days", days: 60 },
  { label: "Last 90 days", days: 90 },
  { label: "This year",    days: 0, yearToDate: true },
];

function TimelinePicker({
  startDate,
  endDate,
  region,
  isLoading,
  onStartDate,
  onEndDate,
  onRegion,
  onRefresh,
  formattedRange,
}: {
  startDate: string;
  endDate: string;
  region: string;
  isLoading: boolean;
  onStartDate: (d: string) => void;
  onEndDate: (d: string) => void;
  onRegion: (r: string) => void;
  onRefresh: () => void;
  formattedRange: string;
}) {
  function applyQuickRange(days: number, yearToDate?: boolean) {
    const end   = new Date();
    end.setDate(end.getDate() - 1); // yesterday
    const start = new Date(end);
    if (yearToDate) {
      start.setMonth(0, 1); // Jan 1 of current year
    } else {
      start.setDate(start.getDate() - days + 1);
    }
    onStartDate(start.toISOString().slice(0, 10));
    onEndDate(end.toISOString().slice(0, 10));
  }

  return (
    <div className="rounded-2xl border border-slate-800/60 bg-slate-900/50 p-5 backdrop-blur">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar size={16} className="text-amber-400" />
          <h2 className="text-sm font-semibold text-white">Theatrical Release Window</h2>
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-1.5 text-xs text-slate-400 hover:border-slate-600 hover:text-slate-200 disabled:opacity-40 transition-colors"
          title="Refresh market data"
        >
          <RefreshCw size={12} className={isLoading ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Date + region row */}
      <div className="flex flex-wrap items-end gap-4 mb-4">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-slate-500">From</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => onStartDate(e.target.value)}
            className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-sm text-slate-300 focus:border-amber-500/50 focus:outline-none cursor-pointer transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-slate-500">To</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => onEndDate(e.target.value)}
            className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-sm text-slate-300 focus:border-amber-500/50 focus:outline-none cursor-pointer transition-colors"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1">
            <Globe size={9} /> Region
          </label>
          <select
            value={region}
            onChange={(e) => onRegion(e.target.value)}
            className="rounded-lg border border-slate-700/60 bg-slate-800/40 px-3 py-2 text-sm text-slate-300 focus:outline-none cursor-pointer"
          >
            {REGION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Active range pill */}
        <div className="flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-400">
          <Calendar size={11} />
          {formattedRange}
        </div>
      </div>

      {/* Quick-range chips */}
      <div className="flex flex-wrap gap-2">
        {QUICK_RANGES.map((qr) => (
          <button
            key={qr.label}
            onClick={() => applyQuickRange(qr.days, qr.yearToDate)}
            className="rounded-full border border-slate-700/60 bg-slate-800/40 px-3 py-1 text-xs text-slate-400 hover:border-amber-500/40 hover:text-amber-400 transition-colors"
          >
            {qr.label}
          </button>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page content
// ---------------------------------------------------------------------------

function MbiContent() {
  const mbi = useMbi();

  const resp      = mbi.data;
  // isFetching is true during background refetch — show a subtle spinner
  // instead of wiping the entire UI (placeholderData keeps prev results visible)
  const data = resp?.data;
  const trend = resp?.trend;
  const moviesDiscovered = resp?.moviesDiscovered ?? [];

  // ── Loading ───────────────────────────────────────────────────────────────
  const loadingBody = (
    <div className="space-y-6">
      <Sk className="h-36 w-full" />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-3">
          {[...Array(5)].map((_, i) => <Sk key={i} className="h-16 w-full" />)}
        </div>
        <Sk className="h-64 w-full" />
      </div>
    </div>
  );

  // ── Error ─────────────────────────────────────────────────────────────────
  const errorBody = mbi.error || (resp && !resp.success) ? (
    <div className="rounded-xl border border-red-800/30 bg-red-950/20 p-6 text-center">
      <p className="text-sm text-red-400">
        ⚠️ {mbi.error?.message ?? resp?.error ?? "Failed to load market data"}
      </p>
      {!process.env.NEXT_PUBLIC_TMDB_CONFIGURED && (
        <p className="mt-2 text-xs text-slate-500">
          Tip: add <code className="rounded bg-slate-800 px-1 py-0.5 text-amber-400">TMDB_API_KEY</code> to your environment for richer movie discovery.
        </p>
      )}
    </div>
  ) : null;

  return (
    <div className="space-y-6">
      {/* ── Page header ────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <span className="text-xl">🎬</span>
        <div>
          <h1 className="text-xl font-bold text-white">Movie Buzz Indexer</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Market-wide YouTube buzz intelligence · Independent of keyword search
          </p>
        </div>
      </div>

      {/* ── Timeline picker — MBI-only, no KeywordContext ──────────────────── */}
      <TimelinePicker
        startDate={mbi.startDate}
        endDate={mbi.endDate}
        region={mbi.region}
        isLoading={mbi.isLoading}
        onStartDate={mbi.setStartDate}
        onEndDate={mbi.setEndDate}
        onRegion={mbi.setRegion}
        onRefresh={mbi.refresh}
        formattedRange={mbi.formattedRange}
      />

      {/* ── Stats bar ─────────────────────────────────────────────────────── */}
      {!mbi.isLoading && data && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-400">
            <Film size={12} />
            {data.movies.length} movies · {data.totalVideosAnalyzed} videos analysed
          </div>
          {moviesDiscovered.length > 0 && (
            <div className="flex items-center gap-1.5 rounded-full border border-slate-800 bg-slate-900/60 px-3 py-1.5 text-xs text-slate-400">
              🎯 {moviesDiscovered.length} titles from TMDB
            </div>
          )}
          {trend?.winnerChanged && (
            <div className="flex items-center gap-1.5 rounded-full border border-purple-800/40 bg-purple-950/20 px-3 py-1.5 text-xs text-purple-400">
              <Flame size={12} />
              Winner changed from &quot;{trend.previousWinner}&quot;
            </div>
          )}
        </div>
      )}

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      {/* Subtle refetch indicator (previous results remain visible) */}
      {mbi.isFetching && !mbi.isLoading && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-500/20 bg-amber-950/10 px-3 py-2 text-xs text-amber-400">
          <RefreshCw size={11} className="animate-spin" />
          Updating market data…
        </div>
      )}

      {mbi.isLoading ? (
        loadingBody
      ) : errorBody ? (
        errorBody
      ) : !data || data.movies.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-800/60 bg-slate-900/40 py-20 text-center">
          <Film size={40} className="mb-4 text-slate-700" />
          <p className="text-sm font-medium text-slate-500">No movie data found for this window</p>
          <p className="mt-1 text-xs text-slate-600">
            Try a wider date range or add a <code className="rounded bg-slate-800 px-1 text-amber-400">TMDB_API_KEY</code> for richer discovery
          </p>
        </div>
      ) : (
        <>
          {/* Winner banner */}
          {data.winner && (
            <WinnerBanner
              movie={data.winner}
              trendDelta={trend?.viewsDelta}
            />
          )}

          {/* Main grid: leaderboard + channel breakdown */}
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                Market Leaderboard
              </p>
              {data.movies.map((movie, i) => (
                <MovieRow key={movie.name} movie={movie} rank={i} />
              ))}
            </div>

            <div className="space-y-5">
              <ROCard
                title="Top Channels"
                subtitle="By total views contributed"
                icon={<Play size={14} />}
              >
                <ChannelBreakdown movies={data.movies} />
              </ROCard>
            </div>
          </div>

          {/* Views bar chart */}
          <ROCard
            title="Views Distribution"
            subtitle="Total YouTube views per movie in selected window"
            icon={<BarChart3 size={14} />}
          >
            <ViewsBarChart movies={data.movies} />
          </ROCard>

          {/* Engagement table */}
          <ROCard
            title="Engagement Details"
            subtitle="Avg views per video · Engagement rate (likes/views)"
            icon={<TrendingUp size={14} />}
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wider text-slate-600">
                    <th className="pb-3 pr-4">Movie</th>
                    <th className="pb-3 pr-4 text-right">Total Views</th>
                    <th className="pb-3 pr-4 text-right">Videos</th>
                    <th className="pb-3 pr-4 text-right">Avg / Video</th>
                    <th className="pb-3 text-right">Eng. Rate</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {data.movies.map((m, i) => (
                    <tr key={m.name}>
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-600">{RANK_MEDALS[i] ?? `#${i + 1}`}</span>
                          <span className="font-medium text-white truncate max-w-[180px]">{m.name}</span>
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-right font-semibold text-amber-400">
                        {formatViews(m.totalViews)}
                      </td>
                      <td className="py-2.5 pr-4 text-right text-slate-400">{m.videoCount}</td>
                      <td className="py-2.5 pr-4 text-right text-slate-300">
                        {formatViews(m.engagementScore)}
                      </td>
                      <td className="py-2.5 text-right">
                        <span className={`font-medium ${
                          m.engagementRate >= 5 ? "text-emerald-400"
                            : m.engagementRate >= 2 ? "text-amber-400"
                            : "text-slate-400"
                        }`}>
                          {m.engagementRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ROCard>

          {/* TMDB movie list (when available) */}
          {moviesDiscovered.length > 0 && (
            <ROCard
              title="Movies in Window"
              subtitle={`${moviesDiscovered.length} theatrical releases discovered via TMDB`}
              icon={<Trophy size={14} />}
            >
              <div className="flex flex-wrap gap-2">
                {moviesDiscovered.map((title) => (
                  <span
                    key={title}
                    className="rounded-full border border-slate-700/50 bg-slate-800/40 px-3 py-1 text-xs text-slate-300"
                  >
                    {title}
                  </span>
                ))}
              </div>
            </ROCard>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function MbiPage() {
  return (
    <TenantProvider>
      <ROLayout activeModule="mbi">
        <MbiContent />
      </ROLayout>
    </TenantProvider>
  );
}
