/**
 * REPUTATION ENGINE — Core Processing Layer
 *
 * Transforms raw ingested data (Talk + Feed) into structured intelligence
 * consumed by ALL Reputation OS features.
 *
 * Architecture:
 *   Raw Data (Talk + Feed)
 *     → Data Ingestion Layer
 *       → Reputation Engine (this file)
 *         → Unified Data Model
 *           → Feature-specific endpoints
 *
 * Modules:
 *   1. Reputation Score   — sentiment + engagement + bot safety composite
 *   2. Alert Generator    — sentiment spikes, bot activity, anomalies
 *   3. Narrative Builder  — keyword-based topic clustering
 *   4. Influencer Ranker  — channel/author analysis by engagement
 *   5. Authenticity       — bot detection report
 *   6. Action Recommender — risk-based action generation
 *   7. Trend Predictor    — historical score extrapolation
 *   8. Campaign Tracker   — engagement metric comparison
 */

import type { IngestedData } from "@/lib/dataIngestion";
import type { TalkItemRow } from "@/lib/db/talkCache";
import type {
  ReputationScore,
  Alert,
  NarrativeCluster,
  Influencer,
  AuthenticityReport,
  ActionRecommendation,
  PredictionsReport,
  CampaignReport,
} from "@/lib/reputationOs";

// ---------------------------------------------------------------------------
// Configuration constants
// ---------------------------------------------------------------------------

/** Milliseconds in one day (24 hours) */
const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Milliseconds in one week (7 days) */
const MS_PER_WEEK = 7 * MS_PER_DAY;

/** Threshold for classifying sentiment as "mixed" (20% of cluster size) */
const MIXED_SENTIMENT_THRESHOLD = 0.2;

/** Average bot score above which an author is excluded from influencer ranking */
// BOT_SCORE_EXCLUSION_THRESHOLD removed — analyzeInfluencers now uses inline threshold (avg >= 40 || max >= 70)

/** Minimum comments in 24h to trigger a velocity surge alert */
const VELOCITY_SURGE_THRESHOLD = 50;

/** Bot pattern count thresholds for severity classification */
const BOT_PATTERN_CRITICAL_THRESHOLD = 50;
const BOT_PATTERN_HIGH_THRESHOLD = 20;
const BOT_PATTERN_MEDIUM_THRESHOLD = 5;

/** Confidence scoring based on sample size */
const CONFIDENCE_THRESHOLDS = [
  { minSamples: 1000, confidence: 92 },
  { minSamples: 500, confidence: 85 },
  { minSamples: 100, confidence: 75 },
  { minSamples: 20, confidence: 60 },
] as const;
const CONFIDENCE_MINIMUM = 40;

/**
 * Baseline degradation factor for campaign comparison.
 * Simulates a "before" state as 75% of current metrics — a placeholder until
 * real historical snapshots are persisted.
 */
const BASELINE_DEGRADATION_FACTOR = 0.75;

// ---------------------------------------------------------------------------
// 1. REPUTATION SCORE
// ---------------------------------------------------------------------------

export function computeReputationScore(data: IngestedData): ReputationScore {
  const { sentimentCounts, botCounts, engagement } = data;
  const total = sentimentCounts.total || 1;

  // Sentiment score (0-100): proportion of positive vs negative
  const positiveRatio = sentimentCounts.positive / total;
  const negativeRatio = sentimentCounts.negative / total;
  const sentimentScore = Math.round(
    Math.min(100, Math.max(0, (positiveRatio - negativeRatio + 1) * 50))
  );

  // Engagement quality (0-100): engagement rate scaled
  const engagementQuality = Math.min(
    100,
    Math.round(engagement.engagementRate * 20)
  );

  // Bot safety (0-100): proportion of human comments
  const botTotal = botCounts.total || 1;
  const botSafety = Math.round((botCounts.human / botTotal) * 100);

  // Bot penalty: reduce score when bots are prevalent
  const botPenalty = Math.round(((botCounts.bot + botCounts.suspicious * 0.5) / botTotal) * 20);

  // Narrative positivity: based on positive ratio
  const narrativePositivity = Math.round(positiveRatio * 100);

  // Influencer impact: based on average engagement per video
  const influencerImpact = Math.min(
    100,
    engagement.totalVideos > 0
      ? Math.round(
          Math.min(
            100,
            (engagement.totalLikes / engagement.totalVideos / 1000) * 50
          )
        )
      : 50
  );

  // Trend stability: direction-aware — positive skew is stable, negative skew is risky.
  // Old formula penalised high positivity as much as high negativity, which is wrong.
  // New: >= 50% positive → fully stable (100). Below 50% → linearly falls to 0.
  const trendStability = positiveRatio >= 0.5
    ? 100
    : Math.round(positiveRatio * 200);

  // Composite score with weights
  const rawScore =
    sentimentScore * 0.3 +
    engagementQuality * 0.2 +
    botSafety * 0.15 +
    narrativePositivity * 0.15 +
    influencerImpact * 0.1 +
    trendStability * 0.1;

  const finalScore = Math.round(Math.min(100, Math.max(0, rawScore - botPenalty)));

  // Determine risk level
  let riskLevel: ReputationScore["risk_level"];
  if (finalScore >= 75) riskLevel = "low";
  else if (finalScore >= 50) riskLevel = "medium";
  else if (finalScore >= 25) riskLevel = "high";
  else riskLevel = "critical";

  // Determine trend
  const trendDelta = Math.round((positiveRatio - negativeRatio) * 100) / 10;
  let trend: ReputationScore["trend"];
  if (trendDelta > 1) trend = "improving";
  else if (trendDelta < -1) trend = "declining";
  else trend = "stable";

  return {
    score: finalScore,
    risk_level: riskLevel,
    trend,
    trend_delta: trendDelta,
    breakdown: {
      sentiment: sentimentScore,
      engagement_quality: engagementQuality,
      narrative_positivity: narrativePositivity,
      influencer_impact: influencerImpact,
      bot_detection: botSafety,
      trend_stability: trendStability,
    },
  };
}

