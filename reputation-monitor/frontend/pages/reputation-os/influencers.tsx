import { useMemo, useState } from "react";
import { Users, Star, ShieldAlert, UserCheck } from "lucide-react";
import { TenantProvider } from "@/contexts/TenantContext";
import { useReputationOs, type Influencer } from "@/hooks/useReputationOs";
import ROLayout from "@/components/reputation-os/ROLayout";
import ROCard from "@/components/reputation-os/ROCard";
import ROBadge from "@/components/reputation-os/ROBadge";
import ROMetricCard from "@/components/reputation-os/ROMetricCard";


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type Classification = Influencer["classification"];
type Tab = "all" | "supporter" | "attacker" | "neutral";

const TABS: { key: Tab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "supporter", label: "Supporters" },
  { key: "attacker", label: "Attackers" },
  { key: "neutral", label: "Neutral" },
];

const CLASS_BADGE: Record<Classification, "positive" | "negative" | "neutral"> = {
  supporter: "positive",
  attacker: "negative",
  neutral: "neutral",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-slate-800/60 ${className}`} />
  );
}

function initials(name: string): string {
  return name
    .replace(/^@/, "")
    .slice(0, 2)
    .toUpperCase();
}

// ---------------------------------------------------------------------------
// Influencer card
// ---------------------------------------------------------------------------

function InfluencerCard({ inf }: { inf: Influencer }) {
  const hasChannelUrl =
    inf.channel_url &&
    inf.channel_url.startsWith("https://");

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/50 p-5 backdrop-blur">
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        {/* Avatar */}
        <div
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
          style={{ backgroundColor: inf.avatar_color }}
        >
          {initials(inf.username)}
        </div>
        <div className="min-w-0 flex-1">
          {hasChannelUrl ? (
            <a
              href={inf.channel_url}
              target="_blank"
              rel="noopener noreferrer"
              className="truncate text-sm font-semibold text-white hover:text-rose-400 transition-colors block"
            >
              @{inf.username}
            </a>
          ) : (
            <p className="truncate text-sm font-semibold text-white">
              @{inf.username}
            </p>
          )}
          <ROBadge variant={CLASS_BADGE[inf.classification]}>
            {inf.classification}
          </ROBadge>
        </div>
      </div>

      {/* Influence score bar */}
      <div className="mb-3">
        <div className="mb-1 flex justify-between text-[10px] text-slate-500">
          <span>Influence</span>
          <span>{inf.influence_score}/100</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full bg-cyan-500 transition-all duration-500"
            style={{ width: `${inf.influence_score}%` }}
          />
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <span className="block text-[10px] text-slate-500">Reach</span>
          <span className="text-sm font-semibold text-white">
            {inf.reach >= 1_000_000
              ? `${(inf.reach / 1_000_000).toFixed(1)}M`
              : inf.reach >= 1_000
                ? `${(inf.reach / 1_000).toFixed(1)}K`
                : inf.reach}
          </span>
        </div>
        <div>
          <span className="block text-[10px] text-slate-500">Engagement</span>
          <span className="text-sm font-semibold text-white">
            {inf.engagement_rate.toFixed(1)}%
          </span>
        </div>
        <div>
          <span className="block text-[10px] text-slate-500">Impact</span>
          <span className="text-sm font-semibold text-white">
            {inf.impact_percentage.toFixed(1)}%
          </span>
        </div>
        <div>
          <span className="block text-[10px] text-slate-500">Sentiment</span>
          <div className="mt-0.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                inf.recent_sentiment >= 0.6
                  ? "bg-emerald-500"
                  : inf.recent_sentiment >= 0.4
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
              style={{ width: `${inf.recent_sentiment * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Channel link */}
      <div className="mt-4 border-t border-slate-800/40 pt-3">
        {hasChannelUrl ? (
          <a
            href={inf.channel_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-medium text-rose-400 hover:text-rose-300 transition-colors"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            Open channel
          </a>
        ) : (
          <span className="text-xs text-slate-500">Link not available</span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page content
// ---------------------------------------------------------------------------

function InfluencersContent() {
  const { influencers } = useReputationOs();
  const [tab, setTab] = useState<Tab>("all");

  const all = useMemo(() => {
    const d = influencers.data;
    if (!d) return [];
    return [
      ...(d.supporters ?? []),
      ...(d.attackers ?? []),
      ...(d.neutrals ?? []),
    ];
  }, [influencers.data]);

  const filtered = useMemo(
    () => (tab === "all" ? all : all.filter((i) => i.classification === tab)),
    [all, tab],
  );

  const avgScore = useMemo(() => {
    if (all.length === 0) return 0;
    return Math.round(all.reduce((s, i) => s + i.influence_score, 0) / all.length);
  }, [all]);

  const topSupporter = useMemo(
    () =>
      [...all]
        .filter((i) => i.classification === "supporter")
        .sort((a, b) => b.influence_score - a.influence_score)[0]?.username ??
      "—",
    [all],
  );

  const topAttacker = useMemo(
    () =>
      [...all]
        .filter((i) => i.classification === "attacker")
        .sort((a, b) => b.influence_score - a.influence_score)[0]?.username ??
      "—",
    [all],
  );

  if (influencers.isError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-red-400">Failed to load influencer data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <h1 className="text-xl font-bold text-white">Influencer Intelligence</h1>

      {/* ── Summary stats ── */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {influencers.isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-20 w-full" />
          ))
        ) : (
          <>
            <ROMetricCard
              label="Total Influencers"
              value={all.length}
              icon={<Users size={16} />}
            />
            <ROMetricCard
              label="Avg Influence Score"
              value={avgScore}
              icon={<Star size={16} />}
            />
            <ROMetricCard
              label="Top Supporter"
              value={`@${topSupporter}`}
              icon={<UserCheck size={16} />}
            />
            <ROMetricCard
              label="Top Attacker"
              value={`@${topAttacker}`}
              icon={<ShieldAlert size={16} />}
            />
          </>
        )}
      </div>

      {/* ── Tab bar ── */}
      <div className="flex gap-1 rounded-lg border border-slate-800/60 bg-slate-900/50 p-1 backdrop-blur">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-md px-4 py-2 text-xs font-medium transition ${
              tab === t.key
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {t.label}
            {tab === t.key && (
              <span className="ml-1.5 text-slate-500">({filtered.length})</span>
            )}
          </button>
        ))}
      </div>

      {/* ── Influencer grid ── */}
      {influencers.isLoading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-56 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <ROCard title="No Results">
          <p className="text-sm text-slate-500">
            No influencers match this filter.
          </p>
        </ROCard>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((inf) => (
            <InfluencerCard key={inf.username} inf={inf} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported page
// ---------------------------------------------------------------------------

export default function InfluencersPage() {
  return (
    <TenantProvider>
      <ROLayout activeModule="influencers">
        <InfluencersContent />
      </ROLayout>
    </TenantProvider>
  );
}
