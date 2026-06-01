import { useMemo, useState } from "react";
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  AlertTriangle,
  BarChart3,
  MessageSquare,
  Shield,
  TrendingDown,
  Zap,
  Filter,
} from "lucide-react";
import { TenantProvider } from "@/contexts/TenantContext";
import { useReputationOs } from "@/hooks/useReputationOs";
import ROLayout from "@/components/reputation-os/ROLayout";
import ROCard from "@/components/reputation-os/ROCard";
import ROBadge from "@/components/reputation-os/ROBadge";


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

type Severity = "critical" | "high" | "medium" | "low";

const SEVERITY_OPTIONS: Severity[] = ["critical", "high", "medium", "low"];

const TYPE_ICON: Record<string, React.ReactNode> = {
  negative_spike: <TrendingDown size={16} />,
  velocity_surge: <Zap size={16} />,
  bot_activity: <Shield size={16} />,
  narrative_shift: <MessageSquare size={16} />,
  reputation_drop: <AlertTriangle size={16} />,
  low_engagement: <BarChart3 size={16} />,
};

const TYPE_LABEL: Record<string, string> = {
  negative_spike: "Negative Spike",
  velocity_surge: "Velocity Surge",
  bot_activity: "Bot Activity",
  narrative_shift: "Narrative Shift",
  reputation_drop: "Reputation Drop",
  low_engagement: "Low Engagement",
};

const SEVERITY_BORDER: Record<Severity, string> = {
  critical: "border-l-red-500",
  high: "border-l-orange-500",
  medium: "border-l-yellow-500",
  low: "border-l-blue-500",
};

