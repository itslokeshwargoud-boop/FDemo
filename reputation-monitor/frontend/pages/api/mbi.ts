/**
 * GET /api/mbi
 *
 * Movie Buzz Indexer — theatre-release timeline intelligence engine.
 *
 * This API is COMPLETELY INDEPENDENT of the keyword system used by
 * Feed, Talk, Alerts, and other dashboard features.
 *
 * Query params:
 *   startDate  (required) — YYYY-MM-DD  theatrical release window start
 *   endDate    (required) — YYYY-MM-DD  theatrical release window end
 *   region     (optional) — ISO 3166-1 alpha-2, default "IN" (India)
 *
 * Flow:
 *   1. Fetch movies theatrically released in [startDate, endDate] from TMDB
 *   2. For each movie, search YouTube for trailers / songs / buzz content
 *      ↳ Batched sequentially (not Promise.all) to stay within YouTube quota
 *   3. Aggregate views, likes, comments, engagement per movie
 *   4. Rank and declare winner
 *   5. Compute trend vs previous equal-length period
 *
 * Quota management:
 *   YouTube Data API v3 costs 100 units per search.list call.
 *   Default daily limit: 10,000 units = 100 searches/day.
 *   We batch movie searches in groups of BATCH_SIZE with a short delay
 *   between batches so a 20-movie window uses ~20 units rather than
 *   hammering the quota in one parallel burst.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { fetchYouTubeVideos }                   from "@/pages/api/youtube";
import { buildMbiResult, type MbiResult }        from "@/lib/mbi";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface MbiApiResponse {
  success:  boolean;
  data?:    MbiResult;
  /** Trend: analysis of the PREVIOUS equal-length period for comparison. */
  trend?: {
    previousWinner:      string | null;
    previousWinnerViews: number;
    winnerChanged:       boolean;
    viewsDelta:          number;    // current winner views − previous winner views
    viewsDeltaPct:       number;    // % change
  };
  /** Movies discovered from TMDB (or fallback) for the selected window. */
  moviesDiscovered?: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// TMDB — theatrical release fetch
// ---------------------------------------------------------------------------

interface TmdbMovie {
  id:                number;
  title:             string;
  original_language: string;
  release_date:      string;   // YYYY-MM-DD
  popularity:        number;
  poster_path:       string | null;
}

/**
 * Fetch movies with a theatrical release date between startDate and endDate.
 * Uses TMDB /discover/movie with release_date filters.
 *
 * Falls back to an empty list when TMDB_API_KEY is absent; the caller then
 * runs a broad market search instead.
 *
 * Cap: top 12 by popularity (reduced from 20) to keep YouTube quota usage
 * within the free tier (12 search calls + 12 trend calls = 24 total).
 */
async function fetchTheatricalReleases(
  startDate: string,
  endDate:   string,
  region:    string = "IN",
): Promise<string[]> {
  const tmdbKey = process.env.TMDB_API_KEY;

  if (tmdbKey) {
    try {
      const url = new URL("https://api.themoviedb.org/3/discover/movie");
      url.searchParams.set("api_key",                   tmdbKey);
      url.searchParams.set("region",                    region);
      url.searchParams.set("release_date.gte",          startDate);
      url.searchParams.set("release_date.lte",          endDate);
      url.searchParams.set("sort_by",                   "popularity.desc");
      url.searchParams.set("with_release_type",         "3|2"); // Theatrical + Limited
      url.searchParams.set("vote_count.gte",            "5");
      url.searchParams.set("page",                      "1");

      const controller = new AbortController();
      const timeout    = setTimeout(() => controller.abort(), 10_000);
      const res        = await fetch(url.toString(), { signal: controller.signal });
      clearTimeout(timeout);

      if (res.ok) {
        const data = await res.json() as { results?: TmdbMovie[] };
        const movies = (data.results ?? [])
          .filter((m) => m.title && m.release_date)
          .slice(0, 12)   // cap at 12 — keeps YouTube quota reasonable
          .map((m) => m.title);
        if (movies.length > 0) return movies;
      }
    } catch (err) {
      console.warn("[MBI] TMDB fetch failed, using fallback:", err instanceof Error ? err.message : err);
    }
  }

  console.warn("[MBI] No TMDB_API_KEY set — using YouTube-only market search");
  return [];
}

// ---------------------------------------------------------------------------
// YouTube buzz collection — sequential batching to respect quota
// ---------------------------------------------------------------------------

/** Small delay between sequential YouTube search calls (ms) */
const INTER_REQUEST_DELAY_MS = 200;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

/**
 * Build a YouTube search query for a movie.
 * Intentionally broad to capture trailers, songs, reviews, reactions.
 * Avoids quoting the title (quoted exact match misses alternate-language titles).
 */