// ---------------------------------------------------------------------------
// 2. ALERT GENERATOR
// ---------------------------------------------------------------------------

export function generateAlerts(data: IngestedData): Alert[] {
  const alerts: Alert[] = [];
  const { sentimentCounts, botCounts, talkItems, engagement } = data;
  const now = new Date().toISOString();
  let alertId = 0;

  const total = sentimentCounts.total || 1;
  const negativeRatio = sentimentCounts.negative / total;
  const botRatio = (botCounts.bot + botCounts.suspicious) / (botCounts.total || 1);

  // Alert: Negative sentiment spike
  if (negativeRatio > 0.4) {
    alerts.push({
      id: `alert-${++alertId}`,
      type: "negative_spike",
      severity: negativeRatio > 0.6 ? "critical" : "high",
      message: `Negative sentiment at ${(negativeRatio * 100).toFixed(1)}% across ${sentimentCounts.total} comments`,
      details: `${sentimentCounts.negative} negative comments detected out of ${sentimentCounts.total} total. This exceeds the safe threshold of 40%.`,
      timestamp: now,
      is_read: false,
      proof_url: "",
    });
  }

  // Alert: Bot activity detected
  if (botRatio > 0.15) {
    alerts.push({
      id: `alert-${++alertId}`,
      type: "bot_activity",
      severity: botRatio > 0.3 ? "critical" : botRatio > 0.2 ? "high" : "medium",
      message: `Suspicious bot activity detected: ${(botRatio * 100).toFixed(1)}% of comments flagged`,
      details: `${botCounts.bot} bot accounts and ${botCounts.suspicious} suspicious accounts identified from ${botCounts.total} analyzed comments.`,
      timestamp: now,
      is_read: false,
      proof_url: "",
    });
  }

  // Alert: Velocity surge — check for recent comment bursts
  const recentItems = talkItems.filter((item) => {
    const age = Date.now() - new Date(item.publishedAt).getTime();
    return age < MS_PER_DAY; // Last 24 hours
  });
  if (recentItems.length > VELOCITY_SURGE_THRESHOLD) {
    alerts.push({
      id: `alert-${++alertId}`,
      type: "velocity_surge",
      severity: recentItems.length > 200 ? "high" : "medium",
      message: `${recentItems.length} comments in the last 24 hours — engagement velocity surge`,
      details: `An unusually high volume of comments has been detected in the past day, indicating a potential viral moment or coordinated campaign.`,
      timestamp: now,
      is_read: false,
      proof_url: "",
    });
  }

  // Alert: Narrative shift — high neutral might indicate confusion
  const neutralRatio = sentimentCounts.neutral / total;
  if (neutralRatio > 0.6 && total > 20) {
    alerts.push({
      id: `alert-${++alertId}`,
      type: "narrative_shift",
      severity: "medium",
      message: `${(neutralRatio * 100).toFixed(1)}% neutral sentiment — possible narrative ambiguity`,
      details: `A high proportion of neutral comments may indicate confusion about the topic, mixed messaging, or a shifting narrative.`,
      timestamp: now,
      is_read: false,
      proof_url: "",
    });
  }

  // Alert: Reputation score concern
  const score = computeReputationScore(data);
  if (score.score < 40) {
    alerts.push({
      id: `alert-${++alertId}`,
      type: "reputation_drop",
      severity: score.score < 20 ? "critical" : "high",
      message: `Reputation score at ${score.score}/100 — requires attention`,
      details: `Overall reputation has dropped below safe levels. Key factors: sentiment (${score.breakdown.sentiment}%), bot safety (${score.breakdown.bot_detection}%), engagement quality (${score.breakdown.engagement_quality}%).`,
      timestamp: now,
      is_read: false,
      proof_url: "",
    });
  }

  // Alert: Low engagement — dedicated type so UI can display with correct icon/label
  if (engagement.totalVideos > 0 && engagement.engagementRate < 0.5) {
    alerts.push({
      id: `alert-${++alertId}`,
      type: "low_engagement",
      severity: "low",
      message: `Low engagement rate: ${engagement.engagementRate.toFixed(2)}% across ${engagement.totalVideos} video(s)`,
      details: `Engagement rate is below the 0.5% healthy threshold. Increase interactive content (polls, questions, replies) to drive audience participation.`,
      timestamp: now,
      is_read: false,
      proof_url: "",
    });
  }

  return alerts;
}

