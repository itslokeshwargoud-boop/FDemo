import type { ReactNode } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface ROMetricCardProps {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "stable";
  trendValue?: string;
  icon?: ReactNode;
}

const TREND_CONFIG = {
  up: { icon: TrendingUp, color: "text-emerald-400", symbol: "↑" },
  down: { icon: TrendingDown, color: "text-red-400", symbol: "↓" },
  stable: { icon: Minus, color: "text-slate-400", symbol: "→" },
} as const;

export default function ROMetricCard({
  label,
  value,
  trend,
  trendValue,
  icon,
}: ROMetricCardProps) {
  const trendCfg = trend ? TREND_CONFIG[trend] : null;

  return (
    <div className="rounded-xl border border-slate-800/60 bg-slate-900/50 p-4 backdrop-blur">
      <div className="mb-2 flex items-center gap-2">
        {icon && <span className="text-slate-500">{icon}</span>}
        <span className="text-xs font-medium text-slate-500">{label}</span>
      </div>

      <div className="flex items-end justify-between">
        <span className="text-2xl font-bold text-white">{value}</span>

        {trendCfg && (
          <span
            className={`flex items-center gap-1 text-xs font-medium ${trendCfg.color}`}
          >
            {trendCfg.symbol}
            {trendValue && <span>{trendValue}</span>}
          </span>
        )}
      </div>
    </div>
  );
}
