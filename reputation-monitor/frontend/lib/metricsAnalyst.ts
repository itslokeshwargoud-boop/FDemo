/**
 * REPSCAN Metrics Analyst Engine
 *
 * Computes reputation health indices for INDIVIDUAL, MOVIE, and ORGANIZATION
 * entity types, using live YouTube data (videos + comments with sentiment).
 *
 * Steps:
 *  1. Classify entity type from keyword + live data signals
 *  2. Pick the correct metric model (RHI / MRHI / SRHI)
 *  3. Score each metric using live evidence
 *  4. Compute weighted final index score
 *  5. Generate UI-ready summary text
 */

import type { YouTubeVideo } from "@/pages/api/youtube";
import type { SentimentLabel } from "@/lib/sentiment";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type EntityType = "INDIVIDUAL" | "MOVIE" | "ORGANIZATION";
export type Confidence = "high" | "medium" | "low";
export type IndexName = "RHI" | "MRHI" | "SRHI";
export type Grade = "Excellent" | "Good" | "Watch" | "Critical";
export type DataQuality = "high" | "medium" | "low";
export type TimeWindow = "24h" | "7d" | "30d" | "all";

export interface TalkComment {
  commentId: string;
  text: string;
  author: string;
  publishedAt: string;
  videoId: string;
  videoTitle: string;
  channelTitle: string;
  sentiment: SentimentLabel;
  proofUrl: string;
}

export interface LiveData {
  videos: YouTubeVideo[];
  comments: TalkComment[];
  sentimentCounts: { positive: number; negative: number; neutral: number };
  totalComments: number;
}

export interface BasisSignal {
  signal: string;
  source: "youtube" | "twitter" | "reddit" | "news" | "internal" | "other";
  evidence_text: string;
  related_urls: string[];
}

export interface MetricResult {
  name: string;
  weight: number;
  metric_score: number;
  data_quality: DataQuality;
  basis: BasisSignal[];
}

export interface MetricsSummary {
  one_liner: string;
  positive_drivers: string[];
  negative_drivers: string[];
  what_changed_recently: string;
}

export interface MetricsRecommendation {
  title: string;
  actions: string[];
}

export interface MetricsOutput {
  keyword: string;
  entity_type: EntityType;
  confidence: Confidence;
  index_name: IndexName;
  time_window: string;
  index_score: number;
  grade: Grade;
  summary: MetricsSummary;
  metrics: MetricResult[];
  recommendation: MetricsRecommendation;
}

// ---------------------------------------------------------------------------
// Model definitions — metric names & weights
// ---------------------------------------------------------------------------

export interface MetricDef {
  name: string;
  weight: number;
}

const RHI_METRICS: MetricDef[] = [
  { name: "Narrative Control", weight: 12 },
  { name: "Emotional Intensity", weight: 10 },
  { name: "Reputation Volatility", weight: 10 },
  { name: "Viral Negativity Impact", weight: 10 },
  { name: "Fan Defense Strength", weight: 8 },
  { name: "Fake vs Real Audience", weight: 8 },
  { name: "Persona Consistency", weight: 7 },
  { name: "Search Perception", weight: 8 },
  { name: "Controversy Recovery Speed", weight: 7 },
  { name: "Meme Score", weight: 5 },
  { name: "Cross-Platform Gap", weight: 5 },
  { name: "Narrative Drift", weight: 5 },
  { name: "Brand Safety", weight: 5 },
];

const MRHI_METRICS: MetricDef[] = [
  { name: "Audience Sentiment", weight: 15 },
  { name: "Story Engagement", weight: 10 },
  { name: "Hype vs Reality Gap", weight: 10 },
  { name: "Opening Impact", weight: 10 },
  { name: "Word-of-Mouth", weight: 12 },
  { name: "Critic vs Public Gap", weight: 6 },
  { name: "Viral Content", weight: 8 },
  { name: "Negative Buzz Impact", weight: 8 },
  { name: "Audience Retention", weight: 5 },
  { name: "Repeat Value", weight: 5 },
  { name: "Platform Gap", weight: 4 },
  { name: "Search Perception", weight: 3 },
  { name: "Brand Impact", weight: 4 },
];

const SRHI_METRICS: MetricDef[] = [
  { name: "Patient Sentiment", weight: 15 },
  { name: "Treatment Outcome", weight: 12 },
  { name: "Doctor Trust", weight: 10 },
  { name: "Service Experience", weight: 10 },
  { name: "Waiting Time Efficiency", weight: 6 },
  { name: "Emergency Response", weight: 8 },
  { name: "Hygiene & Safety", weight: 8 },
  { name: "Complaint Resolution", weight: 7 },
  { name: "Cost Transparency", weight: 5 },
  { name: "Staff Behavior", weight: 5 },
  { name: "Digital Reputation", weight: 5 },
  { name: "Word-of-Mouth Trust", weight: 5 },
  { name: "Brand Credibility", weight: 4 },
];

