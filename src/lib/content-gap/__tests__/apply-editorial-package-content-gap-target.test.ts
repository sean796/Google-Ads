import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import {
  applyEditorialPackageContentGapTarget,
  contentGapTargetForSiteEditorialPackage,
  resolveContentGapCheckExecutionPayload,
} from "@/lib/content-gap/apply-editorial-package-content-gap-target";
import { ensureContentGapCheckPayload } from "@/lib/content-gap/resolve-content-gap-count";

function site(partial: Partial<WordPressSite>): WordPressSite {
  return {
    id: "s1",
    name: "Interiors by Laura",
    siteUrl: "https://example.com",
    username: "u",
    appPassword: "p",
    ...partial,
  } as WordPressSite;
}

describe("editorial package content gap target", () => {
  it("uses Standard blog quota for mapped property names", () => {
    expect(contentGapTargetForSiteEditorialPackage(site({ name: "Interiors by Laura" }), "posts")).toBe(2);
    expect(contentGapTargetForSiteEditorialPackage(site({ name: "Interiors by Laura" }), "sap")).toBe(4);
  });

  it("uses Lite quotas for mapped lite clients", () => {
    expect(contentGapTargetForSiteEditorialPackage(site({ name: "Advance Blinds" }), "posts")).toBe(1);
    expect(contentGapTargetForSiteEditorialPackage(site({ name: "Advance Blinds" }), "sap")).toBe(2);
  });

  it("respects explicit editorialContentPackage on the site", () => {
    expect(
      contentGapTargetForSiteEditorialPackage(
        site({ name: "Unknown Co", editorialContentPackage: "lite" }),
        "posts",
      ),
    ).toBe(1);
  });

  it("ensureContentGapCheckPayload leaves target unset when package mode is on", () => {
    expect(
      ensureContentGapCheckPayload({ contentGapUseEditorialPackage: true }).contentGapTargetCount,
    ).toBeUndefined();
    expect(ensureContentGapCheckPayload({}).contentGapTargetCount).toBe(4);
  });

  it("resolveContentGapCheckExecutionPayload applies package target", () => {
    const resolved = resolveContentGapCheckExecutionPayload(
      { contentGapUseEditorialPackage: true, contentGapSitemapSource: "posts" },
      site({ name: "Interiors by Laura" }),
    );
    expect(resolved.contentGapTargetCount).toBe(2);
  });

  it("throws when package mode is on but site is missing", () => {
    expect(() =>
      applyEditorialPackageContentGapTarget(
        { contentGapUseEditorialPackage: true },
        null,
      ),
    ).toThrow(/client/i);
  });
});
