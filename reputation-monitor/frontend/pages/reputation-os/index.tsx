import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bot,
  Gauge,
  Lightbulb,
  TrendingUp,
  Zap,
} from "lucide-react";
import { TenantProvider } from "@/contexts/TenantContext";
import { useReputationOs } from "@/hooks/useReputationOs";
import ROLayout from "@/components/reputation-os/ROLayout";
import ROCard from "@/components/reputation-os/ROCard";
import ROBadge from "@/components/reputation-os/ROBadge";
import ROScoreGauge from "@/components/reputation-os/ROScoreGauge";
import ROMetricCard from "@/components/reputation-os/ROMetricCard";

// ---------------------------------------------------------------------------
// Skeleton helpers
// ---------------------------------------------------------------------------

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-lg bg-slate-800/60 ${className}`}
    />
  );
}

function MetricSkeleton() {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/50 p-4 backdrop-blur">
      <SkeletonBlock className="mb-3 h-3 w-20" />
      <SkeletonBlock className="h-7 w-16" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVERITY_VARIANT: Record<string, "critical" | "high" | "medium" | "low"> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Page content
// ---------------------------------------------------------------------------

function OverviewContent() {
  const { score, predictions, alerts, narratives, actions } =
    useReputationOs();

  const trendData = useMemo(() => {
    if (!predictions.data?.historical) return [];
    return predictions.data.historical.map((h) => ({
      date: h.date.slice(5), // MM-DD
      score: h.score,
    }));
  }, [predictions.data]);

  const topAlerts = useMemo(
    () => (alerts.data ?? []).slice(0, 3),
    [alerts.data],
  );

  const topNarratives = useMemo(
    () =>
      [...(narratives.data ?? [])]
        .sort((a, b) => b.percentage - a.percentage)
        .slice(0, 3),
    [narratives.data],
  );

  const topActions = useMemo(
    () => (actions.data ?? []).slice(0, 3),
    [actions.data],
  );

  const isLoading =
    score.isLoading ||
    predictions.isLoading ||
    alerts.isLoading ||
    narratives.isLoading ||
    actions.isLoading;

  const hasError =
    score.isError ||
    predictions.isError ||
    alerts.isError ||
    narratives.isError ||
    actions.isError;

  if (hasError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-red-400">
          Failed to load dashboard data. Please try again later.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Top row: Score gauge + Metric cards ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        {/* Score gauge */}
        <div className="flex items-center justify-center rounded-xl border border-slate-800/60 bg-slate-900/50 p-6 backdrop-blur lg:col-span-1">
          {score.isLoading ? (
            <SkeletonBlock className="h-40 w-40 rounded-full" />
          ) : (
            <ROScoreGauge
              score={score.data?.score ?? 0}
              size="lg"
              label="Reputation Score"
              riskLevel={score.data?.risk_level}
            />
          )}
        </div>

        {/* Metric cards */}
        <div className="grid grid-cols-2 gap-4 lg:col-span-4">
          {isLoading ? (
            <>
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
              <MetricSkeleton />
            </>
          ) : (
            <>
              <ROMetricCard
                label="Sentiment"
                value={`${score.data?.breakdown.sentiment ?? 0}%`}
                trend={
                  (score.data?.trend_delta ?? 0) > 0
                    ? "up"
                    : (score.data?.trend_delta ?? 0) < 0
                      ? "down"
                      : "stable"
                }
                trendValue={`${Math.abs(score.data?.trend_delta ?? 0).toFixed(1)}%`}
                icon={<TrendingUp size={16} />}
              />
              <ROMetricCard
                label="Engagement Quality"
                value={`${score.data?.breakdown.engagement_quality ?? 0}%`}
                trend={
                  (score.data?.breakdown.engagement_quality ?? 0) >= 70
                    ? "up"
                    : (score.data?.breakdown.engagement_quality ?? 0) >= 55
                      ? "stable"
                      : "down"
                }
                icon={<BarChart3 size={16} />}
              />
              <ROMetricCard
                label="Bot Safety"
                value={`${score.data?.breakdown.bot_detection ?? 0}%`}
                trend={
                  (score.data?.breakdown.bot_detection ?? 0) >= 85
                    ? "up"
                    : (score.data?.breakdown.bot_detection ?? 0) >= 70
                      ? "stable"
                      : "down"
                }
                trendValue={
                  (score.data?.breakdown.bot_detection ?? 0) >= 85
                    ? "safe"
                    : (score.data?.breakdown.bot_detection ?? 0) >= 70
                      ? "moderate"
                      : "at risk"
                }
                icon={<Bot size={16} />}
              />
              <ROMetricCard
                label="Trend Stability"
                value={`${score.data?.breakdown.trend_stability ?? 0}%`}
                trend={
                  (score.data?.trend_delta ?? 0) > 2
                    ? "up"
                    : (score.data?.trend_delta ?? 0) < -2
                      ? "down"
                      : "stable"
                }
                icon={<Zap size={16} />}
              />
            </>
          )}
        </div>
      </div>

      {/* ── Middle row: Trend chart + Active Alerts ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Trend chart */}
        <ROCard
          title="Reputation Trend"
          subtitle="Last 30 days"
          icon={<Activity size={16} />}
          className="lg:col-span-2"
        >
          {predictions.isLoading ? (
            <SkeletonBlock className="h-64 w-full" />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="scoreGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  axisLine={{ stroke: "#334155" }}
                  tickLine={false}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "#64748b", fontSize: 11 }}
                  axisLine={{ stroke: "#334155" }}
                  tickLine={false}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #334155",
                    borderRadius: 8,
                    color: "#e2e8f0",
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="score"
                  stroke="#22c55e"
                  fill="url(#scoreGrad)"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ROCard>

        {/* Active Alerts */}
        <ROCard
          title="Active Alerts"
          subtitle={`${alerts.data?.length ?? 0} total`}
          icon={<AlertTriangle size={16} />}
          glowing={(alerts.data ?? []).some((a) => a.severity === "critical")}
        >
          {alerts.isLoading ? (
            <div className="space-y-3">
              <SkeletonBlock className="h-14 w-full" />
              <SkeletonBlock className="h-14 w-full" />
              <SkeletonBlock className="h-14 w-full" />
            </div>
          ) : topAlerts.length === 0 ? (
            <p className="text-sm text-slate-500">No active alerts</p>
          ) : (
            <ul className="space-y-3">
              {topAlerts.map((a) => (
                <li
                  key={a.id}
                  className="rounded-lg border border-slate-800/40 bg-slate-800/30 p-3"
                >
                  <div className="mb-1 flex items-center justify-between">
                    <ROBadge
                      variant={SEVERITY_VARIANT[a.severity] ?? "medium"}
                      pulse={a.severity === "critical"}
                    >
                      {a.severity}
                    </ROBadge>
                    <span className="text-[10px] text-slate-500">
                      {timeAgo(a.timestamp)}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">{a.message}</p>
                </li>
              ))}
            </ul>
          )}
        </ROCard>
      </div>

      {/* ── Bottom row: Top Narratives + Quick Actions ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Top Narratives */}
        <ROCard
          title="Top Narratives"
          subtitle="Biggest clusters"
          icon={<Gauge size={16} />}
        >
          {narratives.isLoading ? (
            <div className="space-y-3">
              <SkeletonBlock className="h-12 w-full" />
              <SkeletonBlock className="h-12 w-full" />
              <SkeletonBlock className="h-12 w-full" />
            </div>
          ) : topNarratives.length === 0 ? (
            <p className="text-sm text-slate-500">No narratives detected</p>
          ) : (
            <ul className="space-y-4">
              {topNarratives.map((n) => (
                <li key={n.label}>
                  <div className="mb-1 flex items-center justify-between">
                    <span className="text-sm font-medium text-white">
                      {n.label}
                    </span>
                    <ROBadge
                      variant={
                        n.sentiment === "positive"
                          ? "positive"
                          : n.sentiment === "negative"
                            ? "negative"
                            : "neutral"
                      }
                    >
                      {n.sentiment}
                    </ROBadge>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-cyan-500"
                      style={{ width: `${n.percentage}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-slate-500">
                    {n.percentage.toFixed(1)}% of conversation
                  </span>
                </li>
              ))}
            </ul>
          )}
        </ROCard>

        {/* Quick Actions */}
        <ROCard
          title="Quick Actions"
          subtitle="Recommended next steps"
          icon={<Lightbulb size={16} />}
        >
          {actions.isLoading ? (
            <div className="space-y-3">
              <SkeletonBlock className="h-14 w-full" />
              <SkeletonBlock className="h-14 w-full" />
              <SkeletonBlock className="h-14 w-full" />
            </div>
          ) : topActions.length === 0 ? (
            <p className="text-sm text-slate-500">No actions recommended</p>
          ) : (
            <ul className="space-y-3">
              {topActions.map((act) => (
                <li
                  key={act.id}
                  className="flex items-start gap-3 rounded-lg border border-slate-800/40 bg-slate-800/30 p-3"
                >
                  <span className="text-lg">{act.icon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="mb-0.5 flex items-center gap-2">
                      <span className="text-sm font-medium text-white">
                        {act.title}
                      </span>
                      <ROBadge variant={SEVERITY_VARIANT[act.priority] ?? "medium"}>
                        {act.priority}
                      </ROBadge>
                    </div>
                    <p className="text-xs text-slate-400">{act.description}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ROCard>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported page
// ---------------------------------------------------------------------------

export default function OverviewPage() {
  return (
    <TenantProvider>
      <ROLayout activeModule="overview">
        <OverviewContent />
      </ROLayout>
    </TenantProvider>
  );
}