// ---------------------------------------------------------------------------
// Step 1 — Entity type classification
// ---------------------------------------------------------------------------

const MOVIE_SIGNALS = [
  "trailer", "teaser", "review", "collection", "box office", "opening",
  "first day", "release date", "cast", "scene", "movie", "film", "blockbuster",
  "ott", "streaming", "rating", "imdb", "rotten tomatoes", "director",
  "sequel", "prequel", "cinema", "theater", "theatre", "bollywood",
  "hollywood", "tollywood", "south movie",
];

const ORG_SIGNALS = [
  "hospital", "clinic", "doctor", "patient", "treatment", "service",
  "company", "brand", "staff", "employee", "customer", "complaint",
  "hygiene", "safety", "cost", "price", "insurance", "medical",
  "healthcare", "pharma", "airline", "bank", "hotel", "restaurant",
  "agency", "institution", "university", "school", "college",
  "corporation", "inc", "ltd", "llc", "pvt",
];

export function classifyEntity(
  keyword: string,
  data: LiveData
): { entity_type: EntityType; confidence: Confidence } {
  const kw = keyword.toLowerCase();
  const allText = [
    kw,
    ...data.videos.map((v) => v.title.toLowerCase()),
    ...data.videos.map((v) => v.description.toLowerCase()),
  ].join(" ");

  let movieScore = 0;
  let orgScore = 0;

  for (const signal of MOVIE_SIGNALS) {
    if (allText.includes(signal)) movieScore++;
  }

  for (const signal of ORG_SIGNALS) {
    if (allText.includes(signal)) orgScore++;
  }

  // Direct keyword match boosts confidence
  for (const signal of MOVIE_SIGNALS) {
    if (kw.includes(signal)) movieScore += 3;
  }
  for (const signal of ORG_SIGNALS) {
    if (kw.includes(signal)) orgScore += 3;
  }

  if (movieScore > orgScore && movieScore >= 3) {
    return {
      entity_type: "MOVIE",
      confidence: movieScore >= 6 ? "high" : "medium",
    };
  }

  if (orgScore > movieScore && orgScore >= 3) {
    return {
      entity_type: "ORGANIZATION",
      confidence: orgScore >= 6 ? "high" : "medium",
    };
  }

  // Default to INDIVIDUAL
  const maxScore = Math.max(movieScore, orgScore);
  return {
    entity_type: "INDIVIDUAL",
    confidence: maxScore === 0 ? "medium" : "low",
  };
}

// ---------------------------------------------------------------------------
// Step 2 — Pick the correct model
// ---------------------------------------------------------------------------

export function getModelForEntity(
  entityType: EntityType
): { index_name: IndexName; metrics: MetricDef[] } {
  switch (entityType) {
    case "INDIVIDUAL":
      return { index_name: "RHI", metrics: RHI_METRICS };
    case "MOVIE":
      return { index_name: "MRHI", metrics: MRHI_METRICS };
    case "ORGANIZATION":
      return { index_name: "SRHI", metrics: SRHI_METRICS };
  }
}

// ---------------------------------------------------------------------------
// Step 3 — Metric scoring helpers
// ---------------------------------------------------------------------------

