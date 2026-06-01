/**
 * Unit + integration tests for proof validation.
 *
 * Covers:
 *  1. URL validation (valid, invalid, edge cases)
 *  2. Protocol enforcement (https only; block javascript:, data:, etc.)
 *  3. YouTube video URL validation
 *  4. YouTube comment URL validation
 *  5. GitHub URL validation
 *  6. Text evidence validation
 *  7. Zod schema validation for TalkItem, YouTubeVideo, BasisSignal
 *  8. isProofUrlSafe boolean helper
 *  9. Integration: invalid proofs should not be treated as evidence
 */

import { describe, it, expect } from "vitest";
import {
  validateProofUrl,
  validateYouTubeProofUrl,
  validateYouTubeCommentProofUrl,
  validateGitHubProofUrl,
  validateTextEvidence,
  isProofUrlSafe,
  ProofUrlSchema,
  YouTubeProofUrlSchema,
  YouTubeCommentProofUrlSchema,
  BasisSignalSchema,
  TalkItemProofSchema,
  YouTubeVideoProofSchema,
} from "../lib/proofValidation";

// ---------------------------------------------------------------------------
// 1. Generic URL Validation
// ---------------------------------------------------------------------------

describe("validateProofUrl", () => {
  it("accepts a valid https URL", () => {
    const result = validateProofUrl("https://www.youtube.com/watch?v=abc123");
    expect(result.status).toBe("valid");
    expect(result.reason).toBeUndefined();
  });

  it("rejects empty string", () => {
    const result = validateProofUrl("");
    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("Missing or empty URL");
  });

  it("rejects non-string input", () => {
    expect(validateProofUrl(null).status).toBe("invalid");
    expect(validateProofUrl(undefined).status).toBe("invalid");
    expect(validateProofUrl(42).status).toBe("invalid");
  });

  it("rejects malformed URL", () => {
    const result = validateProofUrl("not a url at all");
    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("Malformed URL");
  });

  it("rejects http: protocol", () => {
    const result = validateProofUrl("http://example.com");
    expect(result.status).toBe("invalid");
    expect(result.reason).toContain("Unsupported protocol");
  });

  it("rejects javascript: protocol", () => {
    const result = validateProofUrl("javascript:alert(1)");
    expect(result.status).toBe("invalid");
    expect(result.reason).toContain("Unsupported protocol");
  });

  it("rejects data: protocol", () => {
    const result = validateProofUrl("data:text/html,<script>alert(1)</script>");
    expect(result.status).toBe("invalid");
    expect(result.reason).toContain("Unsupported protocol");
  });

  it("rejects ftp: protocol", () => {
    const result = validateProofUrl("ftp://files.example.com/file.txt");
    expect(result.status).toBe("invalid");
    expect(result.reason).toContain("Unsupported protocol");
  });

  it("accepts valid https URL with path and query", () => {
    const result = validateProofUrl(
      "https://github.com/user/repo/blob/main/file.ts#L42",
    );
    expect(result.status).toBe("valid");
  });
});

// ---------------------------------------------------------------------------
// 2. YouTube Video URL Validation
// ---------------------------------------------------------------------------

