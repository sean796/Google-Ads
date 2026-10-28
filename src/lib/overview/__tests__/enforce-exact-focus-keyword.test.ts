import { describe, expect, it } from "vitest";
import { enforceExactFocusKeyword } from "@/lib/overview/enforce-exact-focus-keyword";
import {
  META_DESCRIPTION_ANTI_CLICKBAIT_RULE,
  UNIFIED_COPY_FORMATTING_RULE,
} from "@/lib/prompt-builders/title-rules";
import { GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK } from "@/lib/content-word-blocklist";

describe("enforceExactFocusKeyword and natural meta grammar rules", () => {
  it("preserves natural sentence capitalization and never overwrites with lowercase keyword", () => {
    const naturalMeta =
      "Explore the science behind energy-efficient windows, including how Low-E coatings, argon gas fills, and insulated frames reduce heat transfer.";
    expect(
      enforceExactFocusKeyword(naturalMeta, "energy efficient windows science"),
    ).toBe(naturalMeta);
  });

  it("capitalizes a lowercase sentence start without clobbering mid-sentence casing", () => {
    const raw =
      "how Low-E coatings, argon gas fills, and insulated frames reduce heat transfer and lower home utility costs.";
    expect(
      enforceExactFocusKeyword(raw, "energy efficient windows science"),
    ).toBe(
      "How Low-E coatings, argon gas fills, and insulated frames reduce heat transfer and lower home utility costs.",
    );
  });

  it("replaces an accidental hyphenated slug paste with spaces while keeping sentence capitalization", () => {
    const raw = "Learn how energy-efficient-windows-science helps reduce heat transfer.";
    expect(
      enforceExactFocusKeyword(raw, "energy efficient windows science"),
    ).toBe("Learn how energy efficient windows science helps reduce heat transfer.");
  });

  it("enforces natural grammar in meta rules and forbids estimator 'opening/openings' jargon in tables and prose", () => {
    expect(META_DESCRIPTION_ANTI_CLICKBAIT_RULE).toContain("Grammar and natural flow come first");
    expect(UNIFIED_COPY_FORMATTING_RULE).toContain("Meta descriptions and body prose (natural grammar + sentence case)");
    expect(GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK).toContain("(Single Opening)");
    expect(GLOBAL_FORBIDDEN_WORDS_PROMPT_BLOCK).toContain("single window");
  });
});
