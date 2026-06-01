/**
 * Proof Validation — Validates proof URLs and text evidence before rendering.
 *
 * Rules:
 *  - URL must be syntactically valid
 *  - Only https: protocol is allowed (blocks javascript:, data:, etc.)
 *  - YouTube proof URLs must match expected format
 *  - GitHub URLs must match repo/commit/PR/issue patterns
 *  - Text evidence must have non-empty required fields
 *
 * Invalid proofs are flagged with a reason instead of being silently rendered.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ProofStatus = "valid" | "invalid";

export interface ProofValidationResult {
  status: ProofStatus;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Allowed protocols
// ---------------------------------------------------------------------------

const ALLOWED_PROTOCOLS = new Set(["https:"]);

// ---------------------------------------------------------------------------
// URL Validation
// ---------------------------------------------------------------------------

/**
 * Validates a proof URL string.
 *
 * Checks:
 *  1. Non-empty string
 *  2. Parseable as a URL
 *  3. Uses an allowed protocol (https only)
 *  4. Has a valid hostname
 */
export function validateProofUrl(url: unknown): ProofValidationResult {
  if (typeof url !== "string" || url.trim() === "") {
    return { status: "invalid", reason: "Missing or empty URL" };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: "invalid", reason: "Malformed URL" };
  }

  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    return {
      status: "invalid",
      reason: `Unsupported protocol: ${parsed.protocol.replace(":", "")}`,
    };
  }

  if (!parsed.hostname || parsed.hostname.length < 3) {
    return { status: "invalid", reason: "Invalid hostname" };
  }

  return { status: "valid" };
}

// ---------------------------------------------------------------------------
// YouTube URL Validation
// ---------------------------------------------------------------------------

const YOUTUBE_VIDEO_RE =
  /^https:\/\/(www\.)?youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}/;

const YOUTUBE_COMMENT_RE =
  /^https:\/\/(www\.)?youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}&lc=[A-Za-z0-9_-]+/;

/**
 * Validates a YouTube proof URL (video or comment link).
 */
export function validateYouTubeProofUrl(url: unknown): ProofValidationResult {
  const base = validateProofUrl(url);
  if (base.status === "invalid") return base;

  const str = url as string;
  if (!YOUTUBE_VIDEO_RE.test(str)) {
    return {
      status: "invalid",
      reason: "Not a valid YouTube video URL",
    };
  }

  return { status: "valid" };
}

/**
 * Checks whether a YouTube comment proof URL has the &lc= parameter.
 */
export function validateYouTubeCommentProofUrl(
  url: unknown,
): ProofValidationResult {
  const base = validateYouTubeProofUrl(url);
  if (base.status === "invalid") return base;

  const str = url as string;
  if (!YOUTUBE_COMMENT_RE.test(str)) {
    return {
      status: "invalid",
      reason: "Missing comment ID (&lc=) in YouTube URL",
    };
  }

  return { status: "valid" };
}

// ---------------------------------------------------------------------------
// GitHub URL Validation
// ---------------------------------------------------------------------------

const GITHUB_REPO_FILE_RE =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/blob\/.+/;

const GITHUB_COMMIT_RE =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/commit\/[0-9a-f]+/;

const GITHUB_PR_RE =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/\d+/;

const GITHUB_ISSUE_RE =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/issues\/\d+/;

/**
 * Validates a GitHub proof URL (repo file, commit, PR, or issue).
 */
export function validateGitHubProofUrl(url: unknown): ProofValidationResult {
  const base = validateProofUrl(url);
  if (base.status === "invalid") return base;

  const str = url as string;
  if (
    !GITHUB_REPO_FILE_RE.test(str) &&
    !GITHUB_COMMIT_RE.test(str) &&
    !GITHUB_PR_RE.test(str) &&
    !GITHUB_ISSUE_RE.test(str)
  ) {
    return {
      status: "invalid",
      reason: "Not a recognized GitHub URL format",
    };
  }

  return { status: "valid" };
}

// ---------------------------------------------------------------------------
// Text Evidence Validation
// ---------------------------------------------------------------------------

/**
 * Validates text evidence fields (signal name + evidence text).
 */
export function validateTextEvidence(
  signal: unknown,
  evidenceText: unknown,
): ProofValidationResult {
  if (typeof signal !== "string" || signal.trim() === "") {
    return { status: "invalid", reason: "Missing required field: signal" };
  }
  if (typeof evidenceText !== "string" || evidenceText.trim() === "") {
    return {
      status: "invalid",
      reason: "Missing required field: evidence_text",
    };
  }

  return { status: "valid" };
}

// ---------------------------------------------------------------------------
// Generic proof URL check (for any external link)
// ---------------------------------------------------------------------------

/**
 * Quick boolean check: is this URL safe to render as a clickable link?
 */
export function isProofUrlSafe(url: unknown): boolean {
  return validateProofUrl(url).status === "valid";
}

// ---------------------------------------------------------------------------
// Zod Schemas
// ---------------------------------------------------------------------------

/** Schema for a single proof URL string */
export const ProofUrlSchema = z.string().refine(
  (val) => validateProofUrl(val).status === "valid",
  { message: "Invalid proof URL" },
);

/** Schema for a YouTube video proof URL */
export const YouTubeProofUrlSchema = z.string().refine(
  (val) => validateYouTubeProofUrl(val).status === "valid",
  { message: "Invalid YouTube proof URL" },
);

/** Schema for a YouTube comment proof URL */
export const YouTubeCommentProofUrlSchema = z.string().refine(
  (val) => validateYouTubeCommentProofUrl(val).status === "valid",
  { message: "Invalid YouTube comment proof URL" },
);

/** Schema for a BasisSignal */
export const BasisSignalSchema = z.object({
  signal: z.string().min(1, "Signal name is required"),
  source: z.enum(["youtube", "twitter", "reddit", "news", "internal", "other"]),
  evidence_text: z.string().min(1, "Evidence text is required"),
  related_urls: z.array(ProofUrlSchema),
});

/** Schema for a TalkItem proof payload */
export const TalkItemProofSchema = z.object({
  commentId: z.string().min(1),
  videoId: z.string().min(1),
  text: z.string().min(1),
  author: z.string(),
  publishedAt: z.string(),
  videoTitle: z.string(),
  channelTitle: z.string(),
  sentiment: z.enum(["positive", "negative", "neutral"]),
  proofUrl: YouTubeCommentProofUrlSchema,
});

/** Schema for a YouTubeVideo proof payload */
export const YouTubeVideoProofSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  channelTitle: z.string(),
  publishedAt: z.string(),
  thumbnailUrl: z.string(),
  description: z.string(),
  proofUrl: YouTubeProofUrlSchema,
  viewCount: z.number(),
  likeCount: z.number(),
  commentCount: z.number(),
});

// ---------------------------------------------------------------------------
// Dev-mode diagnostic logging
// ---------------------------------------------------------------------------

/**
 * Logs proof validation failures in development mode.
 */
export function logProofRejection(
  context: string,
  url: unknown,
  result: ProofValidationResult,
): void {
  if (process.env.NODE_ENV === "development" && result.status === "invalid") {
    console.warn(
      `[REPSCAN Proof Validation] ${context}: rejected "${String(url)}" — ${result.reason}`,
    );
  }
}
