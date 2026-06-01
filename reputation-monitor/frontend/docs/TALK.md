# Talk Feature Documentation

## Overview

The **Talk** feature aggregates what people are saying across all YouTube videos
matching a search keyword and performs sentiment analysis on each talk item. It
provides a unified, filterable, paginated feed of YouTube comments ("talk items")
with sentiment labels and direct proof links.

---

## Architecture

### Data Flow

```
User enters keyword → /api/talk endpoint
  → fetchYouTubeVideos(keyword)         [reuses existing YouTube search]
  → YouTube commentThreads API           [fetches comments per video]
  → Sentiment analysis (HuggingFace)     [classifies each comment]
  → SQLite cache (talk_cache.db)         [persists results]
  → Paginated response with filters     [returns to frontend]
```

### Files

| File | Purpose |
|------|---------|
| `pages/api/talk.ts` | Backend API endpoint — aggregation, sentiment, pagination |
| `lib/sentiment.ts` | Sentiment analysis module (HuggingFace + fallback) |
| `lib/db/talkCache.ts` | SQLite cache for talk items and fetch status |
| `lib/talkApi.ts` | Frontend API client |
| `hooks/useTalkData.ts` | React hook for Talk data state management |
| `pages/talk.tsx` | Talk page UI |
| `components/Sidebar.tsx` | Updated with Talk nav entry |
| `__tests__/talk.test.ts` | Automated test suite |

---

## Talk Item Limitation (~5,000+ items)

### Why the limit?

The YouTube Data API v3 has a **daily quota of 10,000 units** on the free tier.
Each API call costs units as follows:

| Operation | Cost |
|-----------|------|
| `search.list` | 100 units |
| `videos.list` (statistics) | 1 unit |
| `commentThreads.list` | 1 unit per page |

For a typical keyword search:

- 1 search call = 100 units
- 1 statistics call = 1 unit
- ~12 videos × 5 pages of comments = ~60 units
- **Total: ~161 units per keyword**

This allows approximately **60 unique keyword searches per day** with full
comment retrieval.

### Current limits

| Parameter | Value | Reason |
|-----------|-------|--------|
| Max videos per keyword | 12 | YouTube search API `maxResults` |
| Max comment pages per video | 5 | Quota conservation |
| Max comments per page | 100 | YouTube API maximum |
| Max total items target | 6,000 | `MAX_ITEMS_TARGET` in `/api/talk.ts` |
| **Practical total per keyword** | **~5,000–6,000** | 12 videos × 500 comments each |

### Graceful handling

- If a video has fewer comments than 500, the system marks it as "fully fetched"
  and moves to the next video.
- If the total target is reached, remaining videos are skipped (their comments
  can be fetched in a future request).
- All fetched items are cached in SQLite, so subsequent requests are instant.
- Errors during comment fetching are logged but don't block the response.

---

## Pagination

### API Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `keyword` | string | required | Search keyword |
| `page` | number | 1 | Page number (1-indexed) |
| `limit` | number | 50 | Items per page (1–100) |
| `sentiment` | string | all | Filter: `positive`, `negative`, `neutral` |
| `search` | string | none | Text search within talk items |
| `sort` | string | `newest` | Sort order: `newest` or `oldest` |

### Response format

```json
{
  "success": true,
  "data": {
    "items": [
      {
        "commentId": "UgzJ1L2...",
        "text": "Great video!",
        "author": "User Name",
        "publishedAt": "2024-01-15T10:30:00Z",
        "videoId": "dQw4w9WgXcQ",
        "videoTitle": "Video Title",
        "channelTitle": "Channel Name",
        "sentiment": "positive",
        "proofUrl": "https://www.youtube.com/watch?v=dQw4w9WgXcQ&lc=UgzJ1L2..."
      }
    ],
    "total": 5234,
    "page": 1,
    "limit": 50,
    "totalPages": 105,
    "sentimentCounts": {
      "positive": 2341,
      "negative": 876,
      "neutral": 2017
    },
    "totalTalkItems": 5234
  }
}
```

### Future expansion

When quota/approach allows fetching beyond 5,000 items:

1. Increase `MAX_PAGES_PER_VIDEO` in `/api/talk.ts` (currently 5)
2. Increase `MAX_ITEMS_TARGET` (currently 6,000)
3. The `video_fetch_status` table tracks `nextPageToken` per video, enabling
   incremental fetching across multiple sessions
4. The `fullyFetched` flag prevents re-fetching completed videos
5. Consider using YouTube Data API batch requests or alternative auth for
   higher quotas

---

## Sentiment Model

### Model

**[tabularisai/multilingual-sentiment-analysis](https://huggingface.co/tabularisai/multilingual-sentiment-analysis)**

- Based on DistilBERT
- Supports 23+ languages
- Fine-tuned for sentiment classification

### Integration

The system uses the **HuggingFace Inference API** (free tier) to call the model:

```
POST https://api-inference.huggingface.co/models/tabularisai/multilingual-sentiment-analysis
```

Set the `HF_TOKEN` environment variable for higher rate limits (optional for
public models).

### Label Mapping

The model outputs 5 labels. We normalize to 3:

| Model Output | Normalized Label |
|-------------|-----------------|
| Very Positive / 5 stars | `positive` |
| Positive / 4 stars | `positive` |
| Neutral / 3 stars | `neutral` |
| Negative / 2 stars | `negative` |
| Very Negative / 1 star | `negative` |

### Fallback

If the HuggingFace API is unavailable, the system falls back to a lexicon-based
approach using positive/negative keyword matching. Results are always one of:
`positive`, `negative`, or `neutral`.

### Caching

Sentiment results are cached in SQLite keyed by `commentId`. Once a comment has
been classified, it is never re-analyzed unless the cache is cleared.

---

## Proof Links

Every talk item includes a **Proof URL** that links to the original comment on
YouTube:

```
https://www.youtube.com/watch?v={videoId}&lc={commentId}
```

- The `lc` parameter deep-links to the specific comment thread
- The system **never** displays a talk item without a proof link
- Backend validation filters out any items missing proof URLs
- The database schema enforces `proofUrl` as NOT NULL

---

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `YOUTUBE_API_KEY` | Yes | YouTube Data API v3 key |
| `HF_TOKEN` | No | HuggingFace API token (optional, improves rate limits) |

---

## Testing

Run the test suite:

```bash
cd reputation-monitor/frontend
npx vitest run
```

The tests verify:

1. ✅ Sentiment classification always maps to one of the three required labels
2. ✅ Every returned talk item includes a non-empty proof URL
3. ✅ Aggregation works across multiple videos (not just one)
4. ✅ Pagination returns stable, non-duplicating results
5. ✅ Label normalization handles all model output formats
6. ✅ Text search and filtering work correctly
7. ✅ Video fetch status tracking for pagination state
