/**
 * Reputation OS — API client tests.
 *
 * Since the API client now fetches from real endpoints via fetch(),
 * we mock the global fetch and verify the client correctly calls
 * the right URLs, returns data, and handles errors gracefully.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchReputationScore,
  fetchAlerts,
  fetchNarratives,
  fetchInfluencers,
  fetchAuthenticity,
  fetchActions,
  fetchPredictions,
  fetchCampaignImpact,
} from "@/lib/reputationOs";

// ── Mock fetch ──────────────────────────────────────────────────────────────

const mockFetch = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
});

function mockOkResponse(data: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    status: 200,
    json: async () => data,
  });
}

function mockErrorResponse(status: number, body: unknown) {
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText: `Error ${status}`,
    json: async () => body,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("fetchReputationScore", () => {
  it("calls the correct API endpoint", async () => {
    mockOkResponse({ score: 78, risk_level: "low", trend: "improving", trend_delta: 4, breakdown: {} });
    await fetchReputationScore();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/reputation-os/anil_ravipudi/score"),
      expect.any(Object),
    );
  });

  it("returns data from the API", async () => {
    const expected = {
      score: 78,
      risk_level: "low",
      trend: "improving",
      trend_delta: 4.2,
      breakdown: {
        sentiment: 82,
        engagement_quality: 76,
        narrative_positivity: 80,
        influencer_impact: 74,
        bot_detection: 92,
        trend_stability: 77,
      },
    };
    mockOkResponse(expected);
    const result = await fetchReputationScore();
    expect(result.score).toBe(78);
    expect(result.risk_level).toBe("low");
  });

  it("throws on API error", async () => {
    mockErrorResponse(500, { error: "Internal error" });
    await expect(fetchReputationScore()).rejects.toThrow("ReputationOS API 500");
  });
});

describe("fetchAlerts", () => {
  it("calls the correct API endpoint", async () => {
    mockOkResponse([]);
    await fetchAlerts();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/reputation-os/anil_ravipudi/alerts"),
      expect.any(Object),
    );
  });

  it("returns array of alerts", async () => {
    mockOkResponse([
      { id: "a1", type: "bot_activity", severity: "medium", message: "Test alert", details: "", timestamp: "2025-01-01T00:00:00Z", is_read: false, proof_url: "" },
    ]);
    const result = await fetchAlerts();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(1);
  });
});

describe("fetchNarratives", () => {
  it("calls the correct API endpoint", async () => {
    mockOkResponse([]);
    await fetchNarratives();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/reputation-os/anil_ravipudi/narratives"),
      expect.any(Object),
    );
  });

  it("returns empty array when backend has no narratives", async () => {
    mockOkResponse([]);
    const result = await fetchNarratives();
    expect(result).toEqual([]);
  });
});

describe("fetchInfluencers", () => {
  it("calls the correct API endpoint", async () => {
    mockOkResponse({ supporters: [], attackers: [], neutrals: [] });
    await fetchInfluencers();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/reputation-os/anil_ravipudi/influencers"),
      expect.any(Object),
    );
  });

  it("returns categorized influencers", async () => {
    mockOkResponse({ supporters: [{ username: "fan1" }], attackers: [], neutrals: [] });
    const result = await fetchInfluencers();
    expect(result.supporters).toHaveLength(1);
    expect(result.attackers).toEqual([]);
    expect(result.neutrals).toEqual([]);
  });
});

describe("fetchAuthenticity", () => {
  it("calls the correct API endpoint", async () => {
    mockOkResponse({ bot_percentage: 5, genuine_percentage: 95, suspicious_accounts: 0, total_analyzed: 100, confidence: 90, patterns: [] });
    await fetchAuthenticity();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/reputation-os/anil_ravipudi/authenticity"),
      expect.any(Object),
    );
  });
});

describe("fetchActions", () => {
  it("calls the correct API endpoint", async () => {
    mockOkResponse([]);
    await fetchActions();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/reputation-os/anil_ravipudi/actions"),
      expect.any(Object),
    );
  });
});

describe("fetchPredictions", () => {
  it("calls the correct API endpoint", async () => {
    mockOkResponse({ forecasts: [], historical: [], risk_forecast: "" });
    await fetchPredictions();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/reputation-os/anil_ravipudi/predictions"),
      expect.any(Object),
    );
  });
});

describe("fetchCampaignImpact", () => {
  it("calls the correct API endpoint", async () => {
    mockOkResponse({ campaign_name: "Test", impact_score: 50, status: "neutral", metrics: [], assessment: "", recommendations: [] });
    await fetchCampaignImpact();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining("/api/reputation-os/anil_ravipudi/campaigns"),
      expect.any(Object),
    );
  });
});

describe("All functions accept no parameters", () => {
  it("data functions accept no tenant parameter", () => {
    expect(fetchReputationScore.length).toBe(0);
    expect(fetchAlerts.length).toBe(0);
    expect(fetchNarratives.length).toBe(0);
    expect(fetchInfluencers.length).toBe(0);
    expect(fetchAuthenticity.length).toBe(0);
    expect(fetchActions.length).toBe(0);
    expect(fetchPredictions.length).toBe(0);
    expect(fetchCampaignImpact.length).toBe(0);
  });
});

describe("Error handling", () => {
  it("throws descriptive error on network failure", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));
    await expect(fetchReputationScore()).rejects.toThrow("Network error");
  });

  it("throws on non-2xx status with error detail", async () => {
    mockErrorResponse(502, { error: "Backend unreachable" });
    await expect(fetchAlerts()).rejects.toThrow("ReputationOS API 502");
  });
});
