/**
 * MBI – Movie Buzz Indexer
 * Core logic for extracting movie names from video titles,
 * grouping by movie, aggregating metrics, and ranking.
 *
 * Pure functions — no I/O, fully testable.
 */

import type { YouTubeVideo } from "@/pages/api/youtube";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MbiChannel {
  name:       string;
  views:      number;
  videoCount: number;
}

export interface MbiMovie {
  name:             string;
  totalViews:       number;
  videoCount:       number;
  totalLikes:       number;
  totalComments:    number;
  engagementScore:  number;   // totalViews / videoCount  (avg views per video)
  engagementRate:   number;   // (likes / views) * 100
  topChannels:      MbiChannel[];
  thumbnailUrl:     string;   // from highest-view video
  latestVideoAt:    string;   // ISO — most recent video
  videos:           string[]; // deduped videoIds
}

export interface MbiResult {
  timeline:            { startDate: string; endDate: string };
  movies:              MbiMovie[];
  winner:              MbiMovie | null;
  totalVideosAnalyzed: number;
  generatedAt:         string;
}

// ---------------------------------------------------------------------------
// Movie name extraction
// ---------------------------------------------------------------------------

/**
 * Suffixes/noise that should be stripped AFTER the movie name in a title.
 * Applied in order; each strip is greedy from the match point to end-of-string.
 *
 * Examples:
 *   "Pushpa 2 Official Trailer HD"  → "Pushpa 2"
 *   "OG (Original) Full Song | Pawan"  → "OG"
 *   "Kalki 2898 AD - 4K Teaser"  → "Kalki 2898 AD"
 */
