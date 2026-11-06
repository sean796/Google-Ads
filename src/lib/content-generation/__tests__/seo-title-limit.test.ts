import { describe, expect, it } from "vitest";
import { SEO_TITLE_MAX_CHARS, truncateTitleForSEO } from "@/lib/content-generation/content-sanitizer";

describe("SEO title limit", () => {
  it("is 60 characters", () => {
    expect(SEO_TITLE_MAX_CHARS).toBe(60);
  });

  it("leaves titles at or under the limit unchanged", () => {
    expect(truncateTitleForSEO("Blinds in Toronto")).toBe("Blinds in Toronto");
    const sixty = "a".repeat(60);
    expect(truncateTitleForSEO(sixty)).toBe(sixty);
  });

  it("truncates longer titles at a word boundary within the limit", () => {
    const long =
      "Best Custom Window Blinds and Shades for Toronto Homes That Want Privacy Light Control and Style";
    const out = truncateTitleForSEO(long);
    expect(out.length).toBeLessThanOrEqual(60);
    expect(long.startsWith(out)).toBe(true);
    expect(out.endsWith(" ")).toBe(false);
  });

  it("respects an explicit caller limit", () => {
    const out = truncateTitleForSEO("One two three four five six seven", 10);
    expect(out.length).toBeLessThanOrEqual(10);
  });
});
