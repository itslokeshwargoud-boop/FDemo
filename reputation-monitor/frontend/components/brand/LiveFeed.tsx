/**
 * LiveFeed — displays real YouTube videos with verifiable proof URLs.
 * Every item shown here includes an external link to the original content.
 * YouTube-only — no Twitter/Instagram sections.
 */

import type { YouTubeVideo } from "../../pages/api/youtube";

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function timeAgo(iso: string): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 1) return "< 1h ago";
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return `${months}mo ago`;
}

// ---------------------------------------------------------------------------
// YouTube card
// ---------------------------------------------------------------------------

function YouTubeCard({ video }: { video: YouTubeVideo }) {
  return (
    <a
      href={video.proofUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex gap-3 p-3 rounded-xl border border-slate-800/60 bg-[#0F172A]/60 hover:border-red-500/30 transition-all duration-150 group"
    >
      {/* Thumbnail */}
      {video.thumbnailUrl ? (
        <img
          src={video.thumbnailUrl}
          alt={video.title}
          className="w-20 h-14 object-cover rounded-lg shrink-0 bg-slate-800"
        />
      ) : (
        <div className="w-20 h-14 rounded-lg shrink-0 bg-slate-800 flex items-center justify-center">
          <span className="text-red-400 text-xl">▶</span>
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-slate-200 leading-snug line-clamp-2 group-hover:text-red-400 transition-colors">
          {video.title}
        </p>
        <p className="text-[11px] text-slate-500 mt-1">{video.channelTitle}</p>
        <div className="flex items-center gap-3 mt-1.5">
          <span className="text-[11px] text-slate-400">👁 {formatNumber(video.viewCount)}</span>
          <span className="text-[11px] text-slate-400">👍 {formatNumber(video.likeCount)}</span>
          <span className="text-[11px] text-slate-400">💬 {formatNumber(video.commentCount)}</span>
          <span className="text-[11px] text-slate-600">{timeAgo(video.publishedAt)}</span>
        </div>
      </div>

      {/* External link icon */}
      <div className="shrink-0 self-start opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
        <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
        </svg>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// LiveFeed panel — YouTube only
// ---------------------------------------------------------------------------

interface LiveFeedProps {
  videos: YouTubeVideo[];
  clientName: string;
  youtubeStatus: "ok" | "error" | "partial_data";
  youtubeReason?: string;
}

export default function LiveFeed({
  videos,
  clientName,
  youtubeStatus,
  youtubeReason,
}: LiveFeedProps) {
  return (
    <div className="rounded-xl border border-slate-800/60 bg-[#0F172A]/40 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 24 24">
            <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
          </svg>
          <h3 className="text-sm font-bold text-slate-200">YouTube — {clientName}</h3>
        </div>

        {youtubeStatus === "ok" && videos.length > 0 && (
          <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-400 bg-emerald-900/30 border border-emerald-700/40 rounded-full px-2 py-0.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
            Live · {videos.length} videos
          </span>
        )}
        {(youtubeStatus === "error" || videos.length === 0) && (
          <span className="text-[11px] font-semibold text-orange-400 bg-orange-900/20 border border-orange-700/30 rounded-full px-2 py-0.5">
            {youtubeStatus === "error" ? "API Error" : "No results"}
          </span>
        )}
      </div>

      {youtubeStatus === "error" ? (
        <div className="text-center py-8">
          <p className="text-xs text-orange-400 font-medium">YouTube API unavailable</p>
          {youtubeReason && (
            <p className="text-[11px] text-slate-500 mt-1">{youtubeReason}</p>
          )}
        </div>
      ) : videos.length === 0 ? (
        <div className="text-center py-8">
          <p className="text-xs text-slate-500">No YouTube videos found for &quot;{clientName}&quot;</p>
        </div>
      ) : (
        <div className="space-y-2">
          {videos.map((video) => (
            <YouTubeCard key={video.id} video={video} />
          ))}
        </div>
      )}
    </div>
  );
}