function clamp(value: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function sentimentRatio(data: LiveData): {
  posRatio: number;
  negRatio: number;
  neuRatio: number;
} {
  const total =
    data.sentimentCounts.positive +
    data.sentimentCounts.negative +
    data.sentimentCounts.neutral;
  if (total === 0) return { posRatio: 0, negRatio: 0, neuRatio: 0 };
  return {
    posRatio: data.sentimentCounts.positive / total,
    negRatio: data.sentimentCounts.negative / total,
    neuRatio: data.sentimentCounts.neutral / total,
  };
}

function engagementRate(videos: YouTubeVideo[]): number {
  const totalViews = videos.reduce((s, v) => s + v.viewCount, 0);
  const totalLikes = videos.reduce((s, v) => s + v.likeCount, 0);
  if (totalViews === 0) return 0;
  return (totalLikes / totalViews) * 100;
}

function avgCommentsPerVideo(videos: YouTubeVideo[]): number {
  if (videos.length === 0) return 0;
  const totalComments = videos.reduce((s, v) => s + v.commentCount, 0);
  return totalComments / videos.length;
}

/** Count comments containing any of the given keywords */
function countCommentsWithKeywords(
  comments: TalkComment[],
  keywords: string[]
): number {
  let count = 0;
  for (const c of comments) {
    const lower = c.text.toLowerCase();
    if (keywords.some((kw) => lower.includes(kw))) count++;
  }
  return count;
}

/** Get proof URLs from top-N videos by views */
function topVideoUrls(videos: YouTubeVideo[], n = 3): string[] {
  return videos
    .sort((a, b) => b.viewCount - a.viewCount)
    .slice(0, n)
    .map((v) => v.proofUrl);
}

/** Extract unique channels */
function uniqueChannels(videos: YouTubeVideo[]): string[] {
  return [...new Set(videos.map((v) => v.channelTitle))];
}

// ---------------------------------------------------------------------------
// Step 3 — Score individual metrics
// ---------------------------------------------------------------------------

function scoreIndividualMetrics(
  data: LiveData,
  keyword: string
): MetricResult[] {
  const { posRatio, negRatio } = sentimentRatio(data);
  const engRate = engagementRate(data.videos);
  const commentCount = data.totalComments;
  const urls = topVideoUrls(data.videos);
  const channels = uniqueChannels(data.videos);

  return [
    {
      name: "Narrative Control",
      weight: 12,
      metric_score: clamp(posRatio * 100 + (1 - negRatio) * 20),
      data_quality: commentCount > 50 ? "high" : commentCount > 10 ? "medium" : "low",
      basis: [
        {
          signal: "Positive-to-negative comment ratio",
          source: "youtube",
          evidence_text: `${(posRatio * 100).toFixed(1)}% positive vs ${(negRatio * 100).toFixed(1)}% negative comments out of ${commentCount} total`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Emotional Intensity",
      weight: 10,
      metric_score: clamp(
        Math.abs(posRatio - negRatio) < 0.1 ? 50 : posRatio > negRatio ? 70 + posRatio * 20 : 30 - negRatio * 20
      ),
      data_quality: commentCount > 30 ? "high" : "medium",
      basis: [
        {
          signal: "Sentiment polarity strength",
          source: "youtube",
          evidence_text: `Comments show ${posRatio > negRatio ? "strong positive" : negRatio > posRatio ? "strong negative" : "mixed"} emotional engagement across ${commentCount} comments`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Reputation Volatility",
      weight: 10,
      // Low volatility is good - score high if sentiment is consistent
      metric_score: clamp(
        negRatio < 0.2 ? 80 : negRatio < 0.4 ? 60 : 40
      ),
      data_quality: commentCount > 100 ? "high" : "medium",
      basis: [
        {
          signal: "Sentiment stability across content",
          source: "youtube",
          evidence_text: `Negative comment rate of ${(negRatio * 100).toFixed(1)}% ${negRatio < 0.2 ? "indicates stable reputation" : negRatio < 0.4 ? "shows moderate volatility" : "signals high volatility"}`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Viral Negativity Impact",
      weight: 10,
      // High score = low negative impact (good)
      metric_score: clamp((1 - negRatio) * 100),
      data_quality: commentCount > 20 ? "high" : "medium",
      basis: [
        {
          signal: "Negative content virality",
          source: "youtube",
          evidence_text: `${data.sentimentCounts.negative} negative comments out of ${commentCount} total (${(negRatio * 100).toFixed(1)}%)`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Fan Defense Strength",
      weight: 8,
      metric_score: clamp(
        posRatio > 0.5 ? 75 + posRatio * 20 : posRatio > 0.3 ? 55 : 35
      ),
      data_quality: commentCount > 30 ? "medium" : "low",
      basis: [
        {
          signal: "Positive engagement ratio",
          source: "youtube",
          evidence_text: `${data.sentimentCounts.positive} supportive comments detected, representing ${(posRatio * 100).toFixed(1)}% of all discourse`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Fake vs Real Audience",
      weight: 8,
      // Estimate based on engagement rate - very high or very low is suspicious
      metric_score: clamp(
        engRate > 0.5 && engRate < 10 ? 75 : engRate > 10 ? 50 : 40
      ),
      data_quality: "medium",
      basis: [
        {
          signal: "Engagement rate pattern analysis",
          source: "youtube",
          evidence_text: `Average engagement rate of ${engRate.toFixed(2)}% across ${data.videos.length} videos — ${engRate > 0.5 && engRate < 10 ? "appears organic" : "anomalous pattern detected (estimate)"}`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Persona Consistency",
      weight: 7,
      // Measured by how consistent the narrative is across channels
      metric_score: clamp(
        channels.length <= 3 ? 70 : channels.length <= 6 ? 60 : 50
      ),
      data_quality: "medium",
      basis: [
        {
          signal: "Cross-channel narrative consistency",
          source: "youtube",
          evidence_text: `Content from ${channels.length} unique channels — ${channels.length <= 3 ? "consistent narrative" : "diverse perspectives may indicate inconsistency (estimate)"}`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Search Perception",
      weight: 8,
      // Based on top video quality and engagement
      metric_score: clamp(
        data.videos.length >= 10 ? 70 + engRate * 2 : data.videos.length >= 5 ? 55 + engRate * 2 : 40
      ),
      data_quality: data.videos.length > 5 ? "high" : "medium",
      basis: [
        {
          signal: "Search result quality for keyword",
          source: "youtube",
          evidence_text: `${data.videos.length} videos found for "${keyword}" with ${engRate.toFixed(2)}% average engagement`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Controversy Recovery Speed",
      weight: 7,
      // Without time-series data, estimate from current sentiment balance
      metric_score: clamp(
        posRatio > negRatio ? 65 + (posRatio - negRatio) * 40 : 35
      ),
      data_quality: "low",
      basis: [
        {
          signal: "Current sentiment trend direction (estimate)",
          source: "youtube",
          evidence_text: `Current positive/negative ratio of ${(posRatio / Math.max(negRatio, 0.01)).toFixed(1)}:1 suggests ${posRatio > negRatio ? "recovery trajectory" : "ongoing negative pressure"}`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Meme Score",
      weight: 5,
      metric_score: clamp(
        countCommentsWithKeywords(data.comments, ["meme", "lol", "lmao", "😂", "🤣", "dead", "icon", "legend"]) > 5 ? 65 : 45
      ),
      data_quality: "low",
      basis: [
        {
          signal: "Meme/viral humor presence",
          source: "youtube",
          evidence_text: `Detected ${countCommentsWithKeywords(data.comments, ["meme", "lol", "lmao", "😂", "🤣", "dead", "icon", "legend"])} comments with meme/humor signals`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Cross-Platform Gap",
      weight: 5,
      metric_score: 50,
      data_quality: "low",
      basis: [
        {
          signal: "Single-platform data limitation",
          source: "youtube",
          evidence_text: "Only YouTube data available — cross-platform comparison not possible. Score set to neutral baseline.",
          related_urls: [],
        },
      ],
    },
    {
      name: "Narrative Drift",
      weight: 5,
      metric_score: clamp(
        channels.length > 5 ? 55 : 70
      ),
      data_quality: "low",
      basis: [
        {
          signal: "Topic consistency across content",
          source: "youtube",
          evidence_text: `Content spread across ${channels.length} channels — ${channels.length > 5 ? "wider narrative drift possible (estimate)" : "relatively focused narrative"}`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Brand Safety",
      weight: 5,
      // Based on negative/toxic content ratio
      metric_score: clamp((1 - negRatio * 1.5) * 100),
      data_quality: commentCount > 20 ? "medium" : "low",
      basis: [
        {
          signal: "Content safety assessment",
          source: "youtube",
          evidence_text: `${(negRatio * 100).toFixed(1)}% negative content rate — ${negRatio < 0.15 ? "brand-safe environment" : negRatio < 0.3 ? "moderate risk" : "elevated brand safety concern"}`,
          related_urls: urls,
        },
      ],
    },
  ];
}

function scoreMovieMetrics(
  data: LiveData,
  keyword: string
): MetricResult[] {
  const { posRatio, negRatio } = sentimentRatio(data);
  const engRate = engagementRate(data.videos);
  const commentCount = data.totalComments;
  const urls = topVideoUrls(data.videos);
  const totalViews = data.videos.reduce((s, v) => s + v.viewCount, 0);

  const womCount = countCommentsWithKeywords(data.comments, [
    "must watch", "recommend", "worth", "go watch", "loved it", "amazing",
    "best movie", "masterpiece", "brilliant",
  ]);
  const negBuzzCount = countCommentsWithKeywords(data.comments, [
    "worst", "waste", "boring", "terrible", "disaster", "flop", "overrated",
    "disappointing", "bad movie",
  ]);

  return [
    {
      name: "Audience Sentiment",
      weight: 15,
      metric_score: clamp(posRatio * 100 + 10),
      data_quality: commentCount > 50 ? "high" : commentCount > 10 ? "medium" : "low",
      basis: [
        {
          signal: "Overall audience sentiment distribution",
          source: "youtube",
          evidence_text: `${(posRatio * 100).toFixed(1)}% positive, ${(negRatio * 100).toFixed(1)}% negative, ${((1 - posRatio - negRatio) * 100).toFixed(1)}% neutral across ${commentCount} comments`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Story Engagement",
      weight: 10,
      metric_score: clamp(
        avgCommentsPerVideo(data.videos) > 500 ? 85 :
        avgCommentsPerVideo(data.videos) > 100 ? 70 :
        avgCommentsPerVideo(data.videos) > 20 ? 55 : 35
      ),
      data_quality: data.videos.length > 3 ? "medium" : "low",
      basis: [
        {
          signal: "Comments-per-video engagement",
          source: "youtube",
          evidence_text: `Average of ${avgCommentsPerVideo(data.videos).toFixed(0)} comments per video indicating ${avgCommentsPerVideo(data.videos) > 100 ? "high" : "moderate"} story engagement`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Hype vs Reality Gap",
      weight: 10,
      // If lots of negative comments exist alongside high views, there's a gap
      metric_score: clamp(
        negRatio > 0.3 && totalViews > 100000 ? 40 :
        negRatio < 0.2 ? 75 : 55
      ),
      data_quality: commentCount > 30 ? "medium" : "low",
      basis: [
        {
          signal: "Expectation vs delivery analysis",
          source: "youtube",
          evidence_text: `${totalViews.toLocaleString()} total views with ${(negRatio * 100).toFixed(1)}% negative sentiment — ${negRatio > 0.3 ? "significant hype-reality gap" : "audience expectations met"}`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Opening Impact",
      weight: 10,
      metric_score: clamp(
        totalViews > 1000000 ? 85 :
        totalViews > 100000 ? 70 :
        totalViews > 10000 ? 55 : 35
      ),
      data_quality: data.videos.length > 3 ? "medium" : "low",
      basis: [
        {
          signal: "Initial view momentum",
          source: "youtube",
          evidence_text: `${totalViews.toLocaleString()} total views across ${data.videos.length} videos — ${totalViews > 100000 ? "strong" : "moderate"} opening impact`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Word-of-Mouth",
      weight: 12,
      metric_score: clamp(
        womCount > 20 ? 80 : womCount > 5 ? 65 : womCount > 0 ? 50 : 35
      ),
      data_quality: commentCount > 30 ? "medium" : "low",
      basis: [
        {
          signal: "Recommendation keyword frequency",
          source: "youtube",
          evidence_text: `${womCount} comments contain recommendation keywords (e.g., "must watch", "recommend", "worth watching")`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Critic vs Public Gap",
      weight: 6,
      metric_score: 50,
      data_quality: "low",
      basis: [
        {
          signal: "Critic data unavailable",
          source: "youtube",
          evidence_text: "No critic review data available — only public YouTube comments analyzed. Score set to neutral baseline.",
          related_urls: [],
        },
      ],
    },
    {
      name: "Viral Content",
      weight: 8,
      metric_score: clamp(
        engRate > 5 ? 80 : engRate > 2 ? 65 : engRate > 0.5 ? 50 : 30
      ),
      data_quality: data.videos.length > 3 ? "medium" : "low",
      basis: [
        {
          signal: "Viral engagement patterns",
          source: "youtube",
          evidence_text: `Engagement rate of ${engRate.toFixed(2)}% with ${totalViews.toLocaleString()} total views — ${engRate > 5 ? "viral traction detected" : "standard engagement levels"}`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Negative Buzz Impact",
      weight: 8,
      metric_score: clamp((1 - negRatio) * 80 + 10),
      data_quality: commentCount > 20 ? "medium" : "low",
      basis: [
        {
          signal: "Negative buzz density",
          source: "youtube",
          evidence_text: `${negBuzzCount} comments contain strong negative keywords. Overall negative rate: ${(negRatio * 100).toFixed(1)}%`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Audience Retention",
      weight: 5,
      metric_score: clamp(
        commentCount > 200 ? 70 : commentCount > 50 ? 55 : 40
      ),
      data_quality: "low",
      basis: [
        {
          signal: "Comment volume as retention proxy",
          source: "youtube",
          evidence_text: `${commentCount} total comments suggest ${commentCount > 200 ? "strong" : "moderate"} audience retention (estimate — direct retention data unavailable)`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Repeat Value",
      weight: 5,
      metric_score: clamp(
        posRatio > 0.5 ? 65 : posRatio > 0.3 ? 50 : 35
      ),
      data_quality: "low",
      basis: [
        {
          signal: "Rewatch indicators in comments",
          source: "youtube",
          evidence_text: `${(posRatio * 100).toFixed(1)}% positive sentiment suggests ${posRatio > 0.5 ? "high" : "moderate"} repeat value (estimate)`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Platform Gap",
      weight: 4,
      metric_score: 50,
      data_quality: "low",
      basis: [
        {
          signal: "Single-platform data limitation",
          source: "youtube",
          evidence_text: "Only YouTube data available — platform comparison not possible. Score set to neutral baseline.",
          related_urls: [],
        },
      ],
    },
    {
      name: "Search Perception",
      weight: 3,
      metric_score: clamp(
        data.videos.length >= 10 ? 70 + engRate * 2 : data.videos.length >= 5 ? 55 : 40
      ),
      data_quality: data.videos.length > 5 ? "medium" : "low",
      basis: [
        {
          signal: "Search result quality",
          source: "youtube",
          evidence_text: `${data.videos.length} videos found for "${keyword}" — ${data.videos.length >= 10 ? "strong" : "moderate"} search presence`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Brand Impact",
      weight: 4,
      metric_score: clamp(posRatio * 80 + 15),
      data_quality: "medium",
      basis: [
        {
          signal: "Brand perception from audience feedback",
          source: "youtube",
          evidence_text: `Overall positive brand perception at ${(posRatio * 100).toFixed(1)}% with engagement rate of ${engRate.toFixed(2)}%`,
          related_urls: urls,
        },
      ],
    },
  ];
}

function scoreOrganizationMetrics(
  data: LiveData,
  keyword: string
): MetricResult[] {
  const { posRatio, negRatio, neuRatio } = sentimentRatio(data);
  const engRate = engagementRate(data.videos);
  const commentCount = data.totalComments;
  const urls = topVideoUrls(data.videos);

  const complaintCount = countCommentsWithKeywords(data.comments, [
    "complaint", "worst", "terrible", "rude", "unprofessional", "never again",
    "avoid", "scam", "fraud", "malpractice",
  ]);
  const trustCount = countCommentsWithKeywords(data.comments, [
    "trust", "recommend", "best", "excellent", "professional", "caring",
    "grateful", "thank", "saved", "life saver",
  ]);
  const costCount = countCommentsWithKeywords(data.comments, [
    "expensive", "cost", "price", "affordable", "cheap", "overcharged",
    "billing", "insurance", "fee",
  ]);

  return [
    {
      name: "Patient Sentiment",
      weight: 15,
      metric_score: clamp(posRatio * 100 + 10),
      data_quality: commentCount > 50 ? "high" : commentCount > 10 ? "medium" : "low",
      basis: [
        {
          signal: "Overall patient/customer sentiment",
          source: "youtube",
          evidence_text: `${(posRatio * 100).toFixed(1)}% positive, ${(negRatio * 100).toFixed(1)}% negative across ${commentCount} comments`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Treatment Outcome",
      weight: 12,
      metric_score: clamp(
        trustCount > 10 ? 75 : trustCount > 3 ? 60 : 45
      ),
      data_quality: "medium",
      basis: [
        {
          signal: "Positive outcome mentions",
          source: "youtube",
          evidence_text: `${trustCount} comments mention positive outcomes or trust keywords (e.g., "recommend", "saved", "grateful")`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Doctor Trust",
      weight: 10,
      metric_score: clamp(
        trustCount > 15 ? 80 : trustCount > 5 ? 65 : trustCount > 0 ? 50 : 35
      ),
      data_quality: commentCount > 20 ? "medium" : "low",
      basis: [
        {
          signal: "Trust and recommendation signals",
          source: "youtube",
          evidence_text: `${trustCount} trust-indicating comments detected. Positive sentiment at ${(posRatio * 100).toFixed(1)}%`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Service Experience",
      weight: 10,
      metric_score: clamp(
        posRatio > 0.5 ? 75 : posRatio > 0.3 ? 60 : 40
      ),
      data_quality: commentCount > 30 ? "medium" : "low",
      basis: [
        {
          signal: "Service satisfaction indicators",
          source: "youtube",
          evidence_text: `${(posRatio * 100).toFixed(1)}% positive experience reports vs ${(negRatio * 100).toFixed(1)}% negative`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Waiting Time Efficiency",
      weight: 6,
      metric_score: clamp(
        countCommentsWithKeywords(data.comments, ["wait", "delay", "slow", "hours", "long wait"]) > 5 ? 35 : 60
      ),
      data_quality: "low",
      basis: [
        {
          signal: "Wait time complaint frequency",
          source: "youtube",
          evidence_text: `${countCommentsWithKeywords(data.comments, ["wait", "delay", "slow", "hours", "long wait"])} comments mention waiting/delay issues (estimate)`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Emergency Response",
      weight: 8,
      metric_score: clamp(
        countCommentsWithKeywords(data.comments, ["emergency", "urgent", "critical", "saved", "life"]) > 3 ? 65 : 50
      ),
      data_quality: "low",
      basis: [
        {
          signal: "Emergency care mentions",
          source: "youtube",
          evidence_text: `${countCommentsWithKeywords(data.comments, ["emergency", "urgent", "critical", "saved", "life"])} comments reference emergency/critical care (estimate)`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Hygiene & Safety",
      weight: 8,
      metric_score: clamp(
        countCommentsWithKeywords(data.comments, ["dirty", "unhygienic", "unsafe", "infection", "contaminated"]) > 3 ? 35 :
        countCommentsWithKeywords(data.comments, ["clean", "hygienic", "safe", "sterile"]) > 3 ? 75 : 55
      ),
      data_quality: "low",
      basis: [
        {
          signal: "Hygiene and safety sentiment",
          source: "youtube",
          evidence_text: `Hygiene/safety analysis based on keyword signals in ${commentCount} comments (estimate — limited direct data)`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Complaint Resolution",
      weight: 7,
      metric_score: clamp((1 - negRatio * 1.2) * 80),
      data_quality: "medium",
      basis: [
        {
          signal: "Complaint volume and resolution signals",
          source: "youtube",
          evidence_text: `${complaintCount} complaint-related comments detected. Negative sentiment rate: ${(negRatio * 100).toFixed(1)}%`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Cost Transparency",
      weight: 5,
      metric_score: clamp(
        costCount > 10 ? 45 : costCount > 3 ? 55 : 60
      ),
      data_quality: "low",
      basis: [
        {
          signal: "Cost/pricing discussion volume",
          source: "youtube",
          evidence_text: `${costCount} comments discuss cost/pricing — ${costCount > 10 ? "frequent pricing concerns" : "limited pricing discussion"} (estimate)`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Staff Behavior",
      weight: 5,
      metric_score: clamp(
        countCommentsWithKeywords(data.comments, ["rude", "unprofessional", "arrogant", "hostile"]) > 3 ? 35 :
        countCommentsWithKeywords(data.comments, ["kind", "caring", "polite", "helpful", "friendly"]) > 3 ? 75 : 55
      ),
      data_quality: "low",
      basis: [
        {
          signal: "Staff behavior sentiment",
          source: "youtube",
          evidence_text: `Staff-related keywords analyzed across ${commentCount} comments (estimate — limited direct data)`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Digital Reputation",
      weight: 5,
      metric_score: clamp(
        data.videos.length >= 10 ? 70 : data.videos.length >= 5 ? 55 : 40
      ),
      data_quality: "medium",
      basis: [
        {
          signal: "Online presence strength",
          source: "youtube",
          evidence_text: `${data.videos.length} videos found for "${keyword}" with ${engRate.toFixed(2)}% engagement rate`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Word-of-Mouth Trust",
      weight: 5,
      metric_score: clamp(
        trustCount > 10 ? 75 : trustCount > 3 ? 60 : 40
      ),
      data_quality: "medium",
      basis: [
        {
          signal: "Recommendation and trust signals",
          source: "youtube",
          evidence_text: `${trustCount} positive trust/recommendation signals vs ${complaintCount} complaint signals in comments`,
          related_urls: urls,
        },
      ],
    },
    {
      name: "Brand Credibility",
      weight: 4,
      metric_score: clamp(posRatio * 80 + neuRatio * 10 + 10),
      data_quality: "medium",
      basis: [
        {
          signal: "Overall brand credibility assessment",
          source: "youtube",
          evidence_text: `Sentiment balance (${(posRatio * 100).toFixed(1)}% pos / ${(neuRatio * 100).toFixed(1)}% neu / ${(negRatio * 100).toFixed(1)}% neg) indicates ${posRatio > 0.5 ? "strong" : "moderate"} credibility`,
          related_urls: urls,
        },
      ],
    },
  ];
}

// ---------------------------------------------------------------------------
// Step 3 — Score dispatcher
// ---------------------------------------------------------------------------

export function scoreMetrics(
  entityType: EntityType,
  data: LiveData,
  keyword: string
): MetricResult[] {
  switch (entityType) {
    case "INDIVIDUAL":
      return scoreIndividualMetrics(data, keyword);
    case "MOVIE":
      return scoreMovieMetrics(data, keyword);
    case "ORGANIZATION":
      return scoreOrganizationMetrics(data, keyword);
  }
}

// ---------------------------------------------------------------------------
// Step 4 — Compute final index score
// ---------------------------------------------------------------------------

export function computeIndexScore(metrics: MetricResult[]): number {
  const totalWeight = metrics.reduce((s, m) => s + m.weight, 0);
  if (totalWeight === 0) return 0;
  const weighted = metrics.reduce(
    (s, m) => s + m.metric_score * m.weight,
    0
  );
  return Math.round((weighted / totalWeight) * 10) / 10;
}

export function computeGrade(score: number): Grade {
  if (score >= 85) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Watch";
  return "Critical";
}

// ---------------------------------------------------------------------------
// Step 5 — Generate summary
// ---------------------------------------------------------------------------

function buildSummary(
  keyword: string,
  entityType: EntityType,
  indexScore: number,
  grade: Grade,
  metrics: MetricResult[]
): MetricsSummary {
  const sorted = [...metrics].sort(
    (a, b) => b.metric_score * b.weight - a.metric_score * a.weight
  );
  const positiveDrivers = sorted.slice(0, 3).map(
    (m) => `${m.name}: ${m.metric_score}/100 (weight ${m.weight})`
  );

  const sortedNeg = [...metrics].sort(
    (a, b) => a.metric_score * a.weight - b.metric_score * b.weight
  );
  const negativeDrivers = sortedNeg.slice(0, 3).map(
    (m) => `${m.name}: ${m.metric_score}/100 (weight ${m.weight})`
  );

  const entityLabel =
    entityType === "INDIVIDUAL"
      ? "individual"
      : entityType === "MOVIE"
        ? "movie"
        : "organization";

  const oneLiner = `Overall reputation score for "${keyword}" is ${indexScore}/100 (${grade}). Based on ${entityLabel} analysis across YouTube content and audience sentiment.`;

  return {
    one_liner: oneLiner,
    positive_drivers: positiveDrivers,
    negative_drivers: negativeDrivers,
    what_changed_recently:
      "Time-series trend data is limited to YouTube upload dates. Detailed change tracking requires historical data accumulation.",
  };
}

function buildRecommendation(
  entityType: EntityType,
  grade: Grade,
  metrics: MetricResult[]
): MetricsRecommendation {
  const weakest = [...metrics]
    .sort((a, b) => a.metric_score - b.metric_score)
    .slice(0, 3);

  const actions: string[] = [];

  if (grade === "Critical" || grade === "Watch") {
    actions.push(
      `Address negative sentiment — currently the weakest areas are: ${weakest.map((m) => m.name).join(", ")}`
    );
  }

  for (const m of weakest) {
    if (m.metric_score < 50) {
      actions.push(
        `Improve ${m.name} (currently ${m.metric_score}/100) — ${m.basis[0]?.evidence_text ?? "needs attention"}`
      );
    }
  }

  if (actions.length === 0) {
    actions.push("Maintain current positive trajectory");
    actions.push("Monitor sentiment trends for early warning signs");
  }

  actions.push("Expand monitoring to include Twitter, Reddit, and news sources for comprehensive analysis");

  const titleMap: Record<Grade, string> = {
    Excellent: "Maintain & Protect",
    Good: "Strengthen & Grow",
    Watch: "Monitor & Improve",
    Critical: "Urgent Action Required",
  };

  return {
    title: titleMap[grade],
    actions,
  };
}

// ---------------------------------------------------------------------------
// Main — run the full pipeline
// ---------------------------------------------------------------------------

export function runMetricsAnalysis(
  keyword: string,
  data: LiveData,
  timeWindow: TimeWindow = "all"
): MetricsOutput {
  // Step 1
  const { entity_type, confidence } = classifyEntity(keyword, data);

  // Step 2
  const { index_name } = getModelForEntity(entity_type);

  // Step 3
  const metrics = scoreMetrics(entity_type, data, keyword);

  // Step 4
  const index_score = computeIndexScore(metrics);
  const grade = computeGrade(index_score);

  // Step 5
  const summary = buildSummary(keyword, entity_type, index_score, grade, metrics);
  const recommendation = buildRecommendation(entity_type, grade, metrics);

  return {
    keyword,
    entity_type,
    confidence,
    index_name,
    time_window: timeWindow,
    index_score,
    grade,
    summary,
    metrics,
    recommendation,
  };
}
