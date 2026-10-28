import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import {
  applyEditorialPackageEntityPageCount,
  entitySapPagesForSiteEditorialPackage,
} from "@/lib/editorial/apply-editorial-package-entity-page-count";

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

describe("editorial package entity SAP count", () => {
  it("uses Standard SAP quota for mapped property names", () => {
    expect(entitySapPagesForSiteEditorialPackage(site({ name: "Interiors by Laura" }))).toBe(4);
  });

  it("uses Lite SAP quota for mapped lite clients", () => {
    expect(entitySapPagesForSiteEditorialPackage(site({ name: "Advance Blinds" }))).toBe(2);
  });

  it("applyEditorialPackageEntityPageCount sets schedule fields from quota", () => {
    const applied = applyEditorialPackageEntityPageCount({}, site({ name: "Interiors by Laura" }));
    expect(applied.entityPageCount).toBe(4);
    expect(applied.scheduleTimesPerMonth).toBe(4);
    expect(applied.postCount).toBe(4);
  });

  it("skips package apply when Custom is selected", () => {
    const applied = applyEditorialPackageEntityPageCount(
      { entityUseEditorialPackage: false, entityPageCount: 7 },
      site({ name: "Interiors by Laura" }),
    );
    expect(applied.entityPageCount).toBe(7);
  });

  it("throws when site is missing", () => {
    expect(() => applyEditorialPackageEntityPageCount({}, null)).toThrow(/client/i);
  });
});
