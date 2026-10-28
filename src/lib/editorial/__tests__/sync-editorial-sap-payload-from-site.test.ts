import { describe, expect, it, vi } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import { entityInspectorPayloadForClientSite } from "@/lib/editorial/sync-editorial-sap-payload-from-site";

vi.mock("@/components/integrations/storage", () => ({
  getStoredSites: () => [
    {
      id: "kwb",
      name: "KWB",
      siteUrl: "https://example.com",
      username: "u",
      appPassword: "p",
      primaryLocalKeyword: "accounting services",
    } as WordPressSite,
  ],
}));

describe("entityInspectorPayloadForClientSite", () => {
  it("fills focus keyword from property profile when empty", () => {
    const next = entityInspectorPayloadForClientSite("kwb", {
      focusKeyword: "",
      entityUseEditorialPackage: true,
    });
    expect(next?.focusKeyword).toBe("accounting services");
  });

  it("does not overwrite a custom focus keyword", () => {
    const next = entityInspectorPayloadForClientSite("kwb", {
      focusKeyword: "custom phrase",
      entityUseEditorialPackage: true,
      entityEditorialPackageTier: "standard",
      entityPageCount: 4,
      scheduleTimesPerMonth: 4,
    });
    expect(next).toBeNull();
  });
});
