import { useEffect, useState } from "react";

interface ROScoreGaugeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  label?: string;
  riskLevel?: string;
}

const SIZE_MAP = {
  sm: { outer: 80, stroke: 6, fontSize: 18, subFont: 9 },
  md: { outer: 120, stroke: 8, fontSize: 28, subFont: 11 },
  lg: { outer: 160, stroke: 10, fontSize: 36, subFont: 13 },
} as const;

function scoreColor(score: number): string {
  if (score <= 30) return "#ef4444";
  if (score <= 50) return "#f97316";
  if (score <= 70) return "#eab308";
  return "#22c55e";
}

export default function ROScoreGauge({
  score,
  size = "md",
  label,
  riskLevel,
}: ROScoreGaugeProps) {
  const [animatedScore, setAnimatedScore] = useState(0);
  const { outer, stroke, fontSize, subFont } = SIZE_MAP[size];
  const radius = (outer - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedScore = Math.min(100, Math.max(0, score));

  useEffect(() => {
    const timeout = setTimeout(() => setAnimatedScore(clampedScore), 50);
    return () => clearTimeout(timeout);
  }, [clampedScore]);

  const offset = circumference - (animatedScore / 100) * circumference;
  const color = scoreColor(clampedScore);

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative" style={{ width: outer, height: outer }}>
      <svg
        width={outer}
        height={outer}
        className="-rotate-90"
        aria-label={`Score: ${clampedScore}`}
      >
        {/* Background track */}
        <circle
          cx={outer / 2}
          cy={outer / 2}
          r={radius}
          fill="none"
          stroke="#1e293b"
          strokeWidth={stroke}
        />
        {/* Score arc */}
        <circle
          cx={outer / 2}
          cy={outer / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease-out" }}
        />
      </svg>

      {/* Center text overlay */}
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
      >
        <span
          className="font-bold text-white"
          style={{ fontSize, lineHeight: 1 }}
        >
          {clampedScore}
        </span>
        {riskLevel && (
          <span
            className="mt-0.5 font-medium uppercase tracking-wider"
            style={{ fontSize: subFont, color }}
          >
            {riskLevel}
          </span>
        )}
      </div>
      </div>

      {label && (
        <span className="text-xs text-slate-500">{label}</span>
      )}
    </div>
  );
}
