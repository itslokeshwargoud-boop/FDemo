/**
 * Automated tests for the Metrics Analyst engine.
 *
 * Verifies:
 *  1. Entity type classification (INDIVIDUAL, MOVIE, ORGANIZATION)
 *  2. Correct model selection (RHI, MRHI, SRHI)
 *  3. Metric scoring produces valid 0-100 values
 *  4. Final index score computation with weights
 *  5. Grade assignment based on score ranges
 *  6. Full pipeline returns valid output structure
 */

import { describe, it, expect } from "vitest";
import {
  classifyEntity,
  getModelForEntity,
  scoreMetrics,
  computeIndexScore,
  computeGrade,
  runMetricsAnalysis,
  type LiveData,
  type MetricResult,
} from "../lib/metricsAnalyst";

// ---------------------------------------------------------------------------
// Test data factories
// ---------------------------------------------------------------------------

function makeLiveData(overrides?: Partial<LiveData>): LiveData {
  return {
    videos: [
      {
        id: "v1",
        title: "Test Video 1",
        channelTitle: "Channel A",
        publishedAt: "2024-06-01T00:00:00Z",
        thumbnailUrl: "",
        description: "A test video description",
        proofUrl: "https://www.youtube.com/watch?v=v1",
        viewCount: 100000,
        likeCount: 5000,
        commentCount: 300,
      },
      {
        id: "v2",
        title: "Test Video 2",
        channelTitle: "Channel B",
        publishedAt: "2024-06-15T00:00:00Z",
        thumbnailUrl: "",
        description: "Another test video",
        proofUrl: "https://www.youtube.com/watch?v=v2",
        viewCount: 50000,
        likeCount: 2000,
        commentCount: 150,
      },
    ],
    comments: [
      {
        commentId: "c1",
        text: "Great content, love this!",
        author: "User A",
        publishedAt: "2024-06-02T00:00:00Z",
        videoId: "v1",
        videoTitle: "Test Video 1",
        channelTitle: "Channel A",
        sentiment: "positive",
        proofUrl: "https://www.youtube.com/watch?v=v1&lc=c1",
      },
      {
        commentId: "c2",
        text: "This is terrible and awful",
        author: "User B",
        publishedAt: "2024-06-03T00:00:00Z",
        videoId: "v1",
        videoTitle: "Test Video 1",
        channelTitle: "Channel A",
        sentiment: "negative",
        proofUrl: "https://www.youtube.com/watch?v=v1&lc=c2",
      },
      {
        commentId: "c3",
        text: "Interesting perspective",
        author: "User C",
        publishedAt: "2024-06-04T00:00:00Z",
        videoId: "v2",
        videoTitle: "Test Video 2",
        channelTitle: "Channel B",
        sentiment: "neutral",
        proofUrl: "https://www.youtube.com/watch?v=v2&lc=c3",
      },
    ],
    sentimentCounts: { positive: 60, negative: 20, neutral: 20 },
    totalComments: 100,
    ...overrides,
  };
}

function makeMovieData(): LiveData {
  return makeLiveData({
    videos: [
      {
        id: "mv1",
        title: "RRR Movie Official Trailer",
        channelTitle: "Production House",
        publishedAt: "2024-01-01T00:00:00Z",
        thumbnailUrl: "",
        description: "Official trailer for the blockbuster movie RRR",
        proofUrl: "https://www.youtube.com/watch?v=mv1",
        viewCount: 5000000,
        likeCount: 200000,
        commentCount: 10000,
      },
      {
        id: "mv2",
        title: "RRR Review - Best Movie of 2024?",
        channelTitle: "Film Critic",
        publishedAt: "2024-01-15T00:00:00Z",
        thumbnailUrl: "",
        description: "Full review of RRR film. Box office collection update.",
        proofUrl: "https://www.youtube.com/watch?v=mv2",
        viewCount: 500000,
        likeCount: 30000,
        commentCount: 2000,
      },
    ],
  });
}

