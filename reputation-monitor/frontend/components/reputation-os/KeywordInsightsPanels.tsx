/**
 * KeywordInsightsPanels — KPI cards, trend chart, and channel
 * breakdown sourced from the keyword-based YouTube search.
 *
 * No proof links are rendered (they are only allowed in Talk and
 * Overview channel contexts).
 */

import { useId } from "react";
import {
  Area,
  AreaChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  MetricsKPI,
  ChannelBreakdown,
  TrendPoint,
} from "@/lib/realApi";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHART_COLORS = [
  "#EF4444",
  "#F97316",
  "#FBBF24",
  "#10B981",
  "#3B82F6",
  "#8B5CF6",
  "#EC4899",
  "#6366F1",
];

const DARK_TOOLTIP_STYLE = {
  borderRadius: 12,
  border: "1px solid #334155",
  backgroundColor: "#0f172a",
  fontSize: 12,
  color: "#e2e8f0",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function KPICard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/50 p-4 backdrop-blur">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-lg">{icon}</span>
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
          {label}
        </p>
      </div>
      <p className="text-2xl font-black text-slate-100 tabular-nums">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface KeywordInsightsPanelsProps {
  kpis: MetricsKPI;
  trend: TrendPoint[];
  channelBreakdown: ChannelBreakdown[];
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function KeywordInsightsPanels({
  kpis,
  trend,
  channelBreakdown,
}: KeywordInsightsPanelsProps) {
  const uid = useId();
  const viewGradId = `feedViewGrad-${uid}`;
  const likeGradId = `feedLikeGrad-${uid}`;

  const channelPieData = channelBreakdown.slice(0, 6).map((ch, i) => ({
    name: ch.channel,
    value: ch.totalViews,
    color: CHART_COLORS[i % CHART_COLORS.length],
  }));

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <KPICard label="Videos Found" value={kpis.totalVideos} icon="📹" />
        <KPICard label="Total Views" value={formatNumber(kpis.totalViews)} icon="👁" />
        <KPICard label="Total Likes" value={formatNumber(kpis.totalLikes)} icon="👍" />
        <KPICard label="Total Comments" value={formatNumber(kpis.totalComments)} icon="💬" />
        <KPICard label="Avg Views" value={formatNumber(kpis.avgViewsPerVideo)} icon="📊" />
        <KPICard label="Engagement" value={`${kpis.engagementRate}%`} icon="🔥" />
      </div>

      {/* Charts row — 2:1 split */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        {/* Trend Chart */}
        <div className="xl:col-span-2 rounded-xl border border-slate-800/60 bg-slate-900/50 p-5 backdrop-blur">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-4">
            📈 Trend — Views &amp; Likes by Month
          </h3>
          {trend.length > 0 ? (
            <div className="h-[240px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trend}
                  margin={{ top: 10, right: 10, left: -10, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id={viewGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id={likeGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10B981" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#64748b" }}
                  />
                  <Tooltip contentStyle={DARK_TOOLTIP_STYLE} />
                  <Area
                    type="monotone"
                    dataKey="views"
                    stroke="#3B82F6"
                    strokeWidth={2}
                    fill={`url(#${viewGradId})`}
                    name="Views"
                  />
                  <Area
                    type="monotone"
                    dataKey="likes"
                    stroke="#10B981"
                    strokeWidth={2}
                    fill={`url(#${likeGradId})`}
                    name="Likes"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[240px] text-sm text-slate-500">
              No trend data available
            </div>
          )}
        </div>

        {/* Channel Breakdown Donut */}
        <div className="rounded-xl border border-slate-800/60 bg-slate-900/50 p-5 backdrop-blur">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-4">
            📺 Channel Breakdown
          </h3>
          {channelPieData.length > 0 ? (
            <div className="flex flex-col items-center gap-4">
              <div className="h-[160px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Tooltip contentStyle={DARK_TOOLTIP_STYLE} />
                    <Pie
                      data={channelPieData}
                      dataKey="value"
                      innerRadius={40}
                      outerRadius={60}
                      paddingAngle={3}
                      strokeWidth={0}
                    >
                      {channelPieData.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="space-y-1.5 w-full">
                {channelPieData.map((item) => (
                  <div
                    key={item.name}
                    className="flex items-center gap-2 text-xs"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: item.color }}
                    />
                    <span className="text-slate-400 truncate flex-1">
                      {item.name}
                    </span>
                    <span className="font-semibold tabular-nums text-slate-300">
                      {formatNumber(item.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-[240px] text-sm text-slate-500">
              No channel data
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