const SUFFIX_PATTERNS: RegExp[] = [
  // Pipe / vertical bar separator and everything after
  /\s*[|｜]\s*.+$/,
  // Bracket / paren openers and everything after
  /\s*[\[({]\s*.+$/,
  // Dash/em-dash followed by typical noise words
  /\s*[-–—]\s*(official|full|hd|4k|1080|720|trailer|teaser|song|lyric|audio|video|making|bts|review|reaction|promo|clip|scene|interview|behind|ft\b|feat\b).*/i,
  // Common content type keywords and everything after (not preceded by a digit — avoids clipping "2 Trailer" → "2")
  /(?<!\d)\s+(?:official\s+)?(?:full\s+)?(?:movie\s+)?(?:trailer|teaser|promo|lyric(?:al)?|video\s+song|audio\s+song|audio|song|making\s+of|behind\s+the\s+scenes|bts|interview|review|reaction|deleted\s+scene|sneak\s+peek|first\s+look|clip|scene|announcement)\b.*/i,
  // Resolution / format tags
  /\s+(?:hd|4k|uhd|1080p|720p|full\s+hd)\s*$/i,
  // "ft. / feat. Artist" at end
  /\s+ft\.?\s+.+$/i,
  /\s+feat\.?\s+.+$/i,
  // Collapse multiple spaces
  /\s{2,}/g,
];

/**
 * Normalise a raw video title into a candidate movie name.
 * Returns null if the result is too short to be useful.
 */
export function extractMovieName(rawTitle: string): string | null {
  let t = rawTitle.trim();

  for (const rx of SUFFIX_PATTERNS) {
    t = t.replace(rx, "").trim();
  }

  // Remove leading/trailing punctuation
  t = t.replace(/^[\s\-–—:,."']+|[\s\-–—:,."']+$/g, "").trim();

  // Must be at least 3 chars
  if (t.length < 3) return null;
  return t;
}

/**
 * Canonicalise a movie name for grouping.
 * Lowercases, strips non-word chars, normalises spaces.
 */
export function canonicalise(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true when two canonical names refer to the same movie.
 *
 * Rules (conservative — prefer false negatives over false positives):
 *  1. Exact match always → true
 *  2. One is a space-separated prefix of the other AND the shorter one is
 *     at least 4 chars — handles "pushpa" vs "pushpa 2" but not "og" vs "ogaanabey"
 *
 * We deliberately do NOT merge on token overlap because that causes
 * unrelated films with common words (e.g. "the") to be wrongly grouped.
 */
function isSameMovie(a: string, b: string): boolean {
  if (a === b) return true;
  const shorter = a.length <= b.length ? a : b;
  const longer  = a.length <= b.length ? b : a;
  // Prefix match: shorter must be ≥ 4 chars AND followed by a space in longer
  if (shorter.length >= 4 && longer.startsWith(shorter + " ")) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Grouping + aggregation
// ---------------------------------------------------------------------------

interface RawGroup {
  canonical:   string;
  displayName: string;          // most common raw name in the group
  videos:      YouTubeVideo[];
}

/**
 * Group videos by extracted movie name.
 * Deduplicates by videoId. Merges obvious title variants (prefix match).
 */
export function groupVideosByMovie(videos: YouTubeVideo[]): RawGroup[] {
  // Step 1: deduplicate by videoId
  const seen   = new Set<string>();
  const unique = videos.filter((v) => {
    if (seen.has(v.id)) return false;
    seen.add(v.id);
    return true;
  });

  // Step 2: extract name → group
  const groupMap = new Map<string, { displayNames: string[]; videos: YouTubeVideo[] }>();

  for (const video of unique) {
    const raw = extractMovieName(video.title);
    if (!raw) continue;
    const key = canonicalise(raw);

    // Find an existing group this belongs to (fuzzy merge by prefix)
    let matched: string | null = null;
    for (const existing of groupMap.keys()) {
      if (isSameMovie(key, existing)) {
        matched = existing;
        break;
      }
    }

    const target = matched ?? key;
    if (!groupMap.has(target)) {
      groupMap.set(target, { displayNames: [], videos: [] });
    }
    const g = groupMap.get(target)!;
    g.displayNames.push(raw);
    g.videos.push(video);
  }

  // Step 3: pick best display name (most common raw form in the group)
  return Array.from(groupMap.entries()).map(([canonical, g]) => {
    const freq = new Map<string, number>();
    for (const n of g.displayNames) {
      freq.set(n, (freq.get(n) ?? 0) + 1);
    }
    const displayName = [...freq.entries()].sort((a, b) => b[1] - a[1])[0][0];
    return { canonical, displayName, videos: g.videos };
  });
}

/**
 * Convert a raw group into a fully aggregated MbiMovie.
 */
export function aggregateMovie(group: RawGroup): MbiMovie {
  const { displayName, videos } = group;

  const totalViews    = videos.reduce((s, v) => s + v.viewCount,    0);
  const totalLikes    = videos.reduce((s, v) => s + v.likeCount,    0);
  const totalComments = videos.reduce((s, v) => s + v.commentCount, 0);
  const videoCount    = videos.length;

  // Channel aggregation
  const channelMap = new Map<string, { views: number; count: number }>();
  for (const v of videos) {
    const ch = channelMap.get(v.channelTitle) ?? { views: 0, count: 0 };
    ch.views += v.viewCount;
    ch.count++;
    channelMap.set(v.channelTitle, ch);
  }
  const topChannels: MbiChannel[] = [...channelMap.entries()]
    .map(([name, s]) => ({ name, views: s.views, videoCount: s.count }))
    .sort((a, b) => b.views - a.views)
    .slice(0, 5);

  // Best thumbnail = video with most views
  const topVideo = [...videos].sort((a, b) => b.viewCount - a.viewCount)[0];

  // Latest video date
  const latestVideoAt = videos
    .map((v) => v.publishedAt)
    .sort()
    .reverse()[0] ?? "";

  return {
    name: displayName,
    totalViews,
    videoCount,
    totalLikes,
    totalComments,
    engagementScore: videoCount > 0 ? Math.round(totalViews / videoCount) : 0,
    engagementRate:  totalViews > 0
      ? parseFloat(((totalLikes / totalViews) * 100).toFixed(2))
      : 0,
    topChannels,
    thumbnailUrl: topVideo?.thumbnailUrl ?? "",
    latestVideoAt,
    videos: videos.map((v) => v.id),
  };
}

/**
 * Full pipeline: videos → MbiResult.
 *
 * Noise filter: require ≥ 2 videos per movie unless fewer than 5 groups total.
 * This suppresses one-off misattributions without hiding small windows.
 */
export function buildMbiResult(
  videos:    YouTubeVideo[],
  startDate: string,
  endDate:   string,
): MbiResult {
  const groups = groupVideosByMovie(videos);
  const movies = groups
    .map(aggregateMovie)
    .filter((m) => groups.length < 5 || m.videoCount >= 2)
    .sort((a, b) => b.totalViews - a.totalViews);

  return {
    timeline:            { startDate, endDate },
    movies,
    winner:              movies[0] ?? null,
    totalVideosAnalyzed: videos.length,
    generatedAt:         new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Formatting helpers (used in UI and API response)
// ---------------------------------------------------------------------------

export function formatViews(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000)     return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)         return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}