describe("validateYouTubeProofUrl", () => {
  it("accepts valid YouTube video URL", () => {
    const result = validateYouTubeProofUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(result.status).toBe("valid");
  });

  it("accepts YouTube video URL without www", () => {
    const result = validateYouTubeProofUrl(
      "https://youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(result.status).toBe("valid");
  });

  it("rejects non-YouTube URL", () => {
    const result = validateYouTubeProofUrl("https://example.com/watch?v=abc");
    expect(result.status).toBe("invalid");
    expect(result.reason).toBe("Not a valid YouTube video URL");
  });

  it("rejects YouTube URL without video ID", () => {
    const result = validateYouTubeProofUrl("https://www.youtube.com/");
    expect(result.status).toBe("invalid");
  });

  it("rejects empty input", () => {
    expect(validateYouTubeProofUrl("").status).toBe("invalid");
  });
});

// ---------------------------------------------------------------------------
// 3. YouTube Comment URL Validation
// ---------------------------------------------------------------------------

describe("validateYouTubeCommentProofUrl", () => {
  it("accepts valid YouTube comment URL", () => {
    const result = validateYouTubeCommentProofUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ&lc=UgzJ1L2abc123",
    );
    expect(result.status).toBe("valid");
  });

  it("rejects YouTube URL without comment ID", () => {
    const result = validateYouTubeCommentProofUrl(
      "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    );
    expect(result.status).toBe("invalid");
    expect(result.reason).toContain("Missing comment ID");
  });

  it("rejects non-YouTube URL", () => {
    const result = validateYouTubeCommentProofUrl(
      "https://example.com/watch?v=abc&lc=123",
    );
    expect(result.status).toBe("invalid");
  });
});

// ---------------------------------------------------------------------------
// 4. GitHub URL Validation
// ---------------------------------------------------------------------------

describe("validateGitHubProofUrl", () => {
  it("accepts GitHub file URL", () => {
    const result = validateGitHubProofUrl(
      "https://github.com/user/repo/blob/main/src/file.ts",
    );
    expect(result.status).toBe("valid");
  });

  it("accepts GitHub commit URL", () => {
    const result = validateGitHubProofUrl(
      "https://github.com/user/repo/commit/abc123def456",
    );
    expect(result.status).toBe("valid");
  });

  it("accepts GitHub PR URL", () => {
    const result = validateGitHubProofUrl(
      "https://github.com/user/repo/pull/42",
    );
    expect(result.status).toBe("valid");
  });

  it("accepts GitHub issue URL", () => {
    const result = validateGitHubProofUrl(
      "https://github.com/user/repo/issues/7",
    );
    expect(result.status).toBe("valid");
  });

  it("rejects non-GitHub URL", () => {
    const result = validateGitHubProofUrl(
      "https://gitlab.com/user/repo/blob/main/file.ts",
    );
    expect(result.status).toBe("invalid");
    expect(result.reason).toContain("Not a recognized GitHub URL");
  });

  it("rejects GitHub root URL without specific resource", () => {
    const result = validateGitHubProofUrl("https://github.com/user/repo");
    expect(result.status).toBe("invalid");
  });
});

// ---------------------------------------------------------------------------
// 5. Text Evidence Validation
// ---------------------------------------------------------------------------

describe("validateTextEvidence", () => {
  it("accepts valid signal and evidence text", () => {
    const result = validateTextEvidence(
      "Positive comment ratio",
      "85% positive out of 120 comments",
    );
    expect(result.status).toBe("valid");
  });

  it("rejects empty signal", () => {
    const result = validateTextEvidence("", "some evidence");
    expect(result.status).toBe("invalid");
    expect(result.reason).toContain("signal");
  });

  it("rejects empty evidence text", () => {
    const result = validateTextEvidence("Some signal", "");
    expect(result.status).toBe("invalid");
    expect(result.reason).toContain("evidence_text");
  });

  it("rejects non-string signal", () => {
    const result = validateTextEvidence(null, "evidence");
    expect(result.status).toBe("invalid");
  });

  it("rejects non-string evidence text", () => {
    const result = validateTextEvidence("signal", 42);
    expect(result.status).toBe("invalid");
  });
});

// ---------------------------------------------------------------------------
// 6. isProofUrlSafe boolean helper
// ---------------------------------------------------------------------------

describe("isProofUrlSafe", () => {
  it("returns true for valid https URL", () => {
    expect(isProofUrlSafe("https://www.youtube.com/watch?v=abc")).toBe(true);
  });

  it("returns false for javascript: URL", () => {
    expect(isProofUrlSafe("javascript:alert(1)")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(isProofUrlSafe("")).toBe(false);
  });

  it("returns false for null", () => {
    expect(isProofUrlSafe(null)).toBe(false);
  });

  it("returns false for data: URL", () => {
    expect(isProofUrlSafe("data:text/html,<h1>test</h1>")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 7. Zod Schema Validation
// ---------------------------------------------------------------------------

describe("Zod Schemas", () => {
  describe("ProofUrlSchema", () => {
    it("parses valid https URL", () => {
      expect(() => ProofUrlSchema.parse("https://example.com")).not.toThrow();
    });

    it("rejects javascript: URL", () => {
      expect(() => ProofUrlSchema.parse("javascript:alert(1)")).toThrow();
    });
  });

  describe("YouTubeProofUrlSchema", () => {
    it("parses valid YouTube video URL", () => {
      expect(() =>
        YouTubeProofUrlSchema.parse(
          "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        ),
      ).not.toThrow();
    });

    it("rejects non-YouTube URL", () => {
      expect(() =>
        YouTubeProofUrlSchema.parse("https://example.com/video"),
      ).toThrow();
    });
  });

  describe("YouTubeCommentProofUrlSchema", () => {
    it("parses valid YouTube comment URL", () => {
      expect(() =>
        YouTubeCommentProofUrlSchema.parse(
          "https://www.youtube.com/watch?v=dQw4w9WgXcQ&lc=UgzComment123",
        ),
      ).not.toThrow();
    });

    it("rejects URL without comment ID", () => {
      expect(() =>
        YouTubeCommentProofUrlSchema.parse(
          "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        ),
      ).toThrow();
    });
  });

  describe("BasisSignalSchema", () => {
    it("parses valid basis signal", () => {
      const result = BasisSignalSchema.parse({
        signal: "Positive comment ratio",
        source: "youtube",
        evidence_text: "85% positive out of 120 comments",
        related_urls: ["https://www.youtube.com/watch?v=abc12345678"],
      });
      expect(result.signal).toBe("Positive comment ratio");
    });

    it("rejects basis signal with invalid URL in related_urls", () => {
      expect(() =>
        BasisSignalSchema.parse({
          signal: "Test signal",
          source: "youtube",
          evidence_text: "Some evidence",
          related_urls: ["javascript:alert(1)"],
        }),
      ).toThrow();
    });

    it("rejects basis signal with empty signal", () => {
      expect(() =>
        BasisSignalSchema.parse({
          signal: "",
          source: "youtube",
          evidence_text: "Some evidence",
          related_urls: [],
        }),
      ).toThrow();
    });

    it("rejects basis signal with empty evidence_text", () => {
      expect(() =>
        BasisSignalSchema.parse({
          signal: "Test",
          source: "youtube",
          evidence_text: "",
          related_urls: [],
        }),
      ).toThrow();
    });
  });

  describe("TalkItemProofSchema", () => {
    it("parses valid talk item", () => {
      const result = TalkItemProofSchema.parse({
        commentId: "c1",
        videoId: "dQw4w9WgXcQ",
        text: "Great video!",
        author: "User",
        publishedAt: "2024-01-01T00:00:00Z",
        videoTitle: "Test Video",
        channelTitle: "Test Channel",
        sentiment: "positive",
        proofUrl:
          "https://www.youtube.com/watch?v=dQw4w9WgXcQ&lc=c1",
      });
      expect(result.commentId).toBe("c1");
    });

    it("rejects talk item with invalid proofUrl", () => {
      expect(() =>
        TalkItemProofSchema.parse({
          commentId: "c1",
          videoId: "v1",
          text: "Great video!",
          author: "User",
          publishedAt: "2024-01-01T00:00:00Z",
          videoTitle: "Test Video",
          channelTitle: "Test Channel",
          sentiment: "positive",
          proofUrl: "javascript:alert(1)",
        }),
      ).toThrow();
    });
  });

  describe("YouTubeVideoProofSchema", () => {
    it("parses valid YouTube video", () => {
      const result = YouTubeVideoProofSchema.parse({
        id: "dQw4w9WgXcQ",
        title: "Test Video",
        channelTitle: "Test Channel",
        publishedAt: "2024-01-01T00:00:00Z",
        thumbnailUrl: "https://i.ytimg.com/vi/dQw4w9WgXcQ/mqdefault.jpg",
        description: "A test video",
        proofUrl: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        viewCount: 1000,
        likeCount: 100,
        commentCount: 50,
      });
      expect(result.id).toBe("dQw4w9WgXcQ");
    });

    it("rejects video with data: proof URL", () => {
      expect(() =>
        YouTubeVideoProofSchema.parse({
          id: "v1",
          title: "Test",
          channelTitle: "Channel",
          publishedAt: "2024-01-01",
          thumbnailUrl: "",
          description: "",
          proofUrl: "data:text/html,<script>alert(1)</script>",
          viewCount: 0,
          likeCount: 0,
          commentCount: 0,
        }),
      ).toThrow();
    });
  });
});

// ---------------------------------------------------------------------------
// 8. Security: XSS / Open Redirect Prevention
// ---------------------------------------------------------------------------

describe("Security", () => {
  it("blocks javascript: XSS in proof URLs", () => {
    // Common XSS payloads
    const xssPayloads = [
      "javascript:alert(1)",
      "javascript:alert(document.cookie)",
      "JaVaScRiPt:alert(1)",
      "javascript:void(0)",
    ];
    for (const payload of xssPayloads) {
      expect(isProofUrlSafe(payload)).toBe(false);
    }
  });

  it("blocks data: XSS in proof URLs", () => {
    expect(
      isProofUrlSafe("data:text/html,<script>alert(1)</script>"),
    ).toBe(false);
  });

  it("blocks vbscript: in proof URLs", () => {
    expect(isProofUrlSafe("vbscript:MsgBox(1)")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 9. Integration: Invalid proofs are not clickable
// ---------------------------------------------------------------------------

describe("Integration: Invalid proofs are flagged", () => {
  it("validates a set of real-world proof URLs", () => {
    const proofs = [
      {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
        expected: "valid",
      },
      {
        url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ&lc=UgzComment",
        expected: "valid",
      },
      { url: "", expected: "invalid" },
      { url: "javascript:alert(1)", expected: "invalid" },
      { url: "not-a-url", expected: "invalid" },
      { url: "http://insecure.com", expected: "invalid" },
      {
        url: "https://github.com/user/repo/blob/main/file.ts",
        expected: "valid",
      },
    ];

    for (const { url, expected } of proofs) {
      const result = validateProofUrl(url);
      expect(result.status).toBe(expected);
    }
  });

  it("flags all invalid proofs in a basis signal list", () => {
    const basisSignals = [
      {
        signal: "Good signal",
        source: "youtube" as const,
        evidence_text: "Valid evidence",
        related_urls: ["https://www.youtube.com/watch?v=abc12345678"],
      },
      {
        signal: "Bad signal",
        source: "youtube" as const,
        evidence_text: "Some evidence",
        related_urls: ["javascript:alert(1)", "data:text/html,test"],
      },
    ];

    // First signal should fully validate
    expect(() => BasisSignalSchema.parse(basisSignals[0])).not.toThrow();

    // Second signal should fail due to unsafe URLs
    expect(() => BasisSignalSchema.parse(basisSignals[1])).toThrow();
  });
});
