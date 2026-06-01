import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  TrendingDown,
  TrendingUp,
  Minus,
} from "lucide-react";
import { TenantProvider } from "@/contexts/TenantContext";
import { useReputationOs, type NarrativeCluster } from "@/hooks/useReputationOs";
import ROLayout from "@/components/reputation-os/ROLayout";
import ROCard from "@/components/reputation-os/ROCard";
import ROBadge from "@/components/reputation-os/ROBadge";


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DONUT_COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f97316",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#eab308",
  "#ec4899",
];

const SENTIMENT_VARIANT: Record<
  NarrativeCluster["sentiment"],
  "positive" | "negative" | "neutral"
> = {
  positive: "positive",
  negative: "negative",
  neutral: "neutral",
  mixed: "neutral",
};

const TREND_ICON: Record<NarrativeCluster["trend"], React.ReactNode> = {
  growing: <TrendingUp size={14} className="text-emerald-400" />,
  stable: <Minus size={14} className="text-slate-400" />,
  declining: <TrendingDown size={14} className="text-red-400" />,
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-slate-800/60 ${className}`} />
  );
}

// ---------------------------------------------------------------------------
// Expandable narrative card
// ---------------------------------------------------------------------------

function NarrativeCard({
  narrative,
  color,
}: {
  narrative: NarrativeCluster;
  color: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visibleTexts = expanded
    ? narrative.sample_texts
    : narrative.sample_texts.slice(0, 2);

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/50 p-5 backdrop-blur">
      {/* Label */}
      <h3 className="mb-3 text-base font-semibold text-white">
        {narrative.label}
      </h3>

      {/* Percentage bar */}
      <div className="mb-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-slate-400">
            {narrative.percentage.toFixed(1)}% of topic mentions
          </span>
          <div className="flex items-center gap-1.5">
            {TREND_ICON[narrative.trend]}
            <span className="text-[10px] capitalize text-slate-500">
              {narrative.trend}
            </span>
          </div>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${narrative.percentage}%`,
              backgroundColor: color,
            }}
          />
        </div>
      </div>

      {/* Sentiment badge */}
      <div className="mb-3">
        <ROBadge variant={SENTIMENT_VARIANT[narrative.sentiment]}>
          {narrative.sentiment}
        </ROBadge>
      </div>

      {/* Sample texts */}
      <div className="space-y-2">
        {visibleTexts.map((t, i) => (
            <div
              key={i}
              className="rounded-lg bg-slate-800/50 px-3 py-2"
            >
              <p className="text-xs text-slate-300">
                &ldquo;{t}&rdquo;
              </p>
            </div>
        ))}
      </div>

      {narrative.sample_texts.length > 2 && (
        <button
          onClick={() => setExpanded((p) => !p)}
          className="mt-2 flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300"
        >
          {expanded ? (
            <>
              <ChevronUp size={12} /> Show less
            </>
          ) : (
            <>
              <ChevronDown size={12} /> Show{" "}
              {narrative.sample_texts.length - 2} more
            </>
          )}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page content
// ---------------------------------------------------------------------------

function NarrativesContent() {
  const { narratives } = useReputationOs();

  const clusters = useMemo(() => narratives.data ?? [], [narratives.data]);

  const pieData = useMemo(
    () =>
      clusters.map((c) => ({
        name: c.label,
        value: c.percentage,
      })),
    [clusters],
  );

  const insightText = useMemo(() => {
    if (clusters.length === 0) return "";
    const top = [...clusters].sort((a, b) => b.percentage - a.percentage)[0];
    const negCount = clusters.filter((c) => c.sentiment === "negative").length;
    return `The dominant narrative is "${top.label}" at ${top.percentage.toFixed(1)}% share. ${
      negCount > 0
        ? `${negCount} cluster(s) carry negative sentiment — monitor closely.`
        : "All narratives lean positive or neutral."
    }`;
  }, [clusters]);

  if (narratives.isError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-red-400">Failed to load narrative data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <h1 className="text-xl font-bold text-white">Narrative Intelligence</h1>

      {/* ── Top: Donut chart ── */}
      <ROCard
        title="Narrative Distribution"
        subtitle={`${clusters.length} clusters detected`}
        icon={<BookOpen size={16} />}
      >
        {narratives.isLoading ? (
          <SkeletonBlock className="mx-auto h-64 w-64 rounded-full" />
        ) : (
          <div className="flex flex-col items-center gap-4 md:flex-row md:items-start md:justify-center">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {pieData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={DONUT_COLORS[i % DONUT_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(val: number) => `${val.toFixed(1)}%`}
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: 8,
                    color: "#e2e8f0",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>

            {/* Legend */}
            <div className="flex flex-wrap gap-3 md:flex-col">
              {clusters.map((c, i) => (
                <span
                  key={c.label}
                  className="flex items-center gap-2 text-xs text-slate-400"
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{
                      backgroundColor:
                        DONUT_COLORS[i % DONUT_COLORS.length],
                    }}
                  />
                  {c.label}{" "}
                  <span className="text-slate-600">
                    {c.percentage.toFixed(1)}%
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </ROCard>

      {/* ── Main grid: Narrative cards + Insight sidebar ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        {/* Narrative cards */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:col-span-3">
          {narratives.isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <SkeletonBlock key={i} className="h-52 w-full" />
              ))
            : clusters.map((c, i) => (
                <NarrativeCard
                  key={c.label}
                  narrative={c}
                  color={DONUT_COLORS[i % DONUT_COLORS.length]}
                />
              ))}
        </div>

        {/* Key Insight */}
        <ROCard
          title="Key Insight"
          subtitle="Computed from narrative data"
          icon={<Lightbulb size={16} />}
          className="lg:col-span-1"
        >
          {narratives.isLoading ? (
            <div className="space-y-2">
              <SkeletonBlock className="h-3 w-full" />
              <SkeletonBlock className="h-3 w-3/4" />
              <SkeletonBlock className="h-3 w-5/6" />
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-slate-300">
              {insightText}
            </p>
          )}
        </ROCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported page
// ---------------------------------------------------------------------------

export default function NarrativesPage() {
  return (
    <TenantProvider>
      <ROLayout activeModule="narratives">
        <NarrativesContent />
      </ROLayout>
    </TenantProvider>
  );
}
