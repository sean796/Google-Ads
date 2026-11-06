import { describe, expect, it } from "vitest";
import {
  countHarnessH2Tags,
  isHarnessCompletionTruncated,
  validateHarnessSectionOrThrow,
} from "@/lib/bulk/harness-section-validate";

describe("isHarnessCompletionTruncated", () => {
  it("detects length and max_tokens finish reasons", () => {
    expect(isHarnessCompletionTruncated("length")).toBe(true);
    expect(isHarnessCompletionTruncated("max_tokens")).toBe(true);
    expect(isHarnessCompletionTruncated("stop")).toBe(false);
  });
});

describe("countHarnessH2Tags", () => {
  it("counts only h2 tags", () => {
    expect(countHarnessH2Tags('<h2>A</h2><p>x</p><h3>B</h3><h2>C</h2>')).toBe(2);
  });
});

describe("validateHarnessSectionOrThrow", () => {
  it("rejects sections without an h2 and a complete paragraph", () => {
    expect(() =>
      validateHarnessSectionOrThrow("<p>Only paragraph.</p>", {
        title: "Missing",
        isOverview: false,
      }),
    ).toThrow(/missing <h2>/);
    expect(() =>
      validateHarnessSectionOrThrow('<h2>T</h2><p>Cut off mid sentence without ending', {
        title: "T",
        isOverview: false,
      }),
    ).toThrow(/no complete paragraphs/);
  });

  it("rejects sections truncated by the token limit", () => {
    expect(() =>
      validateHarnessSectionOrThrow('<h2>T</h2><p>Complete sentence here.</p>', {
        title: "T",
        finishReason: "length",
        isOverview: false,
      }),
    ).toThrow(/truncated/);
  });

  it("accepts a complete body section", () => {
    expect(() =>
      validateHarnessSectionOrThrow('<h2>T</h2><p>Complete sentence here.</p>', {
        title: "T",
        finishReason: "stop",
        isOverview: false,
      }),
    ).not.toThrow();
  });
});
