import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Fingerprint, ShieldCheck, ShieldAlert, Info } from "lucide-react";
import { TenantProvider } from "@/contexts/TenantContext";
import { useReputationOs } from "@/hooks/useReputationOs";
import ROLayout from "@/components/reputation-os/ROLayout";
import ROCard from "@/components/reputation-os/ROCard";
import ROBadge from "@/components/reputation-os/ROBadge";
import ROMetricCard from "@/components/reputation-os/ROMetricCard";


// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DONUT_COLORS = ["#22c55e", "#ef4444"];

const SEVERITY_VARIANT: Record<string, "critical" | "high" | "medium" | "low"> = {
  critical: "critical",
  high: "high",
  medium: "medium",
  low: "low",
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
// Page content
// ---------------------------------------------------------------------------

function AuthenticityContent() {
  const { authenticity } = useReputationOs();

  const data = authenticity.data;

  const donutData = useMemo(() => {
    if (!data) return [];
    return [
      { name: "Genuine", value: data.genuine_percentage },
      { name: "Bot", value: data.bot_percentage },
    ];
  }, [data]);

  const maxPatternCount = useMemo(() => {
    if (!data?.patterns?.length) return 1;
    return Math.max(...data.patterns.map((p) => p.count), 1);
  }, [data]);

  const assessmentText = useMemo(() => {
    if (!data) return "";
    if (data.bot_percentage <= 10) {
      return `Engagement authenticity is strong with only ${data.bot_percentage.toFixed(1)}% bot activity detected across ${data.total_analyzed.toLocaleString()} analyzed accounts. Confidence level: ${data.confidence.toFixed(0)}%. Your audience is predominantly genuine.`;
    }
    if (data.bot_percentage <= 20) {
      return `Moderate bot activity detected at ${data.bot_percentage.toFixed(1)}%. Out of ${data.total_analyzed.toLocaleString()} analyzed accounts, ${data.suspicious_accounts.toLocaleString()} flagged as suspicious. Consider monitoring the identified patterns for escalation.`;
    }
    return `High bot presence detected at ${data.bot_percentage.toFixed(1)}%. ${data.suspicious_accounts.toLocaleString()} suspicious accounts identified from ${data.total_analyzed.toLocaleString()} analyzed. Immediate review of engagement patterns is recommended. Confidence: ${data.confidence.toFixed(0)}%.`;
  }, [data]);

  if (authenticity.isError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-red-400">
          Failed to load authenticity data.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <h1 className="text-xl font-bold text-white">Threat Sense</h1>

      {/* ── Top row: Donut + Stats ── */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Donut chart */}
        <ROCard
          title="Engagement Split"
          subtitle="Genuine vs Bot"
          icon={<Fingerprint size={16} />}
          className="lg:col-span-1"
        >
          {authenticity.isLoading ? (
            <SkeletonBlock className="mx-auto h-52 w-52 rounded-full" />
          ) : (
            <div className="flex flex-col items-center">
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {donutData.map((_, i) => (
                      <Cell key={i} fill={DONUT_COLORS[i]} />
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
              <div className="flex gap-6">
                <span className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  Genuine {data?.genuine_percentage.toFixed(1)}%
                </span>
                <span className="flex items-center gap-2 text-xs text-slate-400">
                  <span className="inline-block h-2.5 w-2.5 rounded-full bg-red-500" />
                  Bot {data?.bot_percentage.toFixed(1)}%
                </span>
              </div>
            </div>
          )}
        </ROCard>

        {/* Key stats */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
          {authenticity.isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-20 w-full" />
            ))
          ) : (
            <>
              <ROMetricCard
                label="Bot Percentage"
                value={`${data?.bot_percentage.toFixed(1)}%`}
                trend={
                  (data?.bot_percentage ?? 0) > 15 ? "down" : "up"
                }
                trendValue={
                  (data?.bot_percentage ?? 0) > 15 ? "risky" : "healthy"
                }
                icon={<ShieldAlert size={16} />}
              />
              <ROMetricCard
                label="Genuine Percentage"
                value={`${data?.genuine_percentage.toFixed(1)}%`}
                trend="up"
                icon={<ShieldCheck size={16} />}
              />
              <ROMetricCard
                label="Suspicious Accounts"
                value={data?.suspicious_accounts.toLocaleString() ?? "—"}
                icon={<ShieldAlert size={16} />}
              />
              <ROMetricCard
                label="Total Analyzed"
                value={data?.total_analyzed.toLocaleString() ?? "—"}
                icon={<Fingerprint size={16} />}
              />
              <ROMetricCard
                label="Confidence"
                value={`${data?.confidence.toFixed(0)}%`}
                trend="stable"
                icon={<Info size={16} />}
              />
            </>
          )}
        </div>
      </div>

      {/* ── Middle: Patterns table ── */}
      <ROCard
        title="Detected Patterns"
        subtitle="Bot behavior signatures"
        icon={<Fingerprint size={16} />}
      >
        {authenticity.isLoading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : !data?.patterns?.length ? (
          <p className="text-sm text-slate-500">No patterns detected.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-800/60 text-xs text-slate-500">
                  <th className="pb-3 pr-4 font-medium">Pattern</th>
                  <th className="pb-3 pr-4 font-medium">Count</th>
                  <th className="pb-3 pr-4 font-medium">Severity</th>
                  <th className="pb-3 font-medium">Frequency</th>
                </tr>
              </thead>
              <tbody>
                {data.patterns.map((p) => (
                  <tr
                    key={p.type}
                    className="border-b border-slate-800/30"
                  >
                    <td className="py-3 pr-4 font-medium text-white">
                      {p.type}
                    </td>
                    <td className="py-3 pr-4 text-slate-300">
                      {p.count.toLocaleString()}
                    </td>
                    <td className="py-3 pr-4">
                      <ROBadge
                        variant={
                          SEVERITY_VARIANT[p.severity] ?? "medium"
                        }
                      >
                        {p.severity}
                      </ROBadge>
                    </td>
                    <td className="py-3">
                      <div className="h-2 w-full max-w-[200px] overflow-hidden rounded-full bg-slate-800">
                        <div
                          className="h-full rounded-full bg-cyan-500 transition-all duration-500"
                          style={{
                            width: `${(p.count / maxPatternCount) * 100}%`,
                          }}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ROCard>

      {/* ── Bottom: Authenticity Assessment ── */}
      <ROCard
        title="Threat Sense Assessment"
        subtitle="AI-powered analysis"
        icon={<ShieldCheck size={16} />}
      >
        {authenticity.isLoading ? (
          <div className="space-y-2">
            <SkeletonBlock className="h-3 w-full" />
            <SkeletonBlock className="h-3 w-5/6" />
            <SkeletonBlock className="h-3 w-4/6" />
          </div>
        ) : (
          <p className="text-sm leading-relaxed text-slate-300">
            {assessmentText}
          </p>
        )}
      </ROCard>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported page
// ---------------------------------------------------------------------------

export default function AuthenticityPage() {
  return (
    <TenantProvider>
      <ROLayout activeModule="authenticity">
        <AuthenticityContent />
      </ROLayout>
    </TenantProvider>
  );
}
