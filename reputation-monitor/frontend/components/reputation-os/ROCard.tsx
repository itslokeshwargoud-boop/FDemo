import type { ReactNode } from "react";

interface ROCardProps {
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  glowing?: boolean;
}

export default function ROCard({
  title,
  subtitle,
  icon,
  children,
  className = "",
  glowing = false,
}: ROCardProps) {
  return (
    <div
      className={`rounded-xl border bg-slate-900/50 p-6 backdrop-blur ${
        glowing
          ? "border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.15)]"
          : "border-slate-800/60"
      } ${className}`}
    >
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        {icon && <span className="text-slate-400">{icon}</span>}
        <div>
          <h3 className="text-sm font-semibold text-white">{title}</h3>
          {subtitle && (
            <p className="text-xs text-slate-500">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Body */}
      {children}
    </div>
  );
}
