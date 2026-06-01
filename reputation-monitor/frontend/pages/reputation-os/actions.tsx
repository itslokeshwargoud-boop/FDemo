import { useMemo, useState } from "react";
import {
  Lightbulb,
  Filter,
  BarChart3,
  ShieldCheck,
} from "lucide-react";
import { TenantProvider } from "@/contexts/TenantContext";
import {
  useReputationOs,
  type ActionRecommendation,
} from "@/hooks/useReputationOs";
import ROLayout from "@/components/reputation-os/ROLayout";
import ROCard from "@/components/reputation-os/ROCard";
import ROBadge from "@/components/reputation-os/ROBadge";


// ---------------------------------------------------------------------------
// Types & constants
// ---------------------------------------------------------------------------

type Priority = ActionRecommendation["priority"];

const PRIORITY_OPTIONS: Priority[] = ["critical", "high", "medium", "low"];

const PRIORITY_BORDER: Record<Priority, string> = {
  critical: "border-b-red-500",
  high: "border-b-orange-500",
  medium: "border-b-yellow-500",
  low: "border-b-blue-500",
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

function ActionsContent() {
  const { actions } = useReputationOs();

  const [filter, setFilter] = useState<"all" | Priority>("all");

  const allActions = useMemo(
    () => actions.data ?? [],
    [actions.data],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return allActions;
    return allActions.filter((a) => a.priority === filter);
  }, [allActions, filter]);

  const countByPriority = useMemo(() => {
    const counts: Record<Priority, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
    };
    allActions.forEach((a) => {
      counts[a.priority]++;
    });
    return counts;
  }, [allActions]);

  const topCategory = useMemo(() => {
    const map = new Map<string, number>();
    allActions.forEach((a) =>
      map.set(a.category, (map.get(a.category) ?? 0) + 1),
    );
    let top = "";
    let max = 0;
    map.forEach((v, k) => {
      if (v > max) {
        max = v;
        top = k;
      }
    });
    return top || "N/A";
  }, [allActions]);

  if (actions.isError) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <p className="text-red-400">Failed to load action recommendations.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold text-white">Action Intelligence</h1>
        <ROBadge variant="neutral">{allActions.length} actions</ROBadge>
      </div>

      {/* Filter tabs */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-800/60 bg-slate-900/50 px-4 py-3 backdrop-blur">
        <Filter size={14} className="text-slate-500" />
        {(["all", ...PRIORITY_OPTIONS] as const).map((p) => (
          <button
            key={p}
            onClick={() => setFilter(p)}
            className={`rounded-full px-3 py-1 text-xs font-medium capitalize transition ${
              filter === p
                ? "bg-slate-700 text-white"
                : "text-slate-400 hover:text-white"
            }`}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Main layout: action list + sidebar */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Action cards */}
        <div className="space-y-4 lg:col-span-2">
          {actions.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <SkeletonBlock key={i} className="h-28 w-full" />
            ))
          ) : filtered.length === 0 ? (
            <div className="rounded-xl border border-slate-800/60 bg-slate-900/50 p-8 text-center backdrop-blur">
              <p className="text-sm text-slate-500">
                No actions match the selected filter.
              </p>
            </div>
          ) : (
            filtered.map((action) => (
              <div
                key={action.id}
                className={`rounded-xl border border-slate-800/60 border-b-2 ${
                  PRIORITY_BORDER[action.priority]
                } bg-slate-900/50 p-5 backdrop-blur transition hover:bg-slate-900/70`}
              >
                <div className="flex items-start gap-4">
                  {/* Left: icon + priority */}
                  <div className="flex flex-col items-center gap-2 pt-0.5">
                    <span className="text-2xl">{action.icon}</span>
                    <ROBadge
                      variant={action.priority}
                      pulse={action.priority === "critical"}
                    >
                      {action.priority}
                    </ROBadge>
                  </div>

                  {/* Center: title + description */}
                  <div className="min-w-0 flex-1">
                    <h3 className="text-sm font-bold text-white">
                      {action.title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">
                      {action.description}
                    </p>
                    <span className="mt-2 inline-block rounded-full bg-slate-800 px-2.5 py-0.5 text-[10px] font-medium text-slate-400">
                      {action.category}
                    </span>
                  </div>

                  {/* Right: expected impact */}
                  <div className="hidden shrink-0 text-right sm:block">
                    <p className="text-[10px] uppercase text-slate-500">
                      Expected Impact
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-emerald-400">
                      {action.expected_impact}
                    </p>
                  </div>
                </div>

                {/* Mobile: expected impact */}
                <div className="mt-3 sm:hidden">
                  <p className="text-[10px] uppercase text-slate-500">
                    Expected Impact
                  </p>
                  <p className="text-xs font-medium text-emerald-400">
                    {action.expected_impact}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Sidebar: Action Summary */}
        <div className="space-y-6">
          <ROCard title="Action Summary" icon={<BarChart3 size={18} />}>
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase text-slate-500">
                Count by Priority
              </p>
              {PRIORITY_OPTIONS.map((p) => (
                <div key={p} className="flex items-center justify-between">
                  <ROBadge variant={p}>{p}</ROBadge>
                  <span className="text-sm font-semibold text-white">
                    {countByPriority[p]}
                  </span>
                </div>
              ))}
            </div>

            <div className="mt-5 border-t border-slate-800 pt-4">
              <p className="text-xs text-slate-500">Top Category</p>
              <p className="text-sm font-semibold text-white">{topCategory}</p>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <ShieldCheck size={14} className="text-emerald-400" />
              <ROBadge variant="positive">AI Confidence: High</ROBadge>
            </div>
          </ROCard>

          <ROCard title="Quick Tips" icon={<Lightbulb size={18} />}>
            <ul className="space-y-2 text-xs text-slate-400">
              <li className="flex gap-2">
                <span className="text-emerald-400">•</span>
                Address critical actions first for maximum impact
              </li>
              <li className="flex gap-2">
                <span className="text-yellow-400">•</span>
                High-priority items should be resolved within 24h
              </li>
              <li className="flex gap-2">
                <span className="text-blue-400">•</span>
                Review medium/low actions during weekly planning
              </li>
            </ul>
          </ROCard>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Exported page
// ---------------------------------------------------------------------------

export default function ActionsPage() {
  return (
    <TenantProvider>
      <ROLayout activeModule="actions">
        <ActionsContent />
      </ROLayout>
    </TenantProvider>
  );
}
