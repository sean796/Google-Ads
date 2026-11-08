import { describe, it, expect } from "vitest";
import {
  fullDestinationUrl,
  normalizeFocusKeywordPhrase,
  pathnameReflectsKeywordSlug,
  permalinkParentPrefixFromPageUrl,
  permalinkParentPrefixFromPageUrls,
  suggestedPathFromFocusKeywordForMetaOptimizer,
  slugifyFocusKeywordToRelativePath,
} from "../pulse-redirect-redirect-csv";

describe("normalizeFocusKeywordPhrase", () => {
  it("turns slug hyphens into spaces and trims junk", () => {
    expect(normalizeFocusKeywordPhrase("privacy-light-top-down-blinds")).toBe(
      "privacy light top down blinds",
    );
    expect(normalizeFocusKeywordPhrase("roller_shades  best")).toBe("roller shades best");
  });
});

describe("pathnameReflectsKeywordSlug (exact keyword slug = last segment)", () => {
  const kw = "roller shades";
  const slug = slugifyFocusKeywordToRelativePath(kw)?.replace(/^\/+|\/+$/g, "") ?? "";

  it("matches when last segment exactly equals keyword slug", () => {
    expect(pathnameReflectsKeywordSlug("/blog/roller-shades/", slug)).toBe(true);
    expect(pathnameReflectsKeywordSlug("/roller-shades/", slug)).toBe(true);
  });

  it("rejects extra words before or after the keyword in the segment", () => {
    expect(pathnameReflectsKeywordSlug("/buy-roller-shades/", slug)).toBe(false);
    expect(pathnameReflectsKeywordSlug("/roller-shades-near-me/", slug)).toBe(false);
    expect(pathnameReflectsKeywordSlug("/window-treatments-roller-shades/", slug)).toBe(false);
  });

  it("rejects loose containment in the middle of the segment", () => {
    expect(pathnameReflectsKeywordSlug("/blog/window-roller-blinds-shades/", slug)).toBe(false);
  });

  it("strips .html when comparing", () => {
    expect(pathnameReflectsKeywordSlug("/roller-shades.html", slug)).toBe(true);
  });
});

describe("permalinkParentPrefixFromPageUrl", () => {
  it("returns blog prefix for posts under /blog/", () => {
    expect(permalinkParentPrefixFromPageUrl("https://example.com/blog/old-slug/")).toBe("blog/");
  });

  it("returns empty for root-level posts", () => {
    expect(permalinkParentPrefixFromPageUrl("https://example.com/old-slug/")).toBe("");
  });

  it("picks common prefix across member urls", () => {
    expect(
      permalinkParentPrefixFromPageUrls([
        "https://blindmagic.com/blog/a/",
        "https://blindmagic.com/blog/b/",
      ]),
    ).toBe("blog/");
  });
});

describe("fullDestinationUrl", () => {
  it("keeps /blog/ when suggestion is slug-only", () => {
    const source = "https://kwbllp.com/blog/canadas-35-billion-arctic-investment/";
    expect(fullDestinationUrl(source, "canada-s-35-billion-arctic-investment/")).toBe(
      "https://kwbllp.com/blog/canada-s-35-billion-arctic-investment/",
    );
  });

  it("leaves root-level posts at site root", () => {
    const source = "https://example.com/old-slug/";
    expect(fullDestinationUrl(source, "new-slug/")).toBe("https://example.com/new-slug/");
  });

  it("uses multi-segment suggestions as-is", () => {
    const source = "https://example.com/blog/old-slug/";
    expect(fullDestinationUrl(source, "news/new-slug/")).toBe("https://example.com/news/new-slug/");
  });
});

describe("slugifyFocusKeywordToRelativePath", () => {
  it("strips apostrophes without orphan s segment", () => {
    expect(slugifyFocusKeywordToRelativePath("Alberta's Productivity Grant")).toBe(
      "albertas-productivity-grant/",
    );
  });
});

describe("suggestedPathFromFocusKeywordForMetaOptimizer", () => {
  it("suggests slugified keyword only", () => {
    const path = slugifyFocusKeywordToRelativePath("roller shades");
    const out = suggestedPathFromFocusKeywordForMetaOptimizer("/blog/old-slug/", "roller shades");
    expect(out.kind).toBe("set");
    if (out.kind === "set") expect(out.path).toBe(path);
  });

  it("clears when last segment exactly matches keyword slug", () => {
    const out = suggestedPathFromFocusKeywordForMetaOptimizer("/x/roller-shades/", "roller shades");
    expect(out.kind).toBe("clear");
  });

  it("suggests redirect when segment only contains keyword as substring", () => {
    const out = suggestedPathFromFocusKeywordForMetaOptimizer("/buy-roller-shades/", "roller shades");
    expect(out.kind).toBe("set");
  });
});
