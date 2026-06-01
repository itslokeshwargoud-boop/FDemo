/**
 * /api/reputation/influencers — Unified API endpoint.
 *
 * Returns ranked influencers derived from the unified Processing Layer.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { ingestData } from "@/lib/dataIngestion";
import { analyzeInfluencers } from "@/lib/reputationEngine";
import { ANIL_DISPLAY_NAME } from "@/lib/constants";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store, must-revalidate");

  try {
    const data = await ingestData(ANIL_DISPLAY_NAME);
    const influencers = analyzeInfluencers(data);
    return res.status(200).json({
      ...influencers,
      total: influencers.supporters.length + influencers.attackers.length + influencers.neutrals.length,
      processedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(502).json({ error: message });
  }
}