function movieBuzzQuery(movieTitle: string): string {
  // Strip any characters that break URL encoding or query parsing
  const safe = movieTitle.replace(/["'\\]/g, "").trim();
  return `${safe} trailer OR teaser OR song OR review OR reaction`;
}

/**
 * Fetch YouTube buzz for a list of movies SEQUENTIALLY (not in parallel).
 * Returns a flat array of all videos found.
 *
 * Sequential fetching avoids bursting 10–20 API calls simultaneously which
 * trips YouTube's per-second rate limiter and returns empty pages.
 */
async function fetchMoviesBuzzSequential(
  movieTitles: string[],
  startDate:   string,
  endDate:     string,
): Promise<Awaited<ReturnType<typeof fetchYouTubeVideos>>["videos"]> {
  const allVideos: Awaited<ReturnType<typeof fetchYouTubeVideos>>["videos"] = [];

  for (let i = 0; i < movieTitles.length; i++) {
    const title = movieTitles[i];
    const query = movieBuzzQuery(title);

    const result = await fetchYouTubeVideos(query, { startDate, endDate });
    allVideos.push(...result.videos);

    // Brief pause between requests — keeps well within quota rate limits
    if (i < movieTitles.length - 1) {
      await sleep(INTER_REQUEST_DELAY_MS);
    }
  }

  return allVideos;
}

/**
 * Broad market-level YouTube search when no TMDB movie list is available.
 * Runs TWO searches (Telugu market + Hindi market) sequentially.
 */
async function fetchMarketBuzz(
  startDate: string,
  endDate:   string,
  region:    string,
): Promise<Awaited<ReturnType<typeof fetchYouTubeVideos>>["videos"]> {
  const teluguQuery = region === "IN"
    ? "Telugu movie trailer OR teaser OR song 2025 OR 2026"
    : "movie trailer OR teaser box office";
  const hindiQuery  = "Bollywood movie trailer OR teaser OR song 2025 OR 2026";

  const r1 = await fetchYouTubeVideos(teluguQuery, { startDate, endDate });
  await sleep(INTER_REQUEST_DELAY_MS);
  const r2 = await fetchYouTubeVideos(hindiQuery,  { startDate, endDate });

  return [...r1.videos, ...r2.videos];
}

// ---------------------------------------------------------------------------
// Period shift helper
// ---------------------------------------------------------------------------

function shiftPeriod(
  startDate: string,
  endDate:   string,
): { prevStart: string; prevEnd: string } {
  const s      = new Date(startDate);
  const e      = new Date(endDate);
  const spanMs = e.getTime() - s.getTime() + 86_400_000; // inclusive
  const prevEnd   = new Date(s.getTime() - 86_400_000);
  const prevStart = new Date(prevEnd.getTime() - spanMs + 86_400_000);
  return {
    prevStart: prevStart.toISOString().slice(0, 10),
    prevEnd:   prevEnd.toISOString().slice(0, 10),
  };
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<MbiApiResponse>,
) {
  res.setHeader("Cache-Control", "no-store, must-revalidate");

  if (req.method !== "GET") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // ── Param validation ──────────────────────────────────────────────────────
  const rawStart = typeof req.query.startDate === "string" ? req.query.startDate.trim() : "";
  const rawEnd   = typeof req.query.endDate   === "string" ? req.query.endDate.trim()   : "";
  const region   = typeof req.query.region    === "string" ? req.query.region.trim().toUpperCase() : "IN";

  if (!DATE_RX.test(rawStart) || !DATE_RX.test(rawEnd)) {
    return res.status(400).json({
      success: false,
      error:   "startDate and endDate are required (YYYY-MM-DD format)",
    });
  }
  if (rawStart > rawEnd) {
    return res.status(400).json({
      success: false,
      error:   "startDate must be before or equal to endDate",
    });
  }

  try {
    // ── Step 1: Discover theatrical releases in the window ──────────────────
    const movieTitles = await fetchTheatricalReleases(rawStart, rawEnd, region);

    // ── Step 2: Collect YouTube buzz (sequential — quota safe) ──────────────
    let allVideos: Awaited<ReturnType<typeof fetchYouTubeVideos>>["videos"] = [];

    if (movieTitles.length > 0) {
      allVideos = await fetchMoviesBuzzSequential(movieTitles, rawStart, rawEnd);
    } else {
      // Fallback: broad market search (no TMDB key)
      allVideos = await fetchMarketBuzz(rawStart, rawEnd, region);
    }

    if (allVideos.length === 0) {
      return res.status(200).json({
        success:          true,
        data: {
          timeline:            { startDate: rawStart, endDate: rawEnd },
          movies:              [],
          winner:              null,
          totalVideosAnalyzed: 0,
          generatedAt:         new Date().toISOString(),
        },
        moviesDiscovered: movieTitles,
      });
    }

    // ── Step 3: Aggregate + rank ────────────────────────────────────────────
    const mbiData = buildMbiResult(allVideos, rawStart, rawEnd);

    // ── Step 4: Trend — previous equal-length period ────────────────────────
    // Only fetch the trend period when the current period actually has data.
    // This avoids burning quota on a useless comparison when movies = [].
    let trend: MbiApiResponse["trend"] | undefined;

    if (mbiData.movies.length > 0) {
      const { prevStart, prevEnd } = shiftPeriod(rawStart, rawEnd);

      const prevVideos = movieTitles.length > 0
        ? await fetchMoviesBuzzSequential(movieTitles, prevStart, prevEnd)
        : await fetchMarketBuzz(prevStart, prevEnd, region);

      if (prevVideos.length > 0) {
        const prevMbi    = buildMbiResult(prevVideos, prevStart, prevEnd);
        const currWinner = mbiData.winner;
        const prevWinner = prevMbi.winner;

        const viewsDelta    = (currWinner?.totalViews ?? 0) - (prevWinner?.totalViews ?? 0);
        const viewsDeltaPct = prevWinner && prevWinner.totalViews > 0
          ? parseFloat(((viewsDelta / prevWinner.totalViews) * 100).toFixed(1))
          : 0;

        trend = {
          previousWinner:      prevWinner?.name ?? null,
          previousWinnerViews: prevWinner?.totalViews ?? 0,
          winnerChanged:       currWinner?.name !== prevWinner?.name,
          viewsDelta,
          viewsDeltaPct,
        };
      }
    }

    return res.status(200).json({
      success:          true,
      data:             mbiData,
      trend,
      moviesDiscovered: movieTitles,
    });

  } catch (err) {
    const msg = err instanceof Error ? err.message : "Internal server error";
    console.error("[MBI]", msg);
    return res.status(500).json({ success: false, error: msg });
  }
}
