/**
 * MetricsView — UI component for the Metrics dashboard.
 *
 * Displays:
 *  - Overall reputation score with grade badge
 *  - Summary: one-liner, top positive/negative drivers
 *  - Individual metric breakdown with scores, weights, and evidence
 *  - Recommendation actions
 */

import type {
  MetricsOutput,
  MetricResult,
  Grade,
  EntityType,
} from "@/lib/metricsAnalyst";
import {
  validateProofUrl,
  logProofRejection,
} from "@/lib/proofValidation";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function gradeColor(grade: Grade): string {
  switch (grade) {
    case "Excellent":
      return "text-emerald-400";
    case "Good":
      return "text-sky-400";
    case "Watch":
      return "text-amber-400";
    case "Critical":
      return "text-red-400";
  }
}

function gradeBgColor(grade: Grade): string {
  switch (grade) {
    case "Excellent":
      return "bg-emerald-500/15 border-emerald-500/30";
    case "Good":
      return "bg-sky-500/15 border-sky-500/30";
    case "Watch":
      return "bg-amber-500/15 border-amber-500/30";
    case "Critical":
      return "bg-red-500/15 border-red-500/30";
  }
}

function scoreBarColor(score: number): string {
  if (score >= 85) return "bg-emerald-500";
  if (score >= 70) return "bg-sky-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function entityIcon(type: EntityType): string {
  switch (type) {
    case "INDIVIDUAL":
      return "👤";
    case "MOVIE":
      return "🎬";
    case "ORGANIZATION":
      return "🏢";
  }
}

function dataQualityBadge(quality: string): { text: string; color: string } {
  switch (quality) {
    case "high":
      return { text: "High", color: "text-emerald-400 bg-emerald-500/10" };
    case "medium":
      return { text: "Medium", color: "text-amber-400 bg-amber-500/10" };
    default:
      return { text: "Low", color: "text-slate-400 bg-slate-500/10" };
  }
}

// ---------------------------------------------------------------------------
// Score Ring
// ---------------------------------------------------------------------------

