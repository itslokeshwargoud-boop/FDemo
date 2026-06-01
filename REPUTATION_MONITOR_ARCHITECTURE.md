# Reputation Monitor: Complete Architecture & Data Flow Analysis

## Executive Summary

The Reputation Monitor is a sophisticated reputation management platform composed of two integrated systems:

1. **Talk System**: Real-time YouTube comment aggregation, sentiment analysis, and bot detection
2. **Feed System**: YouTube video search, metrics aggregation, and trend analysis

Both systems are driven by keyword-based monitoring with sentiment classification, bot detection, and reputation scoring. The platform uses FastAPI + PostgreSQL for the reputation-monitor backend, with a Next.js frontend consuming APIs.

---

## System Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    REPUTATION MONITOR STACK                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │               BACKEND (FastAPI + PostgreSQL)             │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ ┌──────────────────────────────────────────────────────┐ │  │
│  │ │ API Routes (v1)                                      │ │  │
│  │ │ - /keywords (CRUD, create triggers collection)       │ │  │
│  │ │ - /posts (paginated, filtered, sentiment-joined)     │ │  │
│  │ │ - /sentiment/... (summary, timeline)                 │ │  │
│  │ │ - /attackers (risk-scored authors)                   │ │  │
│  │ │ - /clusters (coordinated attack detection)           │ │  │
│  │ │ - /scores (reputation scores)                        │ │  │
│  │ │ - WS /ws/live/{keyword} (Redis Pub/Sub)              │ │  │
│  │ └──────────────────────────────────────────────────────┘ │  │
│  │                           ▲                                │  │
│  │                           │                                │  │
│  │ ┌──────────────────────┬──┴────────────────────────────┐ │  │
│  │ │  Pipeline (Celery)   │  Database Layer              │ │  │
│  │ │ ┌──────────────────┐  │ ┌──────────────────────────┐ │ │  │
│  │ │ │ collect_task     │  │ │ SQLAlchemy ORM Models    │ │ │  │
│  │ │ │ process_task     │  │ │ - Keyword (unique)       │ │ │  │
│  │ │ │ analyze_task     │  │ │ - Post (keyword FK)      │ │ │  │
│  │ │ │ detection_task   │  │ │ - SentimentResult        │ │ │  │
│  │ │ └──────────────────┘  │ │ - TrackedAuthor (risk)   │ │ │  │
│  │ │  [Scheduler]          │ │ - ReputationScore        │ │ │  │
│  │ │                        │ │ - AttackCluster          │ │ │  │
│  │ │  collect every 30min   │ └──────────────────────────┘ │ │  │
│  │ │  stats every 10s       │                              │ │  │
│  │ │  scores hourly         │  PostgreSQL + Redis + SQLite │ │  │
│  │ └──────────────────────┴────────────────────────────────┘ │  │
│  └──────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │        FRONTEND (Next.js + React)                        │  │
│  ├──────────────────────────────────────────────────────────┤  │
│  │ Pages (Reputation OS layout)                             │  │
│  │ - /reputation-os/feed  (YouTube search + metrics)        │  │
│  │ - /reputation-os/talk  (comment sentiment + bot check)   │  │
│  │ - /reputation-os/...   (other analysis views)            │  │
│  │                                                           │  │
│  │ Hooks                                                     │  │
│  │ - useDashboardData() → /api/metrics (YouTube data)       │  │
│  │ - useTalkData() → /api/talk (aggregated comments)        │  │
│  │                                                           │  │
│  │ APIs (Next.js backend handlers)                          │  │
│  │ - /api/youtube (YouTube search, stats)                   │  │
│  │ - /api/talk (comment fetch/cache/sentiment/bot)          │  │
│  │ - /api/metrics (video aggregation + KPIs)                │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. TALK SYSTEM: Comment Aggregation & Analysis

### Overview
The Talk system collects YouTube comments for a given keyword, analyzes their sentiment, detects bot activity, and displays results with pagination and filtering.

### Data Flow: Complete Pipeline

```
User searches keyword
         │
         ▼
   /api/talk handler (Next.js)
         │
         ├─→ fetchYouTubeVideos(keyword)
         │   - Search YouTube API for videos matching keyword (max 12)
         │   - Fetch video stats (views, likes, comments count)
         │   - Returns: { id, title, channelTitle, publishedAt, viewCount, likeCount, commentCount, thumbnailUrl }
         │
         ├─→ aggregateTalkItems(keyword, videos)
         │   │
         │   ├─→ For each video:
         │   │   - Check video_fetch_status (SQLite)
         │   │   - Skip if fullyFetched = 1
         │   │   - Fetch comment pages via YouTube API
         │   │     (max 5 pages × 100 comments = 500 per video)
         │   │   - Stop when reachedMAX_ITEMS_TARGET (6000 total)
         │   │
         │   ├─→ Sentiment Analysis (batch):
         │   │   - Texts → HuggingFace API (tabularisai/multilingual-sentiment)
         │   │   - Fallback to lexicon if API fails
         │   │   - Normalize labels to: positive | negative | neutral
         │   │
         │   ├─→ Bot Detection (batch):
         │   │   - scoreBotBatch() per comment
         │   │   - Signals: duplicate text, burst timing, URLs, generic text, emoji ratio
         │   │   - Output: { botScore, botLabel, botReasons }
         │   │
         │   └─→ Proof Validation & Storage:
         │       - Validate YouTube comment proof URLs
         │       - Insert into talk_items table (SQLite)
         │       - Build URL: https://www.youtube.com/watch?v={videoId}&lc={commentId}
         │
         └─→ Query & Return:
             - Filter by sentiment (optional)
             - Filter by bot label (optional)
             - Text search (optional)
             - Sort: newest (default) | oldest
             - Pagination: page + limit (max 100)
             - Return sentiment counts
             - Total items in database for keyword
```