function makeOrgData(): LiveData {
  return makeLiveData({
    videos: [
      {
        id: "org1",
        title: "Apollo Hospital Patient Review",
        channelTitle: "Health Channel",
        publishedAt: "2024-03-01T00:00:00Z",
        thumbnailUrl: "",
        description: "Patient experience at Apollo hospital clinic. Doctor review.",
        proofUrl: "https://www.youtube.com/watch?v=org1",
        viewCount: 30000,
        likeCount: 1500,
        commentCount: 200,
      },
    ],
    comments: [
      {
        commentId: "oc1",
        text: "Best hospital, professional doctor staff",
        author: "Patient A",
        publishedAt: "2024-03-02T00:00:00Z",
        videoId: "org1",
        videoTitle: "Apollo Hospital Patient Review",
        channelTitle: "Health Channel",
        sentiment: "positive",
        proofUrl: "https://www.youtube.com/watch?v=org1&lc=oc1",
      },
    ],
  });
}

// ---------------------------------------------------------------------------
// 1. Entity type classification
// ---------------------------------------------------------------------------

describe("Entity Classification", () => {
  it("classifies a generic name as INDIVIDUAL", () => {
    const data = makeLiveData();
    const result = classifyEntity("Virat Kohli", data);
    expect(result.entity_type).toBe("INDIVIDUAL");
  });

  it("classifies a movie keyword as MOVIE", () => {
    const data = makeMovieData();
    const result = classifyEntity("RRR movie", data);
    expect(result.entity_type).toBe("MOVIE");
  });

  it("classifies an organization keyword as ORGANIZATION", () => {
    const data = makeOrgData();
    const result = classifyEntity("Apollo Hospital", data);
    expect(result.entity_type).toBe("ORGANIZATION");
  });

  it("returns valid confidence levels", () => {
    const validConfidence = ["high", "medium", "low"];
    const data = makeLiveData();

    const r1 = classifyEntity("random name", data);
    expect(validConfidence).toContain(r1.confidence);

    const r2 = classifyEntity("movie trailer", makeMovieData());
    expect(validConfidence).toContain(r2.confidence);

    const r3 = classifyEntity("hospital clinic", makeOrgData());
    expect(validConfidence).toContain(r3.confidence);
  });

  it("always returns one of three entity types", () => {
    const keywords = [
      "Shah Rukh Khan",
      "Avengers trailer",
      "AIIMS hospital",
      "random 123",
      "",
    ];
    const validTypes = ["INDIVIDUAL", "MOVIE", "ORGANIZATION"];

    for (const kw of keywords) {
      const result = classifyEntity(kw, makeLiveData());
      expect(validTypes).toContain(result.entity_type);
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Model selection
// ---------------------------------------------------------------------------

describe("Model Selection", () => {
  it("returns RHI for INDIVIDUAL", () => {
    const model = getModelForEntity("INDIVIDUAL");
    expect(model.index_name).toBe("RHI");
    expect(model.metrics).toHaveLength(13);
  });

  it("returns MRHI for MOVIE", () => {
    const model = getModelForEntity("MOVIE");
    expect(model.index_name).toBe("MRHI");
    expect(model.metrics).toHaveLength(13);
  });

  it("returns SRHI for ORGANIZATION", () => {
    const model = getModelForEntity("ORGANIZATION");
    expect(model.index_name).toBe("SRHI");
    expect(model.metrics).toHaveLength(13);
  });

  it("weights sum to 100 for each model", () => {
    const models = ["INDIVIDUAL", "MOVIE", "ORGANIZATION"] as const;
    for (const type of models) {
      const { metrics } = getModelForEntity(type);
      const totalWeight = metrics.reduce((s, m) => s + m.weight, 0);
      expect(totalWeight).toBe(100);
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Metric scoring produces valid values
// ---------------------------------------------------------------------------

describe("Metric Scoring", () => {
  it("scores 13 metrics for INDIVIDUAL", () => {
    const data = makeLiveData();
    const metrics = scoreMetrics("INDIVIDUAL", data, "Test Person");
    expect(metrics).toHaveLength(13);
  });

  it("scores 13 metrics for MOVIE", () => {
    const data = makeMovieData();
    const metrics = scoreMetrics("MOVIE", data, "Test Movie");
    expect(metrics).toHaveLength(13);
  });

  it("scores 13 metrics for ORGANIZATION", () => {
    const data = makeOrgData();
    const metrics = scoreMetrics("ORGANIZATION", data, "Test Org");
    expect(metrics).toHaveLength(13);
  });

  it("all metric scores are between 0 and 100", () => {
    const types = ["INDIVIDUAL", "MOVIE", "ORGANIZATION"] as const;
    const datasets = [makeLiveData(), makeMovieData(), makeOrgData()];

    for (let i = 0; i < types.length; i++) {
      const metrics = scoreMetrics(types[i], datasets[i], "test");
      for (const m of metrics) {
        expect(m.metric_score).toBeGreaterThanOrEqual(0);
        expect(m.metric_score).toBeLessThanOrEqual(100);
      }
    }
  });

  it("all metrics have required fields", () => {
    const metrics = scoreMetrics("INDIVIDUAL", makeLiveData(), "test");
    for (const m of metrics) {
      expect(m.name).toBeTruthy();
      expect(typeof m.weight).toBe("number");
      expect(typeof m.metric_score).toBe("number");
      expect(["high", "medium", "low"]).toContain(m.data_quality);
      expect(m.basis).toBeInstanceOf(Array);
      expect(m.basis.length).toBeGreaterThanOrEqual(1);

      for (const b of m.basis) {
        expect(b.signal).toBeTruthy();
        expect(["youtube", "twitter", "reddit", "news", "internal", "other"]).toContain(b.source);
        expect(b.evidence_text).toBeTruthy();
        expect(b.related_urls).toBeInstanceOf(Array);
      }
    }
  });

  it("handles empty data gracefully", () => {
    const emptyData: LiveData = {
      videos: [],
      comments: [],
      sentimentCounts: { positive: 0, negative: 0, neutral: 0 },
      totalComments: 0,
    };

    const types = ["INDIVIDUAL", "MOVIE", "ORGANIZATION"] as const;
    for (const type of types) {
      const metrics = scoreMetrics(type, emptyData, "empty");
      expect(metrics).toHaveLength(13);
      for (const m of metrics) {
        expect(m.metric_score).toBeGreaterThanOrEqual(0);
        expect(m.metric_score).toBeLessThanOrEqual(100);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Final index score computation
// ---------------------------------------------------------------------------

describe("Index Score Computation", () => {
  it("computes weighted average correctly", () => {
    const metrics: MetricResult[] = [
      {
        name: "A",
        weight: 50,
        metric_score: 80,
        data_quality: "high",
        basis: [],
      },
      {
        name: "B",
        weight: 50,
        metric_score: 60,
        data_quality: "high",
        basis: [],
      },
    ];
    const score = computeIndexScore(metrics);
    expect(score).toBe(70);
  });

  it("respects weights", () => {
    const metrics: MetricResult[] = [
      {
        name: "A",
        weight: 90,
        metric_score: 100,
        data_quality: "high",
        basis: [],
      },
      {
        name: "B",
        weight: 10,
        metric_score: 0,
        data_quality: "high",
        basis: [],
      },
    ];
    const score = computeIndexScore(metrics);
    expect(score).toBe(90);
  });

  it("returns 0 for empty metrics", () => {
    expect(computeIndexScore([])).toBe(0);
  });

  it("returns score between 0 and 100 for real data", () => {
    const data = makeLiveData();
    const metrics = scoreMetrics("INDIVIDUAL", data, "test");
    const score = computeIndexScore(metrics);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// 5. Grade assignment
// ---------------------------------------------------------------------------

describe("Grade Assignment", () => {
  it("assigns Excellent for scores >= 85", () => {
    expect(computeGrade(85)).toBe("Excellent");
    expect(computeGrade(100)).toBe("Excellent");
    expect(computeGrade(92.5)).toBe("Excellent");
  });

  it("assigns Good for scores 70-84.9", () => {
    expect(computeGrade(70)).toBe("Good");
    expect(computeGrade(84.9)).toBe("Good");
    expect(computeGrade(75)).toBe("Good");
  });

  it("assigns Watch for scores 50-69.9", () => {
    expect(computeGrade(50)).toBe("Watch");
    expect(computeGrade(69.9)).toBe("Watch");
    expect(computeGrade(60)).toBe("Watch");
  });

  it("assigns Critical for scores 0-49.9", () => {
    expect(computeGrade(0)).toBe("Critical");
    expect(computeGrade(49.9)).toBe("Critical");
    expect(computeGrade(25)).toBe("Critical");
  });
});

// ---------------------------------------------------------------------------
// 6. Full pipeline
// ---------------------------------------------------------------------------

describe("Full Pipeline (runMetricsAnalysis)", () => {
  it("returns complete output structure for INDIVIDUAL", () => {
    const data = makeLiveData();
    const output = runMetricsAnalysis("Virat Kohli", data, "7d");

    expect(output.keyword).toBe("Virat Kohli");
    expect(output.entity_type).toBe("INDIVIDUAL");
    expect(output.index_name).toBe("RHI");
    expect(output.time_window).toBe("7d");
    expect(output.index_score).toBeGreaterThanOrEqual(0);
    expect(output.index_score).toBeLessThanOrEqual(100);
    expect(["Excellent", "Good", "Watch", "Critical"]).toContain(output.grade);
    expect(output.metrics).toHaveLength(13);
    expect(output.summary.one_liner).toBeTruthy();
    expect(output.summary.positive_drivers).toHaveLength(3);
    expect(output.summary.negative_drivers).toHaveLength(3);
    expect(output.recommendation.title).toBeTruthy();
    expect(output.recommendation.actions.length).toBeGreaterThanOrEqual(1);
  });

  it("returns complete output structure for MOVIE", () => {
    const data = makeMovieData();
    const output = runMetricsAnalysis("RRR movie", data, "30d");

    expect(output.entity_type).toBe("MOVIE");
    expect(output.index_name).toBe("MRHI");
    expect(output.metrics).toHaveLength(13);
    expect(output.index_score).toBeGreaterThanOrEqual(0);
    expect(output.index_score).toBeLessThanOrEqual(100);
  });

  it("returns complete output structure for ORGANIZATION", () => {
    const data = makeOrgData();
    const output = runMetricsAnalysis("Apollo Hospital", data, "all");

    expect(output.entity_type).toBe("ORGANIZATION");
    expect(output.index_name).toBe("SRHI");
    expect(output.metrics).toHaveLength(13);
  });

  it("produces valid JSON-serializable output", () => {
    const data = makeLiveData();
    const output = runMetricsAnalysis("test", data);

    // Should not throw
    const json = JSON.stringify(output);
    const parsed = JSON.parse(json);

    expect(parsed.keyword).toBe("test");
    expect(parsed.metrics).toHaveLength(13);
    expect(typeof parsed.index_score).toBe("number");
  });

  it("handles empty live data without crashing", () => {
    const emptyData: LiveData = {
      videos: [],
      comments: [],
      sentimentCounts: { positive: 0, negative: 0, neutral: 0 },
      totalComments: 0,
    };

    const output = runMetricsAnalysis("empty", emptyData);
    expect(output.keyword).toBe("empty");
    expect(output.metrics).toHaveLength(13);
    expect(output.index_score).toBeGreaterThanOrEqual(0);
    expect(output.index_score).toBeLessThanOrEqual(100);
  });

  it("defaults time_window to 'all' when not specified", () => {
    const data = makeLiveData();
    const output = runMetricsAnalysis("test", data);
    expect(output.time_window).toBe("all");
  });

  it("each metric weight matches its model definition", () => {
    const data = makeLiveData();
    const output = runMetricsAnalysis("person", data);

    // Should be INDIVIDUAL → RHI
    const model = getModelForEntity("INDIVIDUAL");
    for (let i = 0; i < model.metrics.length; i++) {
      expect(output.metrics[i].name).toBe(model.metrics[i].name);
      expect(output.metrics[i].weight).toBe(model.metrics[i].weight);
    }
  });
});
