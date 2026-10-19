import { describe, expect, it } from "vitest";
import {
  assertAiseoBodyRewriteChanged,
  assertAiseoHeadingRewriteChanged,
} from "@/lib/content-optimization/aiseo-full-rewrite-contract";

describe("aiseo full rewrite contract", () => {
  it("rejects identical body html", () => {
    expect(() => assertAiseoBodyRewriteChanged("<p>Same text</p>", "<p>Same text</p>")).toThrow(
      /identical plain text/i,
    );
  });

  it("accepts rephrased body html", () => {
    expect(() =>
      assertAiseoBodyRewriteChanged("<p>Old wording here.</p>", "<p>New wording here.</p>"),
    ).not.toThrow();
  });

  it("rejects identical headings", () => {
    expect(() => assertAiseoHeadingRewriteChanged("Office Blinds", "Office Blinds")).toThrow(
      /same title/i,
    );
  });
});
