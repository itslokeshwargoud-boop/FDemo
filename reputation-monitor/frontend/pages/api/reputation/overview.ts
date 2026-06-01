/**
 * /api/reputation/overview — Unified API endpoint.
 *
 * Returns aggregated reputation metrics and score derived from the
 * unified Processing Layer (Talk + Feed → Intelligence).
 */

import type { NextApiRequest, NextApiResponse } from "next";
import { ingestData } from "@/lib/dataIngestion";
import { computeReputationScore, generateAlerts, buildNarratives, recommendActions, predictTrends } from "@/lib/reputationEngine";
import { ANIL_DISPLAY_NAME } from "@/lib/constants";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store, must-revalidate");

  try {
    const data = await ingestData(ANIL_DISPLAY_NAME);
    const score = computeReputationScore(data);
    const alerts = generateAlerts(data);
    const narratives = buildNarratives(data);
    const actions = recommendActions(data);
    const predictions = predictTrends(data);

    return res.status(200).json({
      score,
      alerts: alerts.slice(0, 5),
      narratives: narratives.slice(0, 5),
      actions: actions.slice(0, 5),
      predictions: {
        forecasts: predictions.forecasts,
        risk_forecast: predictions.risk_forecast,
      },
      engagement: data.engagement,
      processedAt: new Date().toISOString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return res.status(502).json({ error: message });
  }
}
