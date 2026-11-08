import { describe, expect, it } from "vitest";
import { postFieldsOriginAppliesForSitemapType } from "@/lib/post-fields-origin-applies";

describe("postFieldsOriginAppliesForSitemapType", () => {
  it("applies only to entity sitemap rows", () => {
    expect(postFieldsOriginAppliesForSitemapType("entity")).toBe(true);
    expect(postFieldsOriginAppliesForSitemapType("post")).toBe(false);
    expect(postFieldsOriginAppliesForSitemapType(undefined)).toBe(false);
  });
});