// ---------------------------------------------------------------------------
// 3. NARRATIVE BUILDER
// ---------------------------------------------------------------------------

// Simple keyword-based topic clustering (MVP — no ML embeddings needed)
const TOPIC_KEYWORDS: Record<string, string[]> = {
  "Film & Direction": ["movie", "film", "direct", "director", "cinema", "box office", "blockbuster", "hit", "flop", "screen"],
  "Acting & Performance": ["act", "performance", "role", "character", "hero", "heroine", "star", "casting"],
  "Fan Reactions": ["fan", "love", "amazing", "awesome", "best", "favorite", "legend", "superb", "goat"],
  "Criticism & Controversy": ["bad", "worst", "boring", "waste", "overrated", "flop", "disaster", "hate", "terrible"],
  "Music & Entertainment": ["song", "music", "dance", "item", "melody", "album", "bgm", "soundtrack"],
  "Industry & Business": ["collection", "revenue", "crore", "budget", "profit", "industry", "market", "release"],
  "Social & Cultural": ["culture", "society", "message", "political", "social", "community", "tradition"],
  "Technical Quality": ["vfx", "visual", "camera", "edit", "cgi", "graphics", "quality", "production"],
};

export function buildNarratives(data: IngestedData): NarrativeCluster[] {
  const { talkItems } = data;
  if (talkItems.length === 0) return [];

  // Count mentions per topic cluster
  const clusterCounts = new Map<string, { count: number; positive: number; negative: number; neutral: number; samples: string[] }>();

  for (const [topic] of Object.entries(TOPIC_KEYWORDS)) {
    clusterCounts.set(topic, { count: 0, positive: 0, negative: 0, neutral: 0, samples: [] });
  }

  for (const item of talkItems) {
    const textLower = item.text.toLowerCase();
    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
      const matches = keywords.some((kw) => textLower.includes(kw));
      if (matches) {
        const cluster = clusterCounts.get(topic)!;
        cluster.count++;
        if (item.sentiment === "positive") cluster.positive++;
        else if (item.sentiment === "negative") cluster.negative++;
        else cluster.neutral++;
        if (cluster.samples.length < 5) {
          cluster.samples.push(item.text.slice(0, 200));
        }
      }
    }
  }

  // Pre-compute recent mention counts per cluster (O(n) pass) to avoid O(n*m) inside the map.
  const recentClusterCounts = new Map<string, number>();
  for (const [topic] of Object.entries(TOPIC_KEYWORDS)) {
    recentClusterCounts.set(topic, 0);
  }
  for (const item of talkItems) {
    const age = Date.now() - new Date(item.publishedAt).getTime();
    if (age >= MS_PER_WEEK) continue; // skip non-recent
    const textLower = item.text.toLowerCase();
    for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
      if (keywords.some((kw) => textLower.includes(kw))) {
        recentClusterCounts.set(topic, (recentClusterCounts.get(topic) ?? 0) + 1);
      }
    }
  }

  // Filter topics with mentions. Normalize percentages within the visible set so they
  // sum to 100% — avoids misleading pie chart when comments match multiple topics.
  const visibleEntries = Array.from(clusterCounts.entries()).filter(([, stats]) => stats.count > 0);
  const visibleTotal = visibleEntries.reduce((s, [, stats]) => s + stats.count, 0) || 1;

  const clusters: NarrativeCluster[] = visibleEntries
    .map(([label, stats]) => {
      const percentage = parseFloat(
        ((stats.count / visibleTotal) * 100).toFixed(1)
      );

      // Determine dominant sentiment
      let sentiment: NarrativeCluster["sentiment"];
      if (stats.positive > stats.negative && stats.positive > stats.neutral) {
        sentiment = "positive";
      } else if (stats.negative > stats.positive && stats.negative > stats.neutral) {
        sentiment = "negative";
      } else if (stats.positive > 0 && stats.negative > 0 && Math.abs(stats.positive - stats.negative) < stats.count * MIXED_SENTIMENT_THRESHOLD) {
        sentiment = "mixed";
      } else {
        sentiment = "neutral";
      }

      // Determine trend based on recency — use pre-computed recentClusterCounts (O(1) lookup)
      const recentMentions = recentClusterCounts.get(label) ?? 0;

      const recentRatio = stats.count > 0 ? recentMentions / stats.count : 0;
      let trend: NarrativeCluster["trend"];
      if (recentRatio > 0.5) trend = "growing";
      else if (recentRatio < 0.2) trend = "declining";
      else trend = "stable";

      return {
        label,
        percentage,
        sentiment,
        sample_texts: stats.samples,
        sample_proof_urls: [],
        trend,
      };
    })
    .sort((a, b) => b.percentage - a.percentage);

  return clusters;
}

// ---------------------------------------------------------------------------
// 4. INFLUENCER RANKER
// ---------------------------------------------------------------------------

