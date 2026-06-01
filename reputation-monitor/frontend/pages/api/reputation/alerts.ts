/**
 * /api/reputation/alerts — Unified API endpoint.
 *
 * Returns all generated alerts derived from the unified Processing Layer.
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { ingestData } from "@/lib/dataIngestion";
import { generateAlerts } from "@/lib/reputationEngine";
import { ANIL_DISPLAY_NAME } from "@/lib/constants";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store, must-revalidate");

  try {
    const data = await ingestData(ANIL_DISPLAY_NAME);
    const alerts = generateAlerts(data);
    return res.status(200).json({ alerts, total: alerts.length, processedAt: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(502).json({ error: message });
  }
}
