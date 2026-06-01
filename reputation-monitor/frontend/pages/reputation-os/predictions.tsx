import { useMemo } from "react";
import {
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BrainCircuit,
  ShieldAlert,
  Target,
} from "lucide-react";
import { TenantProvider } from "@/contexts/TenantContext";
import {
  useReputationOs,
  type PredictionsReport,
} from "@/hooks/useReputationOs";
import type { PredictionForecast } from "@/lib/reputationOs";
import ROLayout from "@/components/reputation-os/ROLayout";
import ROCard from "@/components/reputation-os/ROCard";
import ROBadge from "@/components/reputation-os/ROBadge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function SkeletonBlock({ className = "" }: { className?: string }) {
  return (
    <div className={`animate-pulse rounded-lg bg-slate-800/60 ${className}`} />
  );
}

const TREND_ICON: Record<string, React.ReactNode> = {
  improving: <TrendingUp size={14} className="text-emerald-400" />,
  declining: <TrendingDown size={14} className="text-red-400" />,
  stable: <Minus size={14} className="text-slate-400" />,
};

const TREND_BADGE: Record<string, "positive" | "negative" | "neutral"> = {
  improving: "positive",
  declining: "negative",
  stable: "neutral",
};

function riskBadgeVariant(
  risk: string,
): "critical" | "high" | "medium" | "low" | "positive" {
  const lower = risk.toLowerCase();
  if (lower.includes("critical") || lower.includes("high risk"))
    return "critical";
  if (lower.includes("elevated") || lower.includes("moderate")) return "medium";
  if (lower.includes("low") || lower.includes("stable")) return "positive";
  return "neutral" as "low";
}

// ---------------------------------------------------------------------------
// Page content
// ---------------------------------------------------------------------------