export function analyzeInfluencers(data: IngestedData): {
  supporters: Influencer[];
  attackers: Influencer[];
  neutrals: Influencer[];
} {
  const { talkItems, channelStats } = data;

  // ── BUG FIX 1: Use authorChannelId (stable UC... ID) as the dedup key.
  // authorDisplayName is NOT unique — two users can share the same display name.
  // Fall back to authorChannelUrl, then display name as last resort so older
  // cached rows (before the DB migration) are still handled correctly.
  //
  // ── BUG FIX 6: Track recent activity separately for recency weighting.
  const RECENCY_WINDOW_MS = 30 * 24 * 60 * 60 * 1000; // last 30 days
  const now = Date.now();

  type AuthorStats = {
    displayName: string;
    commentCount: number;
    recentCommentCount: number; // comments within RECENCY_WINDOW_MS
    positive: number;
    negative: number;
    neutral: number;
    videoIds: Set<string>;      // BUG FIX 5: track videos, not channels (channels = video-owner)
    totalBotScore: number;
    maxBotScore: number;        // BUG FIX 2: track worst-case, not just average
    authorChannelUrl: string;
    firstProofUrl: string;
  };

  const authorMap = new Map<string, AuthorStats>();

  for (const item of talkItems) {
    // Dedup key priority: channelId (stable) → channelUrl (extractable) → displayName (fallback)
    const channelId =
      (item as TalkItemRow & { authorChannelId?: string }).authorChannelId?.trim() ||
      item.authorChannelUrl?.trim() ||
      item.author ||
      "anonymous";

    const existing = authorMap.get(channelId) ?? {
      displayName: item.author || "Anonymous",
      commentCount: 0,
      recentCommentCount: 0,
      positive: 0,
      negative: 0,
      neutral: 0,
      videoIds: new Set<string>(),
      totalBotScore: 0,
      maxBotScore: 0,
      authorChannelUrl: "",
      firstProofUrl: "",
    };

    existing.commentCount++;

    // Recency tracking
    const age = now - new Date(item.publishedAt).getTime();
    if (!Number.isNaN(age) && age <= RECENCY_WINDOW_MS) {
      existing.recentCommentCount++;
    }

    if (item.sentiment === "positive") existing.positive++;
    else if (item.sentiment === "negative") existing.negative++;
    else existing.neutral++;

    // BUG FIX 5: track unique videoIds, not channelTitles
    existing.videoIds.add(item.videoId);

    existing.totalBotScore += item.botScore;
    // BUG FIX 2: track highest bot score seen for this author
    if (item.botScore > existing.maxBotScore) existing.maxBotScore = item.botScore;

    // Keep best available display name (non-empty, non-generic)
    if (item.author && item.author !== "Anonymous" && existing.displayName === "Anonymous") {
      existing.displayName = item.author;
    }
    if (!existing.authorChannelUrl && item.authorChannelUrl) {
      existing.authorChannelUrl = item.authorChannelUrl;
    }
    if (!existing.firstProofUrl && item.proofUrl) {
      existing.firstProofUrl = item.proofUrl;
    }

    authorMap.set(channelId, existing);
  }

  const CLASSIFICATION_COLORS: Record<string, string> = {
    supporter: "#22c55e",
    attacker: "#ef4444",
    neutral: "#a3a3a3",
  };

  const influencers: Influencer[] = [];

  for (const [, stats] of authorMap.entries()) {
    // BUG FIX 3: minimum 3 comments (2 is too few to establish a pattern)
    if (stats.commentCount < 3) continue;

    const avgBotScore = stats.totalBotScore / stats.commentCount;

    // BUG FIX 2: exclude if average OR peak bot score reaches "suspicious" threshold (≥40).
    // Previously the threshold was 60 (bot label cutoff) which let suspicious users through.
    // botDetection labels: human=0–39, suspicious=40–69, bot=70+
    // We exclude suspicious AND bot from influencer rankings.
    if (avgBotScore >= 40 || stats.maxBotScore >= 70) continue;

    const total = stats.commentCount;
    const sentimentRatio = total > 0 ? (stats.positive - stats.negative) / total : 0;

    // Classification thresholds — unchanged (validated correct)
    let classification: Influencer["classification"];
    if (sentimentRatio > 0.2) classification = "supporter";
    else if (sentimentRatio < -0.2) classification = "attacker";
    else classification = "neutral";

    // ── BUG FIX 4: Logarithmic activity score so high-volume users don't
    //    all cap out at the same value. log10(10)=1, log10(100)=2, log10(1000)=3.
    //    Scaled to 0–40 range (leaving room for other components).
    const activityScore = Math.min(40, Math.round(Math.log10(Math.max(1, stats.commentCount)) * 20));

    // ── BUG FIX 5: Diversity = unique videos commented on (not video-owner channels).
    //    A user who engages across 5 different videos shows broader reach.
    const diversityScore = Math.min(30, stats.videoIds.size * 5);

    // ── BUG FIX 6: Recency weight — recent commenters score higher.
    //    recentCommentCount / commentCount gives a 0–1 recency ratio.
    //    If 100% of comments are recent → +20 points. If 0% → +0.
    const recentRatio = stats.commentCount > 0 ? stats.recentCommentCount / stats.commentCount : 0;
    const recencyScore = Math.round(recentRatio * 20);

    // Sentiment conviction bonus — strong sentiment (either direction) = more signal
    const sentimentBonus = Math.max(0, Math.round(Math.abs(sentimentRatio) * 10));

    const influenceScore = Math.min(100, activityScore + diversityScore + recencyScore + sentimentBonus);

    // Reach: use total views of video-owner channels this author engaged with
    const engagedChannels = new Set(
      talkItems
        .filter((item) => {
          const id =
            (item as TalkItemRow & { authorChannelId?: string }).authorChannelId?.trim() ||
            item.authorChannelUrl?.trim() ||
            item.author;
          return id === ((talkItems.find((i) => i.authorChannelUrl === stats.authorChannelUrl || i.author === stats.displayName))
            ? stats.authorChannelUrl || stats.displayName : id);
        })
        .map((item) => item.channelTitle)
    );
    const reach = channelStats
      .filter((ch) => engagedChannels.has(ch.channelTitle))
      .reduce((s, ch) => s + ch.totalViews, 0) || stats.commentCount * 100;

    // Engagement rate from primary channel
    const primaryChannelStat = channelStats.find((ch) =>
      talkItems.some((item) => item.authorChannelUrl === stats.authorChannelUrl && item.channelTitle === ch.channelTitle)
    );
    const engagementRate =
      primaryChannelStat && primaryChannelStat.totalViews > 0
        ? parseFloat(((primaryChannelStat.totalLikes / primaryChannelStat.totalViews) * 100).toFixed(1))
        : 0;

    influencers.push({
      username: stats.displayName,
      classification,
      influence_score: influenceScore,
      reach,
      engagement_rate: engagementRate,
      impact_percentage: parseFloat(
        ((stats.commentCount / (talkItems.length || 1)) * 100).toFixed(1)
      ),
      recent_sentiment: (sentimentRatio + 1) / 2, // normalize to 0–1
      avatar_color: CLASSIFICATION_COLORS[classification] ?? "#a3a3a3",
      proof_url: stats.firstProofUrl,
      channel_url: stats.authorChannelUrl.replace(/^http:\/\//, "https://"),
    });
  }

  // Sort by influence score descending — highest impact first
  influencers.sort((a, b) => b.influence_score - a.influence_score);

  // Top 10 per category
  const supporters = influencers.filter((i) => i.classification === "supporter").slice(0, 10);
  const attackers  = influencers.filter((i) => i.classification === "attacker").slice(0, 10);
  const neutrals   = influencers.filter((i) => i.classification === "neutral").slice(0, 10);

  return { supporters, attackers, neutrals };
}

// ---------------------------------------------------------------------------
// 5. AUTHENTICITY REPORT
// ---------------------------------------------------------------------------

export function computeAuthenticity(data: IngestedData): AuthenticityReport {
  const { botCounts, talkItems } = data;
  const total = botCounts.total || 1;

  const botPercentage = parseFloat(
    ((botCounts.bot / total) * 100).toFixed(1)
  );
  const suspiciousPercentage = parseFloat(
    ((botCounts.suspicious / total) * 100).toFixed(1)
  );
  const genuinePercentage = parseFloat(
    (((total - botCounts.bot - botCounts.suspicious) / total) * 100).toFixed(1)
  );

  // Extract unique bot reason patterns
  const patternCounts = new Map<string, number>();
  for (const item of talkItems) {
    if (item.botLabel === "bot" || item.botLabel === "suspicious") {
      let reasons: string[] = [];
      try {
        const parsed = JSON.parse(item.botReasons);
        if (Array.isArray(parsed)) reasons = parsed;
      } catch {
        // ignore parse errors
      }
      for (const reason of reasons) {
        patternCounts.set(reason, (patternCounts.get(reason) ?? 0) + 1);
      }
    }
  }

  const patterns = Array.from(patternCounts.entries())
    .map(([type, count]) => ({
      type,
      count,
      severity:
        count > BOT_PATTERN_CRITICAL_THRESHOLD
          ? "critical"
          : count > BOT_PATTERN_HIGH_THRESHOLD
            ? "high"
            : count > BOT_PATTERN_MEDIUM_THRESHOLD
              ? "medium"
              : "low",
      proof_url: "",
    }))
    .sort((a, b) => b.count - a.count);

  // Confidence based on sample size
  let confidence = CONFIDENCE_MINIMUM;
  for (const tier of CONFIDENCE_THRESHOLDS) {
    if (total > tier.minSamples) {
      confidence = tier.confidence;
      break;
    }
  }

  return {
    bot_percentage: botPercentage + suspiciousPercentage,
    genuine_percentage: genuinePercentage,
    suspicious_accounts: botCounts.suspicious + botCounts.bot,
    total_analyzed: total,
    confidence,
    patterns,
  };
}

// ---------------------------------------------------------------------------
// 6. ACTION RECOMMENDER
// ---------------------------------------------------------------------------

export function recommendActions(data: IngestedData): ActionRecommendation[] {
  const score = computeReputationScore(data);
  const { sentimentCounts, botCounts, engagement } = data;
  const actions: ActionRecommendation[] = [];
  let actionId = 0;

  const total = sentimentCounts.total || 1;
  const negativeRatio = sentimentCounts.negative / total;
  const botRatio = (botCounts.bot + botCounts.suspicious) / (botCounts.total || 1);

  const PRIORITY_ICONS: Record<string, string> = {
    critical: "🚨",
    high: "⚠️",
    medium: "📋",
    low: "💡",
  };

  // Critical: Address negative sentiment crisis
  if (negativeRatio > 0.5) {
    actions.push({
      id: `act-${++actionId}`,
      priority: "critical",
      category: "Sentiment Management",
      title: "Address negative sentiment crisis",
      description: `Negative sentiment at ${(negativeRatio * 100).toFixed(1)}%. Issue public response to address key criticism themes. Engage with top critics constructively.`,
      expected_impact: "Could improve sentiment score by 15-25 points",
      icon: PRIORITY_ICONS.critical,
      proof_url: "",
    });
  }

  // High: Combat bot activity
  if (botRatio > 0.2) {
    actions.push({
      id: `act-${++actionId}`,
      priority: "high",
      category: "Bot Mitigation",
      title: "Investigate and counter bot activity",
      description: `${(botRatio * 100).toFixed(1)}% of engagement flagged as bot/suspicious. Report spam accounts. Enable stricter comment moderation on YouTube channels.`,
      expected_impact: "Could improve authenticity score by 10-20 points",
      icon: PRIORITY_ICONS.high,
      proof_url: "",
    });
  }

  // High: Boost engagement
  if (engagement.engagementRate < 1.0 && engagement.totalVideos > 0) {
    actions.push({
      id: `act-${++actionId}`,
      priority: "high",
      category: "Engagement Boost",
      title: "Improve audience engagement rate",
      description: `Current engagement rate is ${engagement.engagementRate.toFixed(2)}%. Create interactive content, respond to comments, and encourage discussion to boost engagement.`,
      expected_impact: "Could increase engagement by 30-50%",
      icon: PRIORITY_ICONS.high,
      proof_url: "",
    });
  }

  // Medium: Strengthen positive narratives
  if (score.breakdown.narrative_positivity < 60) {
    actions.push({
      id: `act-${++actionId}`,
      priority: "medium",
      category: "Narrative Strategy",
      title: "Strengthen positive narrative presence",
      description: `Positive narrative share is only ${score.breakdown.narrative_positivity}%. Publish positive content, share success stories, and amplify supporter voices.`,
      expected_impact: "Could shift narrative mix by 10-15%",
      icon: PRIORITY_ICONS.medium,
      proof_url: "",
    });
  }

  // Medium: Monitor influencer landscape
  if (score.breakdown.influencer_impact < 50) {
    actions.push({
      id: `act-${++actionId}`,
      priority: "medium",
      category: "Influencer Relations",
      title: "Develop influencer partnerships",
      description: "Identify and engage with key supporters. Build relationships with neutral influencers to expand positive coverage.",
      expected_impact: "Could improve influencer impact by 15-25 points",
      icon: PRIORITY_ICONS.medium,
      proof_url: "",
    });
  }

  // Low: Content strategy optimization
  if (engagement.totalVideos < 5) {
    actions.push({
      id: `act-${++actionId}`,
      priority: "low",
      category: "Content Strategy",
      title: "Increase content volume",
      description: `Only ${engagement.totalVideos} videos found. Increase content publishing frequency to improve visibility and engagement data coverage.`,
      expected_impact: "Could improve data confidence and trend accuracy",
      icon: PRIORITY_ICONS.low,
      proof_url: "",
    });
  }

  // Low: General monitoring
  actions.push({
    id: `act-${++actionId}`,
    priority: "low",
    category: "Monitoring",
    title: "Continue daily reputation monitoring",
    description:
      "Maintain regular monitoring of sentiment trends, bot activity, and narrative shifts. Set up alerts for critical threshold breaches.",
    expected_impact: "Ensures early detection of reputation risks",
    icon: PRIORITY_ICONS.low,
    proof_url: "",
  });

  return actions;
}

// ---------------------------------------------------------------------------
// 7. TREND PREDICTOR
// ---------------------------------------------------------------------------

export function predictTrends(data: IngestedData): PredictionsReport {
  const { talkItems, sentimentCounts } = data;
  const score = computeReputationScore(data);

  // Build historical data points — group by day
  const dayMap = new Map<string, { positive: number; negative: number; neutral: number; total: number }>();

  for (const item of talkItems) {
    const date = item.publishedAt?.slice(0, 10);
    if (!date) continue;
    const existing = dayMap.get(date) || { positive: 0, negative: 0, neutral: 0, total: 0 };
    existing.total++;
    if (item.sentiment === "positive") existing.positive++;
    else if (item.sentiment === "negative") existing.negative++;
    else existing.neutral++;
    dayMap.set(date, existing);
  }

  // Build historical scores
  const historical = Array.from(dayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30) // Last 30 days
    .map(([date, counts]) => {
      const t = counts.total || 1;
      const dayScore = Math.round(
        Math.min(100, Math.max(0, ((counts.positive - counts.negative) / t + 1) * 50))
      );
      return { date, score: dayScore };
    });

  // Generate forecasts using simple linear regression on recent trend
  const recentScores = historical.slice(-7).map((h) => h.score);
  const avgRecent =
    recentScores.length > 0
      ? recentScores.reduce((s, v) => s + v, 0) / recentScores.length
      : score.score;

  // Simple trend: compare recent average to overall
  const overallAvg =
    historical.length > 0
      ? historical.reduce((s, h) => s + h.score, 0) / historical.length
      : score.score;

  const trendDelta = avgRecent - overallAvg;
  const trendDirection: "improving" | "stable" | "declining" =
    trendDelta > 3 ? "improving" : trendDelta < -3 ? "declining" : "stable";

  // Generate forecast data points
  const forecast24h = Math.round(
    Math.min(100, Math.max(0, avgRecent + trendDelta * 0.5))
  );
  const forecast48h = Math.round(
    Math.min(100, Math.max(0, avgRecent + trendDelta * 1.0))
  );
  const forecast7d = Math.round(
    Math.min(100, Math.max(0, avgRecent + trendDelta * 2.0))
  );

  // Confidence band: wider when trend is strong (more uncertainty in projection),
  // narrower when stable. Graduated 5..25 range — not capped at 15.
  // More data → slightly tighter band (sample confidence).
  const dataBonusFactor = Math.min(1, historical.length / 14); // 0..1 over 2 weeks
  const rawConfidence = Math.abs(trendDelta) * 1.5 + 5;
  const confidence = Math.round(Math.max(5, Math.min(30, rawConfidence)) * (1 - dataBonusFactor * 0.3));

  const forecasts = [
    {
      horizon: "24 hours",
      predicted_score: forecast24h,
      confidence_lower: Math.max(0, forecast24h - confidence),
      confidence_upper: Math.min(100, forecast24h + confidence),
      trend: trendDirection,
    },
    {
      horizon: "48 hours",
      predicted_score: forecast48h,
      confidence_lower: Math.max(0, forecast48h - confidence * 1.5),
      confidence_upper: Math.min(100, forecast48h + confidence * 1.5),
      trend: trendDirection,
    },
    {
      horizon: "7 days",
      predicted_score: forecast7d,
      confidence_lower: Math.max(0, forecast7d - confidence * 2),
      confidence_upper: Math.min(100, forecast7d + confidence * 2),
      trend: trendDirection,
    },
  ];

  // Risk forecast text
  const total = sentimentCounts.total || 1;
  const negRatio = sentimentCounts.negative / total;
  let riskForecast: string;
  if (trendDirection === "declining" && negRatio > 0.3) {
    riskForecast = `Elevated risk: Negative sentiment trend detected with ${(negRatio * 100).toFixed(1)}% negative comments. Score is expected to continue declining. Proactive engagement recommended.`;
  } else if (trendDirection === "improving") {
    riskForecast = `Positive trajectory: Reputation score trending upward. Current momentum suggests continued improvement if positive engagement is maintained.`;
  } else {
    riskForecast = `Stable outlook: Reputation metrics are within normal ranges. Continue monitoring for any emerging risks or opportunities.`;
  }

  return {
    forecasts,
    historical,
    risk_forecast: riskForecast,
  };
}

// ---------------------------------------------------------------------------
// 8. CAMPAIGN TRACKER
// ---------------------------------------------------------------------------

export function trackCampaign(data: IngestedData): CampaignReport {
  const { engagement, sentimentCounts, botCounts, talkItems } = data;

  // ── Real before/after split: partition comments by age.
  //    "After"  = last 7 days  (the campaign window)
  //    "Before" = 8–30 days ago (the baseline)
  //    Falls back to degradation factor when insufficient history.
  const now = Date.now();
  const CAMPAIGN_WINDOW_MS = 7 * MS_PER_DAY;
  const BASELINE_WINDOW_MS = 30 * MS_PER_DAY;

  let beforePositive = 0, beforeNegative = 0, beforeNeutral = 0, beforeTotal = 0;
  let afterPositive  = 0, afterNegative  = 0, afterNeutral  = 0, afterTotal  = 0;

  for (const item of talkItems) {
    const age = now - new Date(item.publishedAt).getTime();
    if (Number.isNaN(age)) continue;
    if (age <= CAMPAIGN_WINDOW_MS) {
      afterTotal++;
      if (item.sentiment === "positive") afterPositive++;
      else if (item.sentiment === "negative") afterNegative++;
      else afterNeutral++;
    } else if (age <= BASELINE_WINDOW_MS) {
      beforeTotal++;
      if (item.sentiment === "positive") beforePositive++;
      else if (item.sentiment === "negative") beforeNegative++;
      else beforeNeutral++;
    }
  }

  // If we don't have enough data in both windows, fall back to degradation factor
  const hasRealBaseline = beforeTotal >= 10 && afterTotal >= 5;

  // Compute reputation scores for both windows
  const makePartialData = (pos: number, neg: number, neu: number, total: number) => ({
    ...data,
    sentimentCounts: { positive: pos, negative: neg, neutral: neu, total },
    botCounts: total > 0
      ? { ...data.botCounts }   // bot counts are global; use as-is
      : { human: 0, suspicious: 0, bot: 0, total: 0 },
  });

  const scoreAfter  = computeReputationScore(
    hasRealBaseline ? makePartialData(afterPositive, afterNegative, afterNeutral, afterTotal || 1) : data
  );
  const scoreBefore = hasRealBaseline
    ? computeReputationScore(makePartialData(beforePositive, beforeNegative, beforeNeutral, beforeTotal || 1))
    : (() => {
        const s = scoreAfter.score;
        return { ...scoreAfter, score: Math.round(s * BASELINE_DEGRADATION_FACTOR),
          breakdown: Object.fromEntries(
            Object.entries(scoreAfter.breakdown).map(([k, v]) => [k, Math.round((v as number) * BASELINE_DEGRADATION_FACTOR)])
          ) as typeof scoreAfter.breakdown
        };
      })();

  // Helper: safe % change
  const pct = (after: number, before: number) =>
    parseFloat(before === 0 ? "0" : (((after - before) / Math.abs(before)) * 100).toFixed(1));

  // Sentiment counts — use window counts or fall back
  const sentAfter  = hasRealBaseline ? afterPositive  : sentimentCounts.positive;
  const sentBefore = hasRealBaseline ? beforePositive : Math.round(sentimentCounts.positive * BASELINE_DEGRADATION_FACTOR);

  // Engagement rate — approximate from video data (no window split available)
  const engAfter  = engagement.engagementRate;
  const engBefore = parseFloat((engagement.engagementRate * (hasRealBaseline ? 0.9 : BASELINE_DEGRADATION_FACTOR)).toFixed(2));

  const metrics = [
    (() => {
      const before = scoreBefore.score, after = scoreAfter.score, change = after - before;
      return { name: "Reputation Score", before, after, change, change_percentage: pct(after, before), proof_url: "" };
    })(),
    (() => {
      const change = sentAfter - sentBefore;
      return { name: "Positive Sentiment", before: sentBefore, after: sentAfter, change, change_percentage: pct(sentAfter, sentBefore), proof_url: "" };
    })(),
    (() => {
      const change = parseFloat((engAfter - engBefore).toFixed(2));
      return { name: "Engagement Rate", before: engBefore, after: engAfter, change, change_percentage: pct(engAfter, engBefore), proof_url: "" };
    })(),
    (() => {
      const before = scoreBefore.breakdown.bot_detection, after = scoreAfter.breakdown.bot_detection, change = after - before;
      return { name: "Bot Safety Score", before, after, change, change_percentage: pct(after, before), proof_url: "" };
    })(),
    (() => {
      const before = Math.round(engagement.totalViews * BASELINE_DEGRADATION_FACTOR), after = engagement.totalViews, change = after - before;
      return { name: "Total Reach", before, after, change, change_percentage: pct(after, before), proof_url: "" };
    })(),
  ];

  const improved = metrics.filter((m) => m.change > 0).length;
  const declined = metrics.filter((m) => m.change < 0).length;

  let status: CampaignReport["status"];
  if (improved > declined) status = "positive";
  else if (declined > improved) status = "negative";
  else status = "neutral";

  const impactScore = Math.round(
    metrics.reduce((s, m) => s + Math.min(100, Math.max(-100, m.change_percentage)), 0) /
      metrics.length
  );

  const assessment =
    status === "positive"
      ? `Campaign showing positive results with ${improved} out of ${metrics.length} metrics improving. Overall impact score: ${impactScore}%.`
      : status === "negative"
        ? `Campaign performance below expectations. ${declined} metrics declined. Review strategy and adjust approach.`
        : "Campaign results are mixed. Some metrics improved while others declined. Further analysis recommended.";

  const recommendations: string[] = [];
  if (scoreAfter.score < 60) {
    recommendations.push(
      "Focus on sentiment improvement campaigns to boost overall reputation score"
    );
  }
  if (engagement.engagementRate < 2) {
    recommendations.push(
      "Increase interactive content to boost engagement rates"
    );
  }
  if (botCounts.bot + botCounts.suspicious > botCounts.total * 0.15) {
    recommendations.push(
      "Implement bot mitigation strategies to improve authenticity metrics"
    );
  }
  recommendations.push(
    "Continue monitoring key metrics daily to track campaign effectiveness"
  );
  recommendations.push(
    "Set up automated alerts for significant metric changes"
  );

  return {
    campaign_name: "Reputation Enhancement Campaign",
    impact_score: Math.max(0, Math.min(100, 50 + impactScore)),
    status,
    metrics,
    assessment,
    recommendations,
  };
}

// ---------------------------------------------------------------------------
// UNIFIED INTELLIGENCE — Single function to get all processed data
// ---------------------------------------------------------------------------

export interface ReputationIntelligence {
  score: ReputationScore;
  alerts: Alert[];
  narratives: NarrativeCluster[];
  influencers: { supporters: Influencer[]; attackers: Influencer[]; neutrals: Influencer[] };
  authenticity: AuthenticityReport;
  actions: ActionRecommendation[];
  predictions: PredictionsReport;
  campaigns: CampaignReport;
  processedAt: string;
}

/**
 * Process all reputation intelligence from ingested data.
 * This is the single source of truth for all features.
 */
export function processIntelligence(data: IngestedData): ReputationIntelligence {
  return {
    score: computeReputationScore(data),
    alerts: generateAlerts(data),
    narratives: buildNarratives(data),
    influencers: analyzeInfluencers(data),
    authenticity: computeAuthenticity(data),
    actions: recommendActions(data),
    predictions: predictTrends(data),
    campaigns: trackCampaign(data),
    processedAt: new Date().toISOString(),
  };
}
