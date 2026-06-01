/**
 * REPUTATION OS API client — fetches real data from the backend via
 * Next.js API routes.
 *
 * Single-tenant: permanently scoped to Anil Ravipudi.
 * All functions call `/api/reputation-os/{tenant}/{endpoint}` which proxy
 * to the FastAPI backend.
 *
 * No mock data, no jitter, no hardcoded content.
 */

import { ANIL_TENANT_ID } from "@/lib/constants";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReputationScore {
  score: number; // 0-100
  risk_level: "low" | "medium" | "high" | "critical";
  trend: "improving" | "stable" | "declining";
  trend_delta: number;
  breakdown: {
    sentiment: number;
    engagement_quality: number;
    narrative_positivity: number;
    influencer_impact: number;
    bot_detection: number;
    trend_stability: number;
  };
}

export interface Alert {
  id: string;
  type: string;
  severity: "critical" | "high" | "medium" | "low" | "info";
  message: string;
  details: string;
  timestamp: string;
  is_read: boolean;
  proof_url: string;
}

export interface NarrativeCluster {
  label: string;
  percentage: number;
  sentiment: "positive" | "negative" | "neutral" | "mixed";
  sample_texts: string[];
  sample_proof_urls: string[];
  trend: "growing" | "stable" | "declining";
}

export interface Influencer {
  username: string;
  classification: "supporter" | "neutral" | "attacker";
  influence_score: number;
  reach: number;
  engagement_rate: number;
  impact_percentage: number;
  recent_sentiment: number;
  avatar_color: string;
  proof_url: string;
  channel_url: string;
}

export interface AuthenticityReport {
  bot_percentage: number;
  genuine_percentage: number;
  suspicious_accounts: number;
  total_analyzed: number;
  confidence: number;
  patterns: { type: string; count: number; severity: string; proof_url: string }[];
}

export interface ActionRecommendation {
  id: string;
  priority: "critical" | "high" | "medium" | "low";
  category: string;
  title: string;
  description: string;
  expected_impact: string;
  icon: string; // emoji
  proof_url: string;
}

export interface PredictionForecast {
  horizon: string;
  predicted_score: number;
  confidence_lower: number;
  confidence_upper: number;
  trend: "improving" | "stable" | "declining";
}

export interface PredictionsReport {
  forecasts: PredictionForecast[];
  historical: { date: string; score: number }[];
  risk_forecast: string;
}

export interface CampaignMetric {
  name: string;
  before: number;
  after: number;
  change: number;
  change_percentage: number;
  proof_url: string;
}

export interface CampaignReport {
  campaign_name: string;
  impact_score: number;
  status: "positive" | "negative" | "neutral";
  metrics: CampaignMetric[];
  assessment: string;
  recommendations: string[];
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

const API_BASE = `/api/reputation-os/${ANIL_TENANT_ID}`;

/**
 * Fetch JSON from a Next.js API route.  Throws a descriptive Error on
 * non-2xx responses so React Query surfaces it to the UI.
 * Appends ?keyword= so the backend uses the same keyword as Talk/Feed.
 */
async function fetchJSON<T>(path: string, keyword?: string, startDate?: string, endDate?: string): Promise<T> {
  const params = new URLSearchParams();
  if (keyword)   params.set("keyword",   keyword);
  if (startDate && endDate) {
    params.set("startDate", startDate);
    params.set("endDate",   endDate);
  }
  const qs = params.toString();
  const url = `${API_BASE}${path}${qs ? "?" + qs : ""}`;
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      if (body?.error) detail = body.error;
    } catch {
      // ignore JSON parse failure
    }
    throw new Error(`ReputationOS API ${res.status}: ${detail}`);
  }
  return res.json() as Promise<T>;
}

// ---------------------------------------------------------------------------
// Module 1 — Reputation Score
// ---------------------------------------------------------------------------

export async function fetchReputationScore(keyword?: string, startDate?: string, endDate?: string): Promise<ReputationScore> {
  return fetchJSON<ReputationScore>("/score", keyword, startDate, endDate);
}

// ---------------------------------------------------------------------------
// Module 2 — Alerts
// ---------------------------------------------------------------------------

export async function fetchAlerts(keyword?: string, startDate?: string, endDate?: string): Promise<Alert[]> {
  return fetchJSON<Alert[]>("/alerts", keyword, startDate, endDate);
}

// ---------------------------------------------------------------------------
// Module 3 — Narratives
// ---------------------------------------------------------------------------

export async function fetchNarratives(keyword?: string, startDate?: string, endDate?: string): Promise<NarrativeCluster[]> {
  return fetchJSON<NarrativeCluster[]>("/narratives", keyword, startDate, endDate);
}

// ---------------------------------------------------------------------------
// Module 4 — Influencers
// ---------------------------------------------------------------------------

interface InfluencerSet {
  supporters: Influencer[];
  attackers: Influencer[];
  neutrals: Influencer[];
}

export async function fetchInfluencers(keyword?: string, startDate?: string, endDate?: string): Promise<InfluencerSet> {
  return fetchJSON<InfluencerSet>("/influencers", keyword, startDate, endDate);
}

// ---------------------------------------------------------------------------
// Module 5 — Authenticity
// ---------------------------------------------------------------------------

export async function fetchAuthenticity(keyword?: string, startDate?: string, endDate?: string): Promise<AuthenticityReport> {
  return fetchJSON<AuthenticityReport>("/authenticity", keyword, startDate, endDate);
}

// ---------------------------------------------------------------------------
// Module 6 — Action Recommendations
// ---------------------------------------------------------------------------

export async function fetchActions(keyword?: string, startDate?: string, endDate?: string): Promise<ActionRecommendation[]> {
  return fetchJSON<ActionRecommendation[]>("/actions", keyword, startDate, endDate);
}

// ---------------------------------------------------------------------------
// Module 9 — Predictions
// ---------------------------------------------------------------------------

export async function fetchPredictions(keyword?: string, startDate?: string, endDate?: string): Promise<PredictionsReport> {
  return fetchJSON<PredictionsReport>("/predictions", keyword, startDate, endDate);
}

// ---------------------------------------------------------------------------
// Module 10 — Campaign Impact
// ---------------------------------------------------------------------------

export async function fetchCampaignImpact(keyword?: string, startDate?: string, endDate?: string): Promise<CampaignReport> {
  return fetchJSON<CampaignReport>("/campaigns", keyword, startDate, endDate);
}
