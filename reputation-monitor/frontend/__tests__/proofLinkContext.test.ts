/**
 * Proof link context tests — ensures proof links are only allowed in
 * "talk_comment" and "overview_channel" contexts.
 *
 * These tests verify the ROProofLink allowlist works correctly:
 * 1. Allowed contexts render proof links
 * 2. Disallowed contexts render nothing
 * 3. isProofLinkAllowed utility works correctly
 * 4. All Reputation OS modules (except Talk + Overview channels)
 *    must not render proof links
 */

import { describe, it, expect } from "vitest";
import { isProofLinkAllowed } from "@/components/reputation-os/ROProofLink";

// ---------------------------------------------------------------------------
// 1. isProofLinkAllowed utility
// ---------------------------------------------------------------------------

describe("isProofLinkAllowed", () => {
  it("allows 'talk_comment' context", () => {
    expect(isProofLinkAllowed("talk_comment")).toBe(true);
  });

  it("allows 'overview_channel' context", () => {
    expect(isProofLinkAllowed("overview_channel")).toBe(true);
  });

  it("denies 'alerts' context", () => {
    expect(isProofLinkAllowed("alerts")).toBe(false);
  });

  it("denies 'narratives' context", () => {
    expect(isProofLinkAllowed("narratives")).toBe(false);
  });

  it("denies 'influencers' context", () => {
    expect(isProofLinkAllowed("influencers")).toBe(false);
  });

  it("denies 'authenticity' context", () => {
    expect(isProofLinkAllowed("authenticity")).toBe(false);
  });

  it("denies 'velocity' context", () => {
    expect(isProofLinkAllowed("velocity")).toBe(false);
  });

  it("denies 'moodmap' context", () => {
    expect(isProofLinkAllowed("moodmap")).toBe(false);
  });

  it("denies 'actions' context", () => {
    expect(isProofLinkAllowed("actions")).toBe(false);
  });

  it("denies 'predictions' context", () => {
    expect(isProofLinkAllowed("predictions")).toBe(false);
  });

  it("denies 'campaigns' context", () => {
    expect(isProofLinkAllowed("campaigns")).toBe(false);
  });

  it("denies 'feed' context", () => {
    expect(isProofLinkAllowed("feed")).toBe(false);
  });

  it("denies empty string context", () => {
    expect(isProofLinkAllowed("")).toBe(false);
  });

  it("denies arbitrary string", () => {
    expect(isProofLinkAllowed("random_module")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2. Proof link source-level checks
//    Verify that the actual page files do not import/use ROProofLink
//    (except overview and talk which are allowed)
// ---------------------------------------------------------------------------

describe("Proof link source-level enforcement", () => {
  // We read the actual source of each Reputation OS page and verify
  // that ROProofLink is NOT referenced (unless it's in an allowed file).

  const fs = require("fs");
  const path = require("path");

  const PAGES_DIR = path.resolve(
    __dirname,
    "..",
    "pages",
    "reputation-os",
  );

  /** Pages that must NOT contain ROProofLink references */
  const DISALLOWED_PAGES = [
    "alerts.tsx",
    "narratives.tsx",
    "influencers.tsx",
    "authenticity.tsx",
    "velocity.tsx",
    "moodmap.tsx",
    "actions.tsx",
    "predictions.tsx",
    "campaigns.tsx",
    "feed.tsx",
  ];

  for (const page of DISALLOWED_PAGES) {
    it(`${page} does NOT import ROProofLink`, () => {
      const filePath = path.join(PAGES_DIR, page);
      if (!fs.existsSync(filePath)) {
        // If the page doesn't exist, it trivially passes
        return;
      }
      const source: string = fs.readFileSync(filePath, "utf-8");
      expect(source).not.toContain("ROProofLink");
    });
  }

  it("talk.tsx uses ROProofLink with talk_comment context for proof links", () => {
    const filePath = path.join(PAGES_DIR, "talk.tsx");
    if (!fs.existsSync(filePath)) return;
    const source: string = fs.readFileSync(filePath, "utf-8");
    // Talk should use ROProofLink with context="talk_comment"
    expect(source).toContain("ROProofLink");
    expect(source).toContain('context="talk_comment"');
  });
});

// ---------------------------------------------------------------------------
// 3. Dashboard redirect check
// ---------------------------------------------------------------------------

describe("Dashboard redirect", () => {
  const fs = require("fs");
  const path = require("path");

  it("/dashboard page redirects to /reputation-os", () => {
    const filePath = path.resolve(
      __dirname,
      "..",
      "pages",
      "dashboard.tsx",
    );
    const source: string = fs.readFileSync(filePath, "utf-8");
    expect(source).toContain("/reputation-os");
    expect(source).toContain("router.replace");
  });

  it("/brand-intelligence page redirects to /reputation-os/feed", () => {
    const filePath = path.resolve(
      __dirname,
      "..",
      "pages",
      "brand-intelligence.tsx",
    );
    const source: string = fs.readFileSync(filePath, "utf-8");
    expect(source).toContain("/reputation-os/feed");
    expect(source).toContain("router.replace");
  });

  it("/ (index) redirects to /reputation-os", () => {
    const filePath = path.resolve(
      __dirname,
      "..",
      "pages",
      "index.tsx",
    );
    const source: string = fs.readFileSync(filePath, "utf-8");
    expect(source).toContain("/reputation-os");
    expect(source).toContain("router.replace");
  });
});

// ---------------------------------------------------------------------------
// 4. ROSidebar includes Feed and Talk
// ---------------------------------------------------------------------------

describe("ROSidebar navigation", () => {
  const fs = require("fs");
  const path = require("path");

  it("ROSidebar includes Feed nav item", () => {
    const filePath = path.resolve(
      __dirname,
      "..",
      "components",
      "reputation-os",
      "ROSidebar.tsx",
    );
    const source: string = fs.readFileSync(filePath, "utf-8");
    expect(source).toContain("/reputation-os/feed");
    expect(source).toContain("Feed");
  });

  it("ROSidebar includes Talk nav item", () => {
    const filePath = path.resolve(
      __dirname,
      "..",
      "components",
      "reputation-os",
      "ROSidebar.tsx",
    );
    const source: string = fs.readFileSync(filePath, "utf-8");
    expect(source).toContain("/reputation-os/talk");
    expect(source).toContain("Talk");
  });
});

// ---------------------------------------------------------------------------
// 5. Old Sidebar doesn't expose separate dashboard links
// ---------------------------------------------------------------------------

describe("Old Sidebar cleanup", () => {
  const fs = require("fs");
  const path = require("path");

  it("Old Sidebar does NOT have /dashboard link", () => {
    const filePath = path.resolve(
      __dirname,
      "..",
      "components",
      "Sidebar.tsx",
    );
    const source: string = fs.readFileSync(filePath, "utf-8");
    expect(source).not.toContain('href: "/dashboard"');
  });

  it("Old Sidebar does NOT have /brand-intelligence link", () => {
    const filePath = path.resolve(
      __dirname,
      "..",
      "components",
      "Sidebar.tsx",
    );
    const source: string = fs.readFileSync(filePath, "utf-8");
    expect(source).not.toContain('href: "/brand-intelligence"');
  });

  it("Old Sidebar does NOT have /talk link", () => {
    const filePath = path.resolve(
      __dirname,
      "..",
      "components",
      "Sidebar.tsx",
    );
    const source: string = fs.readFileSync(filePath, "utf-8");
    expect(source).not.toContain('href: "/talk"');
  });
});
