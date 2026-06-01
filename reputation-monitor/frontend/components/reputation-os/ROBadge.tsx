import type { ReactNode } from "react";

type BadgeVariant =
  | "critical"
  | "high"
  | "medium"
  | "low"
  | "positive"
  | "negative"
  | "neutral";

interface ROBadgeProps {
  variant: BadgeVariant;
  children: ReactNode;
  pulse?: boolean;
}

const VARIANT_CLASSES: Record<BadgeVariant, string> = {
  critical: "bg-red-500/15 text-red-400",
  high: "bg-orange-500/15 text-orange-400",
  medium: "bg-yellow-500/15 text-yellow-400",
  low: "bg-blue-500/15 text-blue-400",
  positive: "bg-emerald-500/15 text-emerald-400",
  negative: "bg-red-500/15 text-red-400",
  neutral: "bg-slate-500/15 text-slate-400",
};

export default function ROBadge({ variant, children, pulse }: ROBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${VARIANT_CLASSES[variant]} ${
        pulse ? "animate-pulse-red" : ""
      }`}
    >
      {pulse && (
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-current opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-current" />
        </span>
      )}
      {children}
    </span>
  );
}
