/**
 * ROProofLink — Context-aware "Proof" link component.
 *
 * Proof links are ONLY rendered in two allowed contexts:
 *   - "talk_comment"     → comment-level proof in the Talk feature
 *   - "overview_channel"  → YouTube channel links on the Overview page
 *
 * In every other context the component renders nothing.
 * This centralises the proof-link allowlist so it is impossible to
 * accidentally show proof links in Alerts, Narratives, Influencers,
 * Threat Sense, DDR, Predictions, or Campaigns.
 */

import {
  validateProofUrl,
  logProofRejection,
  type ProofValidationResult,
} from "@/lib/proofValidation";

// ---------------------------------------------------------------------------
// Allowed proof-link contexts
// ---------------------------------------------------------------------------

export type ProofLinkContext = "talk_comment" | "overview_channel";

const ALLOWED_CONTEXTS: ReadonlySet<ProofLinkContext> = new Set([
  "talk_comment",
  "overview_channel",
]);

/**
 * Utility: returns true when proof links should be rendered for `ctx`.
 * Useful for tests and programmatic checks.
 */
export function isProofLinkAllowed(ctx: string): ctx is ProofLinkContext {
  return ALLOWED_CONTEXTS.has(ctx as ProofLinkContext);
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface ROProofLinkProps {
  href: string;
  label?: string;
  className?: string;
  /** Context in which the link is rendered. If omitted or not in the
   *  allowlist the component renders nothing. */
  context?: string;
}

export default function ROProofLink({
  href,
  label = "Proof",
  className = "",
  context,
}: ROProofLinkProps) {
  // Gate: only render in explicitly allowed contexts
  if (!context || !isProofLinkAllowed(context)) return null;
  if (!href) return null;

  const validation: ProofValidationResult = validateProofUrl(href);

  if (validation.status === "invalid") {
    logProofRejection("ROProofLink", href, validation);

    return (
      <span
        className={`inline-flex items-center gap-1 text-[10px] font-medium text-slate-500 ${className}`}
        title={validation.reason}
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
        <span>Invalid proof</span>
        <span className="text-slate-600 text-[9px]">
          ({validation.reason})
        </span>
      </span>
    );
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className={`inline-flex items-center gap-1 text-[10px] font-medium text-rose-400 hover:text-rose-300 transition-colors ${className}`}
    >
      <svg
        width="10"
        height="10"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
        <polyline points="15 3 21 3 21 9" />
        <line x1="10" y1="14" x2="21" y2="3" />
      </svg>
      {label}
    </a>
  );
}
