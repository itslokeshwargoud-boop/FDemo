/**
 * /api/reputation-os/[tenant]/authenticity — Powered by the unified Processing Layer.
 *
 * Derives bot detection and authenticity metrics from real-time Talk data
 * instead of proxying to a separate backend.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import type { AuthenticityReport } from "@/lib/reputationOs";
import { ingestData, type DateFilter } from "@/lib/dataIngestion";
import { computeAuthenticity } from "@/lib/reputationEngine";
import { ANIL_DISPLAY_NAME } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<AuthenticityReport | { error: string }>,
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // No CDN caching — data must be fresh on every request
  res.setHeader("Cache-Control", "no-store, must-revalidate");

  try {
    // Use the keyword from the query string if provided (matches what Talk/Feed searched).
    // Falls back to ANIL_DISPLAY_NAME so the Overview loads on first visit.
    const kw = typeof req.query.keyword === "string" && req.query.keyword.trim()
      ? req.query.keyword.trim()
      : ANIL_DISPLAY_NAME;

    // Timeline mode: apply date filter when both dates are present
    const rawStart = typeof req.query.startDate === "string" ? req.query.startDate.trim() : "";
    const rawEnd   = typeof req.query.endDate   === "string" ? req.query.endDate.trim()   : "";
    const dateRx = /^\d{4}-\d{2}-\d{2}$/;
    const dateFilter: DateFilter | undefined =
      dateRx.test(rawStart) && dateRx.test(rawEnd) && rawStart <= rawEnd
        ? { startDate: rawStart, endDate: rawEnd }
        : undefined;

    const data = await ingestData(kw, {}, dateFilter);
    const report = computeAuthenticity(data);
    return res.status(200).json(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(502).json({ error: message });
  }
}