### Database Schema (SQLite)

**talk_items table:**
```sql
CREATE TABLE talk_items (
  commentId        TEXT PRIMARY KEY,
  videoId          TEXT NOT NULL,
  text             TEXT NOT NULL,
  author           TEXT NOT NULL DEFAULT '',
  authorChannelUrl TEXT NOT NULL DEFAULT '',
  publishedAt      TEXT NOT NULL DEFAULT '',
  videoTitle       TEXT NOT NULL DEFAULT '',
  channelTitle     TEXT NOT NULL DEFAULT '',
  sentiment        TEXT NOT NULL (positive|negative|neutral),
  proofUrl         TEXT NOT NULL,
  keyword          TEXT NOT NULL DEFAULT '',
  fetchedAt        TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  botScore         INTEGER NOT NULL DEFAULT 0,
  botLabel         TEXT NOT NULL DEFAULT 'human' (human|suspicious|bot),
  botReasons       TEXT NOT NULL DEFAULT '[]'  -- JSON array
);

-- Indexes
CREATE INDEX idx_talk_keyword      ON talk_items(keyword);
CREATE INDEX idx_talk_sentiment    ON talk_items(sentiment);
CREATE INDEX idx_talk_videoId      ON talk_items(videoId);
CREATE INDEX idx_talk_publishedAt  ON talk_items(publishedAt);
CREATE INDEX idx_talk_botLabel     ON talk_items(botLabel);
```

**video_fetch_status table:**
```sql
CREATE TABLE video_fetch_status (
  videoId       TEXT NOT NULL,
  keyword       TEXT NOT NULL,
  nextPageToken TEXT,
  totalFetched  INTEGER NOT NULL DEFAULT 0,
  lastFetchedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fullyFetched  INTEGER NOT NULL DEFAULT 0,  -- 0 or 1
  PRIMARY KEY (videoId, keyword)
);
```

### Filtering & Pagination Logic

**Query Parameters:**
- `keyword` (required) – search term
- `page` (default 1) – page number
- `limit` (default 50, max 100) – items per page
- `sentiment` (optional) – "positive" | "negative" | "neutral"
- `bot` (optional) – "human" | "suspicious" | "bot"
- `search` (optional) – text search within comments
- `sort` (default "newest") – "newest" | "oldest"

**Query execution:**
```javascript
// Sentiment count aggregation
SELECT sentiment, COUNT(*) FROM talk_items
  WHERE keyword = ?
  GROUP BY sentiment;

// Paginated results
SELECT * FROM talk_items
  WHERE keyword = ? 
    AND (sentiment = ? OR ? IS NULL)
    AND (botLabel = ? OR ? IS NULL)
    AND (text LIKE ? OR ? IS NULL)
  ORDER BY publishedAt DESC (or ASC)
  LIMIT ? OFFSET ?;
```

### Sentiment Analysis Strategy

**Primary:** HuggingFace Inference API
- Model: `tabularisai/multilingual-sentiment-analysis`
- Multilingual support (comments from any language)
- Label normalization:
  - "Very Positive", "Positive" → "positive"
  - "Very Negative", "Negative" → "negative"
  - "Neutral" → "neutral"
  - Star ratings: 4-5 stars → positive, 3 → neutral, 1-2 → negative

**Fallback:** Simple lexicon-based analysis (if API fails)
- Reduced accuracy but service continuity

**Batch processing:** 32 comments at a time
- Reduces API calls
- Faster inference

### Bot Detection System

**Heuristic-based scoring (0-100):**

1. **Duplicate Text Detection**
   - Flag if multiple commenters post identical/near-identical text
   - Threshold: 90% similarity

2. **Burst Activity**
   - Multiple posts from same author within 60 seconds
   - Requires 3+ posts in window

3. **Text Similarity**
   - Different authors posting 75-90% similar text
   - Signal of coordinated activity

4. **Generic/Low-Quality Comments**
   - "nice", "cool", "wow", "first" – generic comments
   - Very short (< 5 words) with low info content

5. **URL Presence**
   - Comments containing URLs or spam keywords
   - Keywords: "subscribe", "telegram", "crypto", "make money", etc.

6. **Emoji Ratio**
   - High emoji-to-text ratio

7. **Repeated Characters**
   - "lol@@@@" or "hellooooo" – pad detection

**Output:**
```typescript
{
  botScore: 0-100,
  botLabel: "human" | "suspicious" | "bot",
  botReasons: string[]  // e.g. ["Duplicate_text", "Burst_activity"]
}
```

**Decision:**
- botScore < 30 → "human"
- 30 ≤ botScore < 70 → "suspicious"
- botScore ≥ 70 → "bot"

### Caching Mechanism

**SQLite Talk Cache:**
- Lives at: `<project-root>/data/talk_cache.db`
- Uses WAL (Write-Ahead Logging) for concurrency
- Persistent across requests
- On Vercel: falls back to `/tmp` (writable)

**Cache invalidation:**
- Not time-based – no TTL
- New keyword → fresh fetch starts at page 1
- Existing keyword → continues from `nextPageToken`
- `fullyFetched` flag prevents re-fetching same video

**Performance:**
- Index on `keyword` allows fast lookups
- Index on `sentiment` + `botLabel` for filtering
- Composite queries execute in ms

### Frontend Implementation