function ScoreRing({ score, grade }: { score: number; grade: Grade }) {
  const circumference = 2 * Math.PI * 54;
  const strokeDashoffset = circumference - (score / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width="140" height="140" className="-rotate-90">
        {/* Background ring */}
        <circle
          cx="70"
          cy="70"
          r="54"
          stroke="currentColor"
          strokeWidth="10"
          fill="none"
          className="text-slate-800/60"
        />
        {/* Score ring */}
        <circle
          cx="70"
          cy="70"
          r="54"
          stroke="currentColor"
          strokeWidth="10"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={strokeDashoffset}
          className={gradeColor(grade)}
          style={{ transition: "stroke-dashoffset 0.8s ease-in-out" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold ${gradeColor(grade)}`}>
          {score}
        </span>
        <span className="text-xs text-slate-500">/100</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Metric Card
// ---------------------------------------------------------------------------

function MetricCard({ metric }: { metric: MetricResult }) {
  const quality = dataQualityBadge(metric.data_quality);

  return (
    <div className="glass-card rounded-xl p-4 hover:border-slate-600/60 transition-all duration-200">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <h4 className="text-sm font-semibold text-slate-200 truncate">
            {metric.name}
          </h4>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${quality.color}`}>
            {quality.text}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-xs text-slate-500">w:{metric.weight}</span>
          <span className={`text-lg font-bold ${metric.metric_score >= 70 ? "text-emerald-400" : metric.metric_score >= 50 ? "text-amber-400" : "text-red-400"}`}>
            {metric.metric_score}
          </span>
        </div>
      </div>

      {/* Score bar */}
      <div className="h-1.5 rounded-full bg-slate-800/60 mb-3">
        <div
          className={`h-full rounded-full transition-all duration-500 ${scoreBarColor(metric.metric_score)}`}
          style={{ width: `${metric.metric_score}%` }}
        />
      </div>

      {/* Evidence */}
      {metric.basis.map((b, i) => (
        <div key={i} className="text-xs text-slate-400 leading-relaxed">
          <span className="text-slate-500 font-medium">{b.signal}:</span>{" "}
          {b.evidence_text}
          {b.related_urls.length > 0 && (
            <span className="ml-1">
              {b.related_urls.slice(0, 2).map((url, j) => {
                const validation = validateProofUrl(url);
                if (validation.status === "invalid") {
                  logProofRejection("MetricsView", url, validation);
                  return (
                    <span
                      key={j}
                      className="text-slate-600 ml-1"
                      title={`Invalid proof: ${validation.reason}`}
                    >
                      [invalid source {j + 1}]
                    </span>
                  );
                }
                return (
                  <a
                    key={j}
                    href={url}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="text-rose-400 hover:text-rose-300 ml-1 underline"
                  >
                    [source {j + 1}]
                  </a>
                );
              })}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Loading State
// ---------------------------------------------------------------------------

function MetricsLoading() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="h-10 w-10 rounded-full border-2 border-slate-700 border-t-rose-500 animate-spin" />
      <p className="text-sm text-slate-500">Computing reputation metrics…</p>
      <p className="text-xs text-slate-600">
        Analyzing videos, comments, and sentiment data to calculate your
        reputation index.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty State
// ---------------------------------------------------------------------------

function MetricsEmpty() {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="text-5xl">📊</div>
      <h3 className="text-lg font-semibold text-slate-300">
        Reputation Metrics
      </h3>
      <p className="text-sm text-slate-500 text-center max-w-md">
        Enter a keyword above to compute the full reputation health index
        with evidence-based scoring across all available data.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

interface MetricsViewProps {
  data: MetricsOutput | null;
  isLoading: boolean;
  error: string | null;
  hasLoaded: boolean;
}

export default function MetricsView({
  data,
  isLoading,
  error,
  hasLoaded,
}: MetricsViewProps) {
  if (isLoading) return <MetricsLoading />;
  if (!hasLoaded || !data) return <MetricsEmpty />;

  return (
    <div className="space-y-6">
      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
          ⚠️ {error}
        </div>
      )}

      {/* ─── Score Header ───────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          {/* Score ring */}
          <ScoreRing score={data.index_score} grade={data.grade} />

          {/* Info */}
          <div className="flex-1 text-center sm:text-left">
            <div className="flex items-center gap-2 justify-center sm:justify-start mb-2">
              <span className="text-2xl">{entityIcon(data.entity_type)}</span>
              <h2 className="text-xl font-bold text-white">{data.keyword}</h2>
              <span className={`rounded-full border px-3 py-0.5 text-xs font-semibold ${gradeBgColor(data.grade)} ${gradeColor(data.grade)}`}>
                {data.grade}
              </span>
            </div>

            <p className="text-sm text-slate-400 mb-2">
              {data.summary.one_liner}
            </p>

            <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
              <span className="rounded-full bg-slate-800/60 px-3 py-1 text-xs text-slate-400">
                {data.index_name}
              </span>
              <span className="rounded-full bg-slate-800/60 px-3 py-1 text-xs text-slate-400">
                {data.entity_type}
                {data.confidence !== "high" && ` (${data.confidence})`}
              </span>
              <span className="rounded-full bg-slate-800/60 px-3 py-1 text-xs text-slate-400">
                Window: {data.time_window}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Drivers ─────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Positive drivers */}
        <div className="glass-card rounded-xl p-4">
          <h3 className="text-sm font-medium text-emerald-400 uppercase tracking-wider mb-3">
            ✅ Top Positive Drivers
          </h3>
          <ul className="space-y-2">
            {data.summary.positive_drivers.map((d, i) => (
              <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                <span className="text-emerald-500 mt-0.5">▲</span>
                {d}
              </li>
            ))}
          </ul>
        </div>

        {/* Negative drivers */}
        <div className="glass-card rounded-xl p-4">
          <h3 className="text-sm font-medium text-red-400 uppercase tracking-wider mb-3">
            ⚠️ Top Negative Drivers
          </h3>
          <ul className="space-y-2">
            {data.summary.negative_drivers.map((d, i) => (
              <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
                <span className="text-red-500 mt-0.5">▼</span>
                {d}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* ─── What changed ─────────────────────────────────────── */}
      {data.summary.what_changed_recently && (
        <div className="glass-card rounded-xl p-4">
          <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-2">
            📈 What Changed Recently
          </h3>
          <p className="text-sm text-slate-300">
            {data.summary.what_changed_recently}
          </p>
        </div>
      )}

      {/* ─── Metrics Breakdown ───────────────────────────────── */}
      <div>
        <h3 className="text-sm font-medium text-slate-400 uppercase tracking-wider mb-4">
          📊 Metric Breakdown ({data.metrics.length} metrics)
        </h3>
        <div className="grid gap-3">
          {data.metrics.map((m) => (
            <MetricCard key={m.name} metric={m} />
          ))}
        </div>
      </div>

      {/* ─── Recommendation ──────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-6">
        <h3 className="text-sm font-medium text-rose-400 uppercase tracking-wider mb-3">
          💡 {data.recommendation.title}
        </h3>
        <ul className="space-y-2">
          {data.recommendation.actions.map((action, i) => (
            <li key={i} className="text-sm text-slate-300 flex items-start gap-2">
              <span className="text-rose-400 mt-0.5 flex-shrink-0">→</span>
              {action}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
