import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Megaphone,
  ArrowRight,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  ListChecks,
} from "lucide-react";
import { TenantProvider } from "@/contexts/TenantContext";
import {
  useReputationOs,
  type CampaignReport,
} from "@/hooks/useReputationOs";
import ROLayout from "@/components/reputation-os/ROLayout";
import ROCard from "@/components/reputation-os/ROCard";
import ROBadge from "@/components/reputation-os/ROBadge";
import ROScoreGauge from "@/components/reputation-os/ROScoreGauge";


// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-slate-800/60 ${className}`} />
  );
}

const STATUS_BADGE: Record<string, "positive" | "negative" | "neutral"> = {
  positive: "positive",
  negative: "negative",
  neutral: "neutral",
};

// ---------------------------------------------------------------------------
// Page content
// ---------------------------------------------------------------------------

function CampaignsContent() {
  const { campaigns } = useReputationOs();

  const data: CampaignReport | undefined = campaigns.data;

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.metrics.map((m) => ({
      name: m.name,
      Before: m.before,
      After: m.after,
    }));
  }, [data]);

  if (campaigns.isError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-red-400">Failed to load campaign data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-white">
          Campaign Impact Tracker
        </h1>
        {data && (
          <>
            <span className="text-sm text-slate-400">{data.campaign_name}</span>
            <ROBadge variant={STATUS_BADGE[data.status] ?? "neutral"}>
              {data.status}
            </ROBadge>
          </>
        )}
      </div>

      {/* Impact score gauge */}
      {campaigns.isLoading ? (
        <SkeletonBlock className="mx-auto h-48 w-48" />
      ) : data ? (
        <div className="flex justify-center">
          <ROScoreGauge
            score={data.impact_score}
            size="lg"
            label="Impact Score"
          />
        </div>
      ) : null}

      {/* Metric comparison cards */}
      {campaigns.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {data.metrics.map((metric) => {
            const isPositive = metric.change >= 0;
            return (
              <div
                key={metric.name}
                className="rounded-xl border border-slate-800/60 bg-slate-900/50 p-5 backdrop-blur"
              >
                <p className="mb-3 text-xs font-medium uppercase text-slate-500">
                  {metric.name}
                </p>
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <p className="text-xs text-slate-500">Before</p>
                    <p className="text-xl font-bold text-slate-400">
                      {metric.before}
                    </p>
                  </div>
                  <ArrowRight size={18} className="text-slate-600" />
                  <div className="text-center">
                    <p className="text-xs text-slate-500">After</p>
                    <p className="text-xl font-bold text-white">{metric.after}</p>
                  </div>
                  <div className="ml-auto text-right">
                    <div
                      className={`flex items-center gap-1 ${
                        isPositive ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {isPositive ? (
                        <ArrowUpRight size={14} />
                      ) : (
                        <ArrowDownRight size={14} />
                      )}
                      <span className="text-sm font-bold">
                        {isPositive ? "+" : ""}
                        {metric.change_percentage.toFixed(1)}%
                      </span>
                    </div>
                    <p className="text-[10px] text-slate-500">
                      {isPositive ? "+" : ""}
                      {metric.change}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : null}

      {/* Grouped bar chart */}
      <ROCard
        title="Before vs After Comparison"
        subtitle="All campaign metrics"
        icon={<Megaphone size={18} />}
      >
        {campaigns.isLoading ? (
          <SkeletonBlock className="h-80 w-full" />
        ) : data ? (
          <ResponsiveContainer width="100%" height={340}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="name"
                tick={{ fill: "#64748b", fontSize: 11 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
              />
              <YAxis
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
              <Legend
                wrapperStyle={{ color: "#94a3b8", fontSize: 12 }}
              />
              <Bar
                dataKey="Before"
                fill="#475569"
                radius={[4, 4, 0, 0]}
                barSize={28}
              />
              <Bar
                dataKey="After"
                fill="#10b981"
                radius={[4, 4, 0, 0]}
                barSize={28}
              />
            </BarChart>
          </ResponsiveContainer>
        ) : null}
      </ROCard>

      {/* Assessment + Recommendations */}
      {data && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ROCard title="Assessment" icon={<CheckCircle2 size={18} />}>
            <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 px-5 py-4">
              <p className="text-sm leading-relaxed text-slate-300">
                {data.assessment}
              </p>
            </div>
          </ROCard>

          <ROCard title="Recommendations" icon={<ListChecks size={18} />}>
            <ul className="space-y-3">
              {data.recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-400" />
                  <span className="text-sm leading-relaxed text-slate-300">
                    {rec}
                  </span>
                </li>
              ))}
            </ul>
          </ROCard>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported page
// ---------------------------------------------------------------------------

export default function CampaignsPage() {
  return (
    <TenantProvider>
      <ROLayout activeModule="campaigns">
        <CampaignsContent />
      </ROLayout>
    </TenantProvider>
  );
}