**Hook: `useTalkData(initialKeyword)`**
```typescript
const {
  keyword,              // user input
  setKeyword,           // update search box
  search,               // trigger fetch
  items,                // TalkItem[]
  total,                // paginated result count
  totalTalkItems,       // total in database for keyword
  sentiment Counts,    // { positive, negative, neutral }
  page,                 // current page
  totalPages,           // calculated
  limit,                // items per page
  goToPage,             // update page
  sentimentFilter,      // active filter
  setSentimentFilter,   // toggle filter
  botFilter,            // active filter
  setBotFilter,         // toggle filter
  searchQuery,          // text search
  setSearchQuery,       // update search
  sortOrder,            // newest or oldest
  setSortOrder,         // toggle
  isLoading,            // true while fetching
  error,                // error message
  hasSearched,          // true after first search
  refresh,              // refetch with same params
} = useTalkData(initialKeyword);
```

**Component: `TalkCard`**
- Shows avatar: first letter of author name
- Shows sentiment badge with emoji (👍👎😐)
- Shows bot badge with score and reasons popup
- Displays comment text (line-clamp-3)
- Footer: video title, channel, proof link
- Vote counts: not shown (YouTube comments don't have votes)

**Sentiment Summary:**
- 3-column card layout
- Each card shows count + percentage
- Click to toggle filter
- Active filter shows rose-500 ring

---

## 2. FEED SYSTEM: Video Search & Metrics

### Overview
The Feed system searches YouTube for videos matching a keyword, aggregates statistics, and displays video results with KPIs (KPI = Key Performance Indicators).

### Data Flow

```
User enters keyword + clicks search
         │
         ▼
   /api/metrics handler
         │
         ├─→ fetchYouTubeVideos(keyword)
         │   - YouTube API search (max 12 videos)
         │   - Fetch statistics for each
         │   - Returns: YouTubeVideo[]
         │
         ├─→ computeKPIs(videos)
         │   - totalVideos
         │   - totalViews = SUM(viewCount)
         │   - totalLikes = SUM(likeCount)
         │   - totalComments = SUM(commentCount)
         │   - avgViewsPerVideo = totalViews / totalVideos
         │   - avgLikesPerVideo = totalLikes / totalVideos
         │   - engagementRate = (totalLikes / totalViews) * 100
         │
         ├─→ computeChannelBreakdown(videos)
         │   - Group by channelTitle
         │   - Sum views per channel
         │   - Sort by totalViews DESC
         │   - Returns: ChannelBreakdown[]
         │
         ├─→ computeTrend(videos)
         │   - Group by month (YYYY-MM)
         │   - Sum views, likes, video count per month
         │   - Take last 7 months (or all if < 7)
         │   - Format: { date: "Jan", views, likes, videos }
         │
         └─→ Return with cache headers:
             Cache-Control: public, s-maxage=60, stale-while-revalidate=120
```

### API Response Model

```typescript
interface YouTubeVideo {
  id: string;
  title: string;
  channelTitle: string;
  publishedAt: string;           // ISO 8601
  thumbnailUrl: string;
  description?: string;
  proofUrl: string;              // Modified URL for proof validation
  viewCount: number;
  likeCount: number;
  commentCount: number;
}

interface MetricsKPI {
  totalVideos: number;
  totalViews: number;
  totalLikes: number;
  totalComments: number;
  avgViewsPerVideo: number;
  avgLikesPerVideo: number;
  engagementRate: number;        // percentage
}

interface ChannelBreakdown {
  channel: string;
  videoCount: number;
  totalViews: number;
}

interface TrendPoint {
  date: string;                  // "Jan", "Feb", etc.
  views: number;
  likes: number;
  videos: number;
}

interface MetricsPayload {
  success: boolean;
  keyword: string;
  videos: YouTubeVideo[];
  kpis: MetricsKPI;
  channelBreakdown: ChannelBreakdown[];
  trend: TrendPoint[];
  error?: string;
}
```

### Sorting & Filtering

**Current State:**
- No explicit sorting/filtering in the feed
- Fixed: Returns top 12 videos from YouTube search API
- Search API default ranking: relevance, then by view count

**Potential Filtering:**
- By publish date (in code: available but not exposed)
- By channel (in code: available but not exposed)
- By view count (would require client-side sort)

**YouTube API constraints:**
- Max results per query: 12 videos
- No direct sorting by engagement rate or comment count
- Sorting must be done client-side if needed

### Caching

**HTTP Cache Headers:**
- Browser cache: 60 seconds (s-maxage=60)
- CDN stale-while-revalidate: 120 seconds
- Protects against request spikes

**No database cache:**
- Metrics are computed fresh on each request
- Videos fetched fresh from YouTube API
- No persistent storage in Reputation Monitor backend

---

## 3. BACKEND API ROUTES (FastAPI)

### URL Structure
```
/api/v1/keywords       - keyword CRUD (triggers collection)
/api/v1/posts          - posts search/pagination
/api/v1/sentiment/...  - sentiment aggregation + timeline
/api/v1/attackers      - flagged authors with risk scores
/api/v1/clusters       - coordinated attack clusters
/api/v1/scores         - reputation scores
/api/v1/alerts         - alert management
/ws/live/{keyword}     - WebSocket live feed (Redis-backed)
```

### Key Routes

#### POST /api/v1/keywords
**Create a keyword:**
```python
body: { keyword: str }
response: KeywordResponse
```
- Validates keyword is not empty
- Checks uniqueness
- Creates record in `keywords` table
- **Triggers immediate collection** via `collect_keyword.delay()`
- **Triggers hourly collection** via scheduler

#### GET /api/v1/posts/{keyword}
**Search posts with pagination:**
```python
query params:
  - page: int (default 1, min 1)
  - page_size: int (default 20, max 100)
  - sentiment: str | null (positive|negative|neutral)
  - platform: str | null (twitter|instagram|reddit|youtube)
  - date_from: datetime | null
  - date_to: datetime | null
```

**Execution:**
```sql
SELECT Post, SentimentResult
  FROM posts
  OUTERJOIN sentiment_results ON sentiment_results.post_id = posts.id
  WHERE keyword_id = ?
    AND (platform = ? OR NULL)
    AND (posted_at >= ? OR NULL)
    AND (posted_at <= ? OR NULL)
    AND (sentiment = ? OR NULL)
  ORDER BY posted_at DESC
  LIMIT ? OFFSET ?
```

**Response:**
```python
{
  items: PostResponse[],
  total: int,
  page: int,
  page_size: int
}

# PostResponse includes:
{
  id, platform, post_id, author_name, followers_count,
  content, posted_at, url, likes_count, replies_count,
  shares_count, language,
  sentiment, confidence  # from join
}
```

#### GET /api/v1/sentiment/{keyword}
**Sentiment summary:**
```python
response: SentimentSummary
{
  keyword: str,
  positive_count: int,
  negative_count: int,
  neutral_count: int,
  total_count: int,
  negative_ratio: float,
  score: float,             # -100 to +100
  risk_level: str           # low | moderate | high | critical
}
```

#### GET /api/v1/timeline/{keyword}
**Hourly sentiment breakdown (last 7 days):**
```python
response: TimelineDataPoint[]
[
  {
    hour: datetime,
    positive: int,
    negative: int,
    neutral: int
  },
  ...
]
```

#### GET /api/v1/attackers/{keyword}
**Flagged authors with risk scores:**
```python
query params:
  - page: int (default 1)
  - page_size: int (default 20)
  - platform: str | null
  - flagged_only: bool (default false)

response: PaginatedResponse[TrackedAuthorResponse]
{
  items: [
    {
      id, platform, author_id, author_name, followers_count,
      negative_post_count, risk_score, is_flagged, last_seen_at
    }
  ],
  total, page, page_size
}
```

**Sorting:** `TrackedAuthor.risk_score DESC`

#### WS /ws/live/{keyword}
**WebSocket live feed with Redis Pub/Sub:**
- Connect: `ws://host/ws/live/{keyword}?token={jwt}`
- JWT validated before accepting connection
- Subscribe to Redis channel: `live:{keyword_normalized}`
- Broadcasts:
  1. `event: "new_post"` – when new sentiment result published
  2. `event: "stats_update"` – hourly stats refresh
  3. `event: "connected"` – on connect

---

## 4. BACKEND PIPELINE (Celery + Scheduler)

### Collection Pipeline

```
User creates keyword
         │
         ▼
   Scheduler triggers: collect-all-active-keywords
   (every 30 minutes = COLLECTION_INTERVAL_SECONDS)
         │
         ▼
   collect_all_active_keywords (Celery task)
         │
         └─→ For each active keyword:
             collect_keyword.delay(keyword_id, keyword)
                     │
                     ▼
                For each platform (Twitter, Instagram, Reddit, etc.):
                  - fetch posts for last 24 hours
                  - Collect platform-specific data
                  - Return list[CollectedPost]
                     │
                     ▼
                process_posts.delay(keyword_id, keyword, posts_data)
                     │
                     ├─→ Step 1: Normalize (lowercase, collapse whitespace)
                     ├─→ Step 2: Deduplicate (check if post exists in DB)
                     ├─→ Step 3: Language detection (langdetect)
                     ├─→ Step 4: Translate non-English → English (Google)
                     ├─→ Step 5: Spam filter (< 5 words or < 10 chars after cleanup)
                     ├─→ Step 6: Strip emojis
                     └─→ Save to Post table
                            │
                            ▼
                analyze_posts.delay(keyword_id, keyword, posts_data)
                     │
                     ├─→ Batch sentiment analysis (SentimentEngine)
                     ├─→ Save SentimentResult records
                     ├─→ Publish to Redis live channel
                     └─→ run_detection.delay(keyword_id, keyword)
                            │
                            ▼
                     run_detection (async)
                     ├─→ Group by author, count negative posts
                     ├─→ Update TrackedAuthor: risk_score, is_flagged
                     ├─→ Detect coordinated clusters (AttackDetector)
                     └─→ Trigger AlertManager.check_and_trigger_alerts()
```

### Scheduler Configuration

```python
app.conf.beat_schedule = {
    'collect-all-active-keywords': {
        'task': 'pipeline.tasks.collect_task.collect_all_active_keywords',
        'schedule': COLLECTION_INTERVAL_SECONDS,  # 1800 (30 min)
    },
    'broadcast-stats-for-all-keywords': {
        'task': 'pipeline.tasks.analyze_task.broadcast_stats_for_all_keywords',
        'schedule': STATS_BROADCAST_INTERVAL_SECONDS,  # 30 seconds
    },
    'compute-daily-scores': {
        'task': 'pipeline.tasks.analyze_task.compute_daily_scores',
        'schedule': crontab(minute=0),  # every hour
    },
}
```

### Data Processing Tasks

#### collect_task.py
```python
def collect_keyword(keyword_id, keyword):
    """Fetch posts from all platforms for a keyword."""
    since = datetime.utcnow() - timedelta(hours=24)
    collectors = get_all_collectors()  # [TwitterCollector, InstagramCollector, ...]
    
    for collector in collectors:
        posts = collector.collect(keyword, since)
        # posts: list[CollectedPost]
        #   - platform, post_id, author_id, author_name, followers_count
        #   - content, posted_at, url, likes_count, replies_count, shares_count
```

#### process_task.py
```python
async def _process_posts_async(keyword_id, keyword, posts_data):
    """6-step processing pipeline."""
    for post in posts_data:
        # 1. Normalize
        content = normalize_text(post['content'])
        
        # 2. Deduplicate
        if await is_duplicate(db, post['platform'], post['post_id']):
            continue
        
        # 3. Language detection
        lang = detect_language(content)
        
        # 4. Translate if non-English
        if lang != 'en':
            content = translate_to_english(content, lang)
        
        # 5. Spam filter
        if is_spam(content):
            continue
        
        # 6. Strip emojis
        content_for_analysis = strip_emojis(content)
        
        # Save to DB
        post_obj = Post(
            keyword_id=keyword_id,
            platform=post['platform'],
            post_id=post['post_id'],
            author_id=post['author_id'],
            author_name=post['author_name'],
            followers_count=post['followers_count'],
            content=original_content,
            posted_at=posted_at,
            language=lang,
            # ... other fields
        )
        db.add(post_obj)
```

#### analyze_task.py – broadcast_stats_for_all_keywords
```python
async def _broadcast_stats_async():
    """Publish sentiment stats to all keyword channels every 30 seconds."""
    redis_client = aioredis.from_url(REDIS_URL)
    
    for keyword in active_keywords:
        # Count sentiments in last hour
        result = (
            select(SentimentResult.sentiment, func.count())
            .join(Post.id == SentimentResult.post_id)
            .where(Post.keyword_id == keyword.id, Post.posted_at >= one_hour_ago)
            .group_by(SentimentResult.sentiment)
        )
        counts = {row[0]: row[1] for row in result}
        
        positive = counts.get('positive', 0)
        negative = counts.get('negative', 0)
        neutral = counts.get('neutral', 0)
        score_data = calculate_reputation_score(positive, negative, neutral)
        
        channel = f"live:{keyword.keyword.lower().replace(' ', '_')}"
        message = {
            "event": "stats_update",
            "data": {
                "positive_count": positive,
                "negative_count": negative,
                "neutral_count": neutral,
                "reputation_score": score_data['score'],
                "negative_ratio": score_data['negative_ratio'],
                "risk_level": score_data['risk_level'],
                "total_last_hour": positive + negative + neutral,
            }
        }
        await redis_client.publish(channel, json.dumps(message))
```

#### analyze_task.py – compute_daily_scores
```python
async def _compute_daily_scores_async():
    """Compute hourly reputation scores for all keywords."""
    for keyword in active_keywords:
        counts = (
            select(SentimentResult.sentiment, func.count())
            .join(Post.id == SentimentResult.post_id)
            .where(Post.keyword_id == keyword.id)
            .group_by(SentimentResult.sentiment)
        )
        counts_dict = {row[0]: row[1] for row in counts}
        positive = counts_dict.get('positive', 0)
        negative = counts_dict.get('negative', 0)
        neutral = counts_dict.get('neutral', 0)
        
        score_data = calculate_reputation_score(positive, negative, neutral)
        
        score = ReputationScore(
            keyword_id=keyword.id,
            score=score_data['score'],
            positive_count=positive,
            negative_count=negative,
            neutral_count=neutral,
            total_count=positive + negative + neutral,
            negative_ratio=score_data['negative_ratio'],
            risk_level=score_data['risk_level'],
        )
        db.add(score)
```

---

## 5. DATABASE SCHEMA (PostgreSQL)

### Core Models

```python
# Keyword
class Keyword(Base):
    id: UUID = PK()
    keyword: str = UNIQUE | TEXT | NOT NULL
    created_at: datetime = DateTime | NOT NULL | DEFAULT NOW
    is_active: bool = Boolean | DEFAULT TRUE
    owner_user_id: UUID | NULL

    relationships:
        posts: list[Post]
        reputation_scores: list[ReputationScore]
        attack_clusters: list[AttackCluster]
        alerts: list[Alert]

# Post
class Post(Base):
    id: UUID = PK()
    keyword_id: UUID = FK(keywords.id) | ON DELETE CASCADE | INDEX
    platform: str = String(50) | NOT NULL | INDEX
    post_id: str = String(255) | NOT NULL
    author_id: str = String(255) | NOT NULL | INDEX
    author_name: str = String(255) | NOT NULL
    followers_count: int = Integer | DEFAULT 0
    content: str = Text | NOT NULL
    posted_at: datetime = DateTime | NOT NULL | INDEX
    collected_at: datetime = DateTime | NOT NULL | DEFAULT NOW
    url: str = Text | NOT NULL
    likes_count: int = Integer | DEFAULT 0
    replies_count: int = Integer | DEFAULT 0
    shares_count: int = Integer | DEFAULT 0
    language: str = String(10) | DEFAULT 'en'

    UNIQUE CONSTRAINT: (platform, post_id)
    
    relationships:
        keyword: Keyword
        sentiment_results: list[SentimentResult]

# SentimentResult
class SentimentResult(Base):
    id: UUID = PK()
    post_id: UUID = FK(posts.id) | ON DELETE CASCADE | INDEX
    sentiment: str = (positive|negative|neutral) | NOT NULL | INDEX
    confidence: float = NOT NULL
    model_version: str = String(100) | DEFAULT 'cardiffnlp/twitter-roberta-base-sentiment-latest'
    analyzed_at: datetime = DateTime | NOT NULL | DEFAULT NOW

    relationships:
        post: Post

# TrackedAuthor
class TrackedAuthor(Base):
    id: UUID = PK()
    platform: str = String(50) | NOT NULL | INDEX
    author_id: str = String(255) | NOT NULL | INDEX
    author_name: str = String(255) | NOT NULL
    followers_count: int = Integer | DEFAULT 0
    account_created_at: datetime | NULL
    negative_post_count: int = Integer | DEFAULT 0
    risk_score: float = Float | DEFAULT 0.0
    is_flagged: bool = Boolean | DEFAULT FALSE | INDEX
    last_seen_at: datetime = DateTime | DEFAULT NOW

    UNIQUE CONSTRAINT: (platform, author_id)

# ReputationScore
class ReputationScore(Base):
    id: UUID = PK()
    keyword_id: UUID = FK(keywords.id) | ON DELETE CASCADE | INDEX
    score: float = Float | NOT NULL  # -100 to +100
    positive_count: int = Integer | DEFAULT 0
    negative_count: int = Integer | DEFAULT 0
    neutral_count: int = Integer | DEFAULT 0
    total_count: int = Integer | DEFAULT 0
    negative_ratio: float = Float | DEFAULT 0.0
    risk_level: str = (low|moderate|high|critical) | NOT NULL | INDEX
    computed_at: datetime = DateTime | NOT NULL | DEFAULT NOW | INDEX

    relationships:
        keyword: Keyword

# AttackCluster
class AttackCluster(Base):
    id: UUID = PK()
    keyword_id: UUID = FK(keywords.id) | ON DELETE CASCADE | INDEX
    cluster_size: int = Integer | NOT NULL
    confidence_score: float = Float | DEFAULT 0.7
    member_ids: list[str] = array (coordinated authors)
    description: str = Text | NOT NULL
    detected_at: datetime = DateTime | DEFAULT NOW | INDEX

    relationships:
        keyword: Keyword
```

### Indexes for Performance

```
posts.keyword_id              -- frequent WHERE clause
posts.platform                -- filtering
posts.posted_at               -- sorting/range queries
posts.author_id               -- linking to TrackedAuthor

sentiment_results.post_id     -- join
sentiment_results.sentiment   -- filtering

tracked_authors.platform      -- unique constraint
tracked_authors.author_id     -- unique constraint
tracked_authors.is_flagged    -- filtering

reputation_scores.keyword_id  -- lookup
reputation_scores.risk_level  -- filtering
reputation_scores.computed_at -- ordering
```

---

## 6. REPUTATION SCORING ALGORITHM

### Formula

```
reputation_score = ((weighted_positive - negative) / total) × 100
where:
  weighted_positive = positive + (neutral × 0.5)
  total = positive + negative + neutral
```

**Result Range:** -100 to +100

**Clamping:** Ensures score stays within [-100, +100]

**Risk Level Classification:**
```
negative_ratio = (negative / total) × 100

| negative_ratio | risk_level |
|       < 20%    |    "low"   |
|    20% - 40%   | "moderate" |
|       > 40%    |   "high"   |
```

### Example Calculations

```
Case 1: Equal distribution
  positive=100, negative=100, neutral=100
  weighted_positive = 100 + 50 = 150
  score = ((150 - 100) / 300) × 100 = 16.67
  negative_ratio = 33.33% ← moderate risk

Case 2: Majority negative
  positive=50, negative=200, neutral=50
  weighted_positive = 50 + 25 = 75
  score = ((75 - 200) / 300) × 100 = -41.67
  negative_ratio = 66.67% ← high risk

Case 3: Majority positive
  positive=200, negative=50, neutral=50
  weighted_positive = 200 + 25 = 225
  score = ((225 - 50) / 300) × 100 = 58.33
  negative_ratio = 16.67% ← low risk
```

---

## 7. BOT DETECTION SYSTEM (Backend)

### Detector: analyze_authenticity()

**Input:** `list[dict]` of comments
```python
[
  {
    "text": "...",
    "author": "username",
    "timestamp": <unix_timestamp>,
    "followers": <int>,
    "author_age_days": <int>
  },
  ...
]
```

**Output:**
```python
{
  "score": 0-100,  # higher = more likely bot
  "label": "human" | "suspicious" | "bot",
  "reasons": [      # triggered signals
    "duplicate_text",
    "burst_activity",
    "similar_text",
    "low_age_account",
    "low_followers"
  ],
  "signals": {      # detailed per-signal scores
    "duplicate_text": 30,
    "burst_activity": 25,
    "similar_text": 20,
    "low_age_account": 15,
    "low_followers": 10,
  }
}
```

### Signals & Thresholds

```python
DUPLICATE_TEXT_THRESHOLD = 0.90        # 90% match
BURST_WINDOW_SECONDS = 60              # 60-second window
BURST_MIN_POSTS = 3                    # need 3+ posts
LOW_AGE_DAYS = 30                      # account < 30 days
LOW_FOLLOWER_THRESHOLD = 10            # followers < 10

SIGNAL_WEIGHTS = {
  "duplicate_text": 30,
  "burst_activity": 25,
  "similar_text": 20,
  "low_age_account": 15,
  "low_followers": 10,
}

# Score = SUM of triggered signal weights
# Classification:
#   score < 30  → "human"
#   30 ≤ score < 70 → "suspicious"
#   score ≥ 70 → "bot"
```

### Detection Methods

1. **_check_duplicates()**
   - Find accounts posting identical text
   - If count ≥ 2 and authors differ → flag all authors
   - Weight: 30 points

2. **_check_burst_activity()**
   - Group comments by author
   - If 3+ posts within 60 seconds → flag author
   - Weight: 25 points

3. **_check_text_similarity()**
   - Pairwise SequenceMatcher ratio
   - If 75% similar but different authors → flag both
   - Threshold: 0.75 ≤ ratio < 0.90
   - Weight: 20 points

4. **_check_account_signals()**
   - Account age < 30 days → flag (15 points)
   - Followers < 10 → flag (10 points)

---

## 8. CURRENT PAGINATION & SORTING SUMMARY

### Talk System

**Sort Options:**
- `newest` (default) – by publishedAt DESC
- `oldest` – by publishedAt ASC

**Pagination:**
- Page-based: `page` (1-indexed) + `limit` (default 50, max 100)
- Offset calculation: `(page - 1) × limit`

**Filters:**
- Sentiment: positive | negative | neutral
- Bot Label: human | suspicious | bot
- Text search: substring match on comment text

### Feed System

**Sort Options:**
- YouTube API default ranking (relevance + view count)
- No custom sorting in current implementation

**Pagination:**
- Fixed 12 videos per request
- No pagination support (TV API limitation)

**Filters:**
- No filtering currently exposed
- Could filter by channel or date (client-side)

---

## 9. CACHING MECHANISMS SUMMARY

### Backend

**Redis (`live:*` channels):**
- Pub/Sub for real-time updates
- Broadcast on new sentiment result
- Broadcast stats every 30 seconds
- 1 channel per keyword
- No TTL (ephemeral messages)

**Database Query Caching:**
- SQLAlchemy connection pooling (PostgreSQL)
- No explicit query caching layer
- Relies on DB indexes for performance

### Frontend

**Next.js Frontend APIs:**
- HTTP Cache-Control headers: 60s (browser) + 120s (CDN)
- Applies to `/api/metrics` and `/api/youtube` responses

**SQLite Talk Cache:**
- Client-side local persistence
- Located at `<project-root>/data/talk_cache.db`
- Uses WAL for write concurrency
- No automatic invalidation (flag-based: `fullyFetched`)

**React Component State:**
- Local state management (hooks)
- No global state manager (Redux, Zustand, etc.)
- Optional: sessionStorage for recent searches

---

## 10. PROOF VALIDATION & LINK GENERATION

### Talk System: YouTube Comment Proof

**URL Format:**
```
https://www.youtube.com/watch?v={videoId}&lc={commentId}
```

**Validation:**
```javascript
function validateYouTubeCommentProofUrl(url: string): ProofValidation {
  // Check:
  // 1. URL is HTTPS
  // 2. Domain is youtube.com or youtu.be
  // 3. Contains videoId (v= or youtu.be/ID)
  // 4. Contains commentId (lc= parameter)
  // 5. URL is not too long
  
  if (!/^https:\/\//.test(url)) return { status: "invalid" };
  if (!url.includes("youtube.com") && !url.includes("youtu.be")) {
    return { status: "invalid" };
  }
  if (!url.includes("lc=")) return { status: "invalid" };
  
  return { status: "valid" };
}
```

**On ingestion:**
- Every comment proof URL validated before storage
- Invalid proofs logged with rejection reason
- Invalid comments skipped (not stored)

### Feed System: YouTube Video Proof

**URL Format:**
```
https://www.youtube.com/watch?v={videoId}
```

**Stored in DB:**
```
video.proofUrl = `https://www.youtube.com/watch?v=${video.id}`
```

---

## 11. REAL-TIME UPDATES: WebSocket & Redis

### Architecture

```
Backend Celery Task
    │ (analyze_task)
    │ "Sentiment complete, new result available"
    └──→ Redis channel: live:{keyword_normalized}
           │
           └──→ Publish: {
                 event: "new_post",
                 data: { sentiment, confidence, likes, ... }
               }
                  │
                  ▼
           WebSocket client listening to /ws/live/{keyword}?token={jwt}
                  │
                  └──→ Receive message
                       Update UI (TalkCard component)
                       Add to items array
                       Notify user: "New comment detected"
```

### Message Types

**1. Connected**
```json
{
  "event": "connected",
  "message": "Monitoring: {keyword}",
  "keyword": "{keyword}"
}
```

**2. New Post**
```json
{
  "event": "new_post",
  "keyword": "{keyword}",
  "data": {
    "platform": "youtube",
    "author_name": "...",
    "content": "...",
    "url": "...",
    "posted_at": "2024-01-01T12:00:00Z",
    "sentiment": "positive|negative|neutral",
    "confidence": 0.95,
    "followers_count": 150,
    "likes_count": 5,
    "is_flagged_author": false
  }
}
```

**3. Stats Update (every 30 seconds)**
```json
{
  "event": "stats_update",
  "data": {
    "positive_count": 150,
    "negative_count": 45,
    "neutral_count": 200,
    "reputation_score": 23.45,
    "negative_ratio": 12.5,
    "risk_level": "low",
    "total_last_hour": 395
  }
}
```

---

## 12. COMPLETE DATA FLOW DIAGRAM

```
┌────────────────────────────────────────────────────────────────┐
│                         USER INTERACTION                         │
├────────────────────────────────────────────────────────────────┤
│ 1. Frontend: Enter keyword, click search                         │
│ 2. Frontend: Select filters (sentiment, bot label)               │
│ 3. Frontend: Paginate or sort results                            │
│ 4. Online: Connect to WebSocket for live updates                 │
└────────────────────────────────────────────────────────────────┘
         │                              │                 │
         ▼                              ▼                 ▼
┌─────────────────┐          ┌──────────────────┐  ┌──────────────┐
│ /api/talk       │          │ /api/metrics     │  │ /ws/live     │
│ (Next.js)       │          │ (Next.js)        │  │ (FastAPI)    │
├─────────────────┤          ├──────────────────┤  ├──────────────┤
│ 1. Check cache  │          │ Call YouTube API │  │ JWT verify   │
│    (SQLite)     │          │ Aggregate KPIs   │  │ Accept conn. │
│ 2. If missing:  │          │ Return metrics   │  │ Subscribe    │
│    - Search YT  │          └──────────────────┘  │ to channel   │
│    - Fetch      │                                 └──────────────┘
│    comments     │
│    - Sentiment  │
│    - Bot detect │
│    - Cache      │
│    - Return     │
└─────────────────┘
         │
         ├─→ SQLite talk_items
         │    - commentId (PK)
         │    - sentiment, botLabel, botReasons
         │    - proofUrl (validated)
         │
         └─→ Sentiment Counts
              {positive, negative, neutral, total}


┌────────────────────────────────────────────────────────────────┐
│                       BACKEND PIPELINE                           │
├────────────────────────────────────────────────────────────────┤
│ User creates keyword → Scheduler triggers collection            │
│                                                                  │
│ collect_task                                                     │
│  ├─→ Twitter, Instagram, Reddit, etc. collectors                │
│  └─→ Fetch posts since last 24 hours                            │
│       └─→ process_task                                          │
│            ├─→ Normalize, deduplicate, translate                │
│            ├─→ Spam filter, strip emojis                        │
│            └─→ Save to Post table                               │
│                 └─→ analyze_task                                │
│                      ├─→ Batch sentiment analysis               │
│                      ├─→ Save SentimentResult                   │
│                      ├─→ Publish to Redis live channel          │
│                      └─→ detection_task                         │
│                           ├─→ Risk scoring per author           │
│                           ├─→ Update TrackedAuthor              │
│                           ├─→ Cluster detection                 │
│                           └─→ Trigger alerts                    │
│                                                                  │
│ Every 30 seconds: broadcast_stats_for_all_keywords              │
│ Every hour: compute_daily_scores                                │
└────────────────────────────────────────────────────────────────┘
         │
         └─→ PostgreSQL Database
              - posts, sentiment_results
              - tracked_authors (risk_score)
              - reputation_scores
              - attack_clusters
              - alerts
              
              Redis
              - live:{keyword} channels
              - Real-time message publish
```

---

## 13. KEY FILES & THEIR ROLES

### Backend
- `api/main.py` – FastAPI app entry, router registration
- `api/routes/*.py` – API endpoint implementations
- `database/connection.py` – async SQLAlchemy engine + session factory
- `models/*.py` – SQLAlchemy ORM models
- `pipeline/celery_app.py` – Celery configuration
- `pipeline/scheduler.py` – Beat schedule configuration
- `pipeline/tasks/*.py` – collect, process, analyze, detect
- `ml/sentiment_engine.py` – transformer-based sentiment analysis
- `ml/bot_detector.py` – heuristic bot detection
- `ml/reputation_scorer.py` – score calculation

### Frontend
- `pages/reputation-os/feed.tsx` – YouTube search + metrics display
- `pages/reputation-os/talk.tsx` – Comment sentiment + bot detection UI
- `pages/api/talk.ts` – Talk API handler (aggregation, caching)
- `pages/api/youtube.ts` – YouTube API wrapper
- `pages/api/metrics.ts` – Metrics aggregation
- `lib/talkApi.ts` – Talk API client
- `lib/sentiment.ts` – Sentiment analysis (HF inference)
- `lib/botDetection.ts` – Bot detection heuristics
- `lib/db/talkCache.ts` – SQLite cache management
- `hooks/useTalkData.ts` – Talk data fetching hook
- `hooks/useDashboardData.ts` – Dashboard data fetching hook
- `components/reputation-os/*.tsx` – UI components

---

## 14. DEPLOYMENT CONSIDERATIONS

### Database
- **PostgreSQL:** Primary data store for posts, sentiment, tracking
- **SQLite:** Client-side talk cache (Next.js serverless)
- **Redis:** Pub/Sub for live updates

### Scaling
- **Talk cache:** Per-keyword cap (6000 items). Older items not re-fetched.
- **Comment fetch:** Max 5 pages × 100 = 500 per video
- **Batch sizes:** Sentiment 32, bot detection batch
- **Rate limits:** YouTube API quota (100,000/day by default)

### Constraints
- **YouTube API:** Max 12 videos per search
- **Next.js Vercel:** SQLite at `/tmp` (writable on Vercel)
- **WebSocket:** JWT authentication required

---

## 15. SUMMARY TABLE

| Feature | Status | Details |
|---------|--------|---------|
| **Talk Collection** | ✅ | YouTube comments → SQLite cache |
| **Talk Sentiment** | ✅ | HuggingFace API + fallback lexicon |
| **Bot Detection** | ✅ | Heuristic scoring (0-100) |
| **Pagination (Talk)** | ✅ | Page-based, max 100/page |
| **Filtering (Talk)** | ✅ | Sentiment, bot label, text search |
| **Sorting (Talk)** | ✅ | Newest / oldest by publishedAt |
| **Feed Videos** | ✅ | YouTube search (max 12) |
| **Feed KPIs** | ✅ | Views, likes, engagement rate |
| **Feed Metrics** | ✅ | Channel breakdown, trend |
| **Backend Caching** | ⚠️ | DB indexes + SQLite (client-side) |
| **Real-Time Updates** | ✅ | WebSocket + Redis Pub/Sub |
| **Risk Scoring** | ✅ | Algorithm: weighted positive/negative |
| **Coordinated Attacks** | ✅ | Cluster detection with confidence |
| **Alerts** | ✅ | Managed by AlertManager |

---

## 16. FUTURE EXTENSION POINTS

### To Add:
1. **Feed filtering:** By channel, date, engagement
2. **Feed sorting:** By views, likes, comments
3. **Talk export:** CSV/JSON download
4. **Historical tracking:** Reputation score timeline graphs
5. **Custom thresholds:** User-configurable risk scores
6. **Multi-language support:** For sentiment models
7. **Video-level comment analysis:** Summary of comments per video
8. **Advanced clustering:** ML-based audience segmentation
9. **Automated responses:** Suggest responses to negative comments
10. **Competitor tracking:** Monitor competitor keywords