const PIE_COLORS = ["#ef4444", "#f97316", "#eab308", "#3b82f6", "#8b5cf6"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-slate-800/60 ${className}`} />
  );
}

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

function AlertsContent() {
  const { alerts } = useReputationOs();

  const [severityFilter, setSeverityFilter] = useState<"all" | Severity>("all");
  const [typeFilter, setTypeFilter] = useState<"all" | string>("all");

  const allAlerts = useMemo(() => alerts.data ?? [], [alerts.data]);

  const filtered = useMemo(() => {
    return allAlerts.filter((a) => {
      if (severityFilter !== "all" && a.severity !== severityFilter) return false;
      if (typeFilter !== "all" && a.type !== typeFilter) return false;
      return true;
    });
  }, [allAlerts, severityFilter, typeFilter]);

  // Pie data — count per type
  const typeCounts = useMemo(() => {
    const map = new Map<string, number>();
    allAlerts.forEach((a) => map.set(a.type, (map.get(a.type) ?? 0) + 1));
    return Array.from(map, ([name, value]) => ({
      name: TYPE_LABEL[name as string] ?? name,
      value,
    }));
  }, [allAlerts]);

  // Timeline — alerts per hour-bucket (last 24h)
  const timeline = useMemo(() => {
    const buckets: Record<string, number> = {};
    for (let i = 23; i >= 0; i--) {
      const d = new Date(Date.now() - i * 3_600_000);
      const key = `${String(d.getHours()).padStart(2, "0")}:00`;
      buckets[key] = 0;
    }
    allAlerts.forEach((a) => {
      const h = `${String(new Date(a.timestamp).getHours()).padStart(2, "0")}:00`;
      if (h in buckets) buckets[h]++;
    });
    return Object.entries(buckets).map(([hour, count]) => ({ hour, count }));
  }, [allAlerts]);

  const uniqueTypes = useMemo(
    () => Array.from(new Set(allAlerts.map((a) => a.type))),
    [allAlerts],
  );

  if (alerts.isError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-red-400">Failed to load alerts.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-white">Early Warning System</h1>
        <ROBadge variant="critical" pulse>
          {allAlerts.length} alerts
        </ROBadge>
      </div>

      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-800/60 bg-slate-900/50 px-4 py-3 backdrop-blur">
        <Filter size={14} className="text-slate-500" />

        {/* Severity pills */}
        <button
          onClick={() => setSeverityFilter("all")}
          className={`rounded-full px-3 py-1 text-xs font-medium transition ${
            severityFilter === "all"
              ? "bg-slate-700 text-white"
              : "text-slate-400 hover:text-white"
          }`}
        >
          All
        </button>
        {SEVERITY_OPTIONS.map((s) => (
          <button
            key={s}
            onClick={() => setSeverityFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
              severityFilter === s
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {s}
          </button>
        ))}

        {/* Type dropdown */}
        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as "all" | string)}
          className="ml-auto rounded-lg border border-slate-700 bg-slate-800 px-3 py-1.5 text-xs text-slate-300 outline-none focus:border-slate-600"
        >
          <option value="all">All Types</option>
          {uniqueTypes.map((t) => (
            <option key={t} value={t}>
              {TYPE_LABEL[t] ?? t}
            </option>
          ))}
        </select>
      </div>

      {/* ── Main layout: Alert list + Sidebar ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Alert list */}
        <div className="space-y-3 lg:col-span-2">
          {alerts.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-24 w-full" />
            ))
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/50 p-8 text-center backdrop-blur">
              <p className="text-sm text-slate-500">
                No alerts match your filters.
              </p>
            </div>
          ) : (
            filtered.map((a) => (
              <div
                key={a.id}
                className={`rounded-xl border border-slate-800/60 border-l-4 ${
                  SEVERITY_BORDER[a.severity as Severity]
                } bg-slate-900/50 p-4 backdrop-blur`}
              >
                <div className="mb-2 flex items-center gap-3">
                  <span className="text-slate-400">
                    {TYPE_ICON[a.type]}
                  </span>
                  <span className="flex-1 text-sm font-semibold text-white">
                    {a.message}
                  </span>
                  <ROBadge
                    variant={a.severity as Severity}
                    pulse={a.severity === "critical"}
                  >
                    {a.severity}
                  </ROBadge>
                </div>
                <p className="mb-2 text-xs text-slate-400">{a.details}</p>
                <div className="flex items-center justify-between text-[10px] text-slate-500">
                  <span>{TYPE_LABEL[a.type]}</span>
                  <span>{timeAgo(a.timestamp)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Sidebar: Stats */}
        <div className="space-y-6">
          {/* Pie chart */}
          <ROCard title="Alert Distribution" subtitle="By type">
            {alerts.isLoading ? (
              <SkeletonBlock className="mx-auto h-48 w-48 rounded-full" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={typeCounts}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {typeCounts.map((_, i) => (
                      <Cell
                        key={i}
                        fill={PIE_COLORS[i % PIE_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: "#0f172a",
                      border: "1px solid #334155",
                      borderRadius: 8,
                      color: "#e2e8f0",
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
            {/* Legend */}
            <div className="mt-2 flex flex-wrap gap-3">
              {typeCounts.map((t, i) => (
                <span
                  key={t.name}
                  className="flex items-center gap-1.5 text-[10px] text-slate-400"
                >
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{
                      backgroundColor: PIE_COLORS[i % PIE_COLORS.length],
                    }}
                  />
                  {t.name}
                </span>
              ))}
            </div>
          </ROCard>

          {/* Timeline chart */}
          <ROCard title="Alert Timeline" subtitle="Last 24 hours">
            {alerts.isLoading ? (
              <SkeletonBlock className="h-40 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={timeline}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis
                    dataKey="hour"
                    tick={{ fill: "#64748b", fontSize: 10 }}
                    axisLine={{ stroke: "#334155" }}
                    tickLine={false}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fill: "#64748b", fontSize: 10 }}
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
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="#f97316"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ROCard>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported page
// ---------------------------------------------------------------------------

export default function AlertsPage() {
  return (
    <TenantProvider>
      <ROLayout activeModule="alerts">
        <AlertsContent />
      </ROLayout>
    </TenantProvider>
  );
}
