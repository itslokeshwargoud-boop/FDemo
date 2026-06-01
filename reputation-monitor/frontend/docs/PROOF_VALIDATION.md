# Proof Validation

REPSCAN validates all proof items before rendering them in the dashboard.
Invalid proofs are flagged and never displayed as clickable links.

## Proof Formats

### YouTube Video Proof URL

```
https://www.youtube.com/watch?v={videoId}
```

- `videoId` must be an 11-character YouTube video identifier.
- Protocol must be `https:`.

### YouTube Comment Proof URL

```
https://www.youtube.com/watch?v={videoId}&lc={commentId}
```

- Same rules as video URL, plus `&lc=` parameter for comment deep-linking.
- `commentId` must be a non-empty YouTube comment identifier.

### GitHub Proof URL

Supported formats:

| Type      | Pattern                                                |
| --------- | ------------------------------------------------------ |
| Repo file | `https://github.com/{owner}/{repo}/blob/{ref}/{path}`  |
| Commit    | `https://github.com/{owner}/{repo}/commit/{sha}`       |
| PR        | `https://github.com/{owner}/{repo}/pull/{number}`      |
| Issue     | `https://github.com/{owner}/{repo}/issues/{number}`    |

### Text Evidence (BasisSignal)

```json
{
  "signal": "Positive comment ratio",
  "source": "youtube",
  "evidence_text": "85% positive out of 120 comments",
  "related_urls": ["https://www.youtube.com/watch?v=..."]
}
```

- `signal` — non-empty string describing the evidence type.
- `source` — one of: `youtube`, `twitter`, `reddit`, `news`, `internal`, `other`.
- `evidence_text` — non-empty string with the evidence description.
- `related_urls` — array of validated proof URLs (each must pass URL validation).

## Validation Rules

1. **URL syntax**: Must be parseable by `new URL()`.
2. **Protocol**: Only `https:` is allowed. Blocked: `javascript:`, `data:`, `http:`, `ftp:`, `vbscript:`, etc.
3. **Hostname**: Must be at least 3 characters.
4. **YouTube URLs**: Must match the expected `watch?v=` format.
5. **Text evidence**: Both `signal` and `evidence_text` must be non-empty strings.

## UI Behavior

- **Valid proof**: Rendered as a clickable link with `target="_blank"` and `rel="noreferrer noopener"`.
- **Invalid proof**: Rendered as plain text with an "⚠ Invalid proof" badge and a tooltip showing the reason (e.g., "Malformed URL", "Unsupported protocol").
- Invalid proofs are **never** rendered as clickable `<a>` tags.

## Security

- All external links use `rel="noreferrer noopener"` and `target="_blank"`.
- Dangerous protocols (`javascript:`, `data:`) are blocked at both API ingestion and UI rendering.
- Zod schemas validate proof payloads at the API layer before data is stored.

## Developer Diagnostics

In development mode (`NODE_ENV=development`), rejected proofs are logged to the console:

```
[REPSCAN Proof Validation] ROProofLink: rejected "javascript:alert(1)" — Unsupported protocol: javascript
```

## Zod Schemas

Available in `lib/proofValidation.ts`:

| Schema                        | Description                              |
| ----------------------------- | ---------------------------------------- |
| `ProofUrlSchema`              | Any valid `https:` URL                   |
| `YouTubeProofUrlSchema`       | YouTube video URL                        |
| `YouTubeCommentProofUrlSchema`| YouTube comment URL with `&lc=` param    |
| `BasisSignalSchema`           | Complete basis signal with validated URLs |
| `TalkItemProofSchema`         | Talk item with validated comment proof    |
| `YouTubeVideoProofSchema`     | YouTube video with validated proof URL    |

## Files

| File                                              | Role                              |
| ------------------------------------------------- | --------------------------------- |
| `lib/proofValidation.ts`                          | Validation functions + Zod schemas|
| `components/reputation-os/ROProofLink.tsx`         | Proof link component with validation |
| `components/MetricsView.tsx`                       | Metrics evidence with URL validation |
| `pages/dashboard.tsx`                              | Dashboard video proof validation  |
| `pages/talk.tsx`                                   | Talk page proof link validation   |
| `pages/api/youtube.ts`                             | API-level proof validation        |
| `pages/api/talk.ts`                                | Ingestion-time proof validation   |
| `__tests__/proofValidation.test.ts`                | Unit + integration tests          |