function PredictionsContent() {
  const { predictions } = useReputationOs();

  const data: PredictionsReport | undefined = predictions.data;

  const chartData = useMemo(() => {
    if (!data) return [];

    // Historical points
    const historical = data.historical.map((h) => ({
      date: h.date,
      score: h.score,
      predicted: null as number | null,
      upper: null as number | null,
      lower: null as number | null,
      band: null as [number, number] | null,
    }));

    // Bridge: last historical point is also first forecast point
    const lastHist = historical[historical.length - 1];

    // Forecast points
    const forecasts = data.forecasts.map((f, i) => {
      const daysOffset = (i + 1) * 7; // approximate weekly horizons
      const futureDate = new Date(
        Date.now() + daysOffset * 86_400_000,
      )
        .toISOString()
        .slice(0, 10);
      return {
        date: futureDate,
        score: null as number | null,
        predicted: f.predicted_score,
        upper: f.confidence_upper,
        lower: f.confidence_lower,
        band: [f.confidence_lower, f.confidence_upper] as [number, number],
      };
    });

    // Insert bridge point
    if (lastHist) {
      forecasts.unshift({
        date: lastHist.date,
        score: lastHist.score,
        predicted: lastHist.score,
        upper: lastHist.score,
        lower: lastHist.score,
        band: [lastHist.score, lastHist.score],
      });
    }

    return [...historical, ...forecasts.slice(1)];
  }, [data]);

  if (predictions.isError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-red-400">Failed to load predictions data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-white">
          Predictive Intelligence
        </h1>
        {data && (
          <ROBadge variant={riskBadgeVariant(data.risk_forecast)}>
            {data.risk_forecast}
          </ROBadge>
        )}
      </div>

      {/* Forecast cards */}
      {predictions.isLoading ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonBlock key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : data ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {data.forecasts.map((f: PredictionForecast) => (
            <ROCard key={f.horizon} title={f.horizon}>
              <div className="text-center">
                <p className="text-3xl font-bold text-white">
                  {f.predicted_score.toFixed(1)}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {f.confidence_lower.toFixed(1)} – {f.confidence_upper.toFixed(1)}
                </p>
                <div className="mt-2 flex items-center justify-center gap-1">
                  {TREND_ICON[f.trend]}
                  <ROBadge variant={TREND_BADGE[f.trend] ?? "neutral"}>
                    {f.trend}
                  </ROBadge>
                </div>
              </div>
            </ROCard>
          ))}
        </div>
      ) : null}

      {/* Main chart: Historical + Forecast */}
      <ROCard
        title="Score Forecast"
        subtitle="Historical trend with predictive extension"
        icon={<BrainCircuit size={18} />}
      >
        {predictions.isLoading ? (
          <SkeletonBlock className="h-80 w-full" />
        ) : data ? (
          <ResponsiveContainer width="100%" height={380}>
            <ComposedChart data={chartData}>
              <defs>
                <linearGradient id="predBand" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#06b6d4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis
                dataKey="date"
                tick={{ fill: "#64748b", fontSize: 10 }}
                axisLine={{ stroke: "#334155" }}
                tickLine={false}
                interval="preserveStartEnd"
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
                formatter={(value, name) => {
                  if (value == null) return ["-", String(name)];
                  return [Number(value).toFixed(1), String(name)];
                }}
              />
              {/* Confidence band */}
              <Area
                dataKey="band"
                fill="url(#predBand)"
                stroke="none"
                type="monotone"
              />
              {/* Historical line */}
              <Line
                type="monotone"
                dataKey="score"
                stroke="#06b6d4"
                strokeWidth={2.5}
                dot={false}
                connectNulls={false}
                name="Historical"
              />
              {/* Forecast line */}
              <Line
                type="monotone"
                dataKey="predicted"
                stroke="#06b6d4"
                strokeWidth={2}
                strokeDasharray="8 4"
                dot={{ r: 3, fill: "#06b6d4" }}
                connectNulls={false}
                name="Forecast"
              />
            </ComposedChart>
          </ResponsiveContainer>
        ) : null}
        {/* Legend */}
        <div className="mt-3 flex flex-wrap gap-5">
          <span className="flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-block h-0.5 w-5 bg-cyan-500" />
            Historical
          </span>
          <span className="flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-block h-0.5 w-5 border-t-2 border-dashed border-cyan-400" />
            Forecast
          </span>
          <span className="flex items-center gap-2 text-xs text-slate-400">
            <span className="inline-block h-3 w-5 rounded bg-cyan-500/15" />
            Confidence Band
          </span>
        </div>
      </ROCard>

      {/* Risk Assessment */}
      {data && (
        <ROCard title="Risk Assessment" icon={<ShieldAlert size={18} />}>
          <div className="rounded-lg border border-slate-800/60 bg-slate-900/30 px-5 py-4">
            <p className="text-sm leading-relaxed text-slate-300">
              {data.risk_forecast}
            </p>
          </div>

          <div className="mt-4 space-y-3">
            <p className="text-xs font-medium uppercase text-slate-500">
              Key Insights
            </p>
            <ul className="space-y-2 text-xs text-slate-400">
              {data.forecasts.map((f) => (
                <li key={f.horizon} className="flex items-start gap-2">
                  <Target size={12} className="mt-0.5 shrink-0 text-cyan-400" />
                  <span>
                    <strong className="text-slate-300">{f.horizon}:</strong>{" "}
                    Predicted score {f.predicted_score.toFixed(1)} (
                    {f.confidence_lower.toFixed(1)}–
                    {f.confidence_upper.toFixed(1)}), trend{" "}
                    <span
                      className={
                        f.trend === "improving"
                          ? "text-emerald-400"
                          : f.trend === "declining"
                            ? "text-red-400"
                            : "text-slate-400"
                      }
                    >
                      {f.trend}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </ROCard>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported page
// ---------------------------------------------------------------------------

export default function PredictionsPage() {
  return (
    <TenantProvider>
      <ROLayout activeModule="predictions">
        <PredictionsContent />
      </ROLayout>
    </TenantProvider>
  );
}
