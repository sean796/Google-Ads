import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import { applySemrushProjectDefaults } from "./semrush-project-id-defaults";

const base = { id: "1", name: "x", username: "", appPassword: "", connectedAt: 0 } as unknown as WordPressSite;

describe("applySemrushProjectDefaults", () => {
  it("fills Site Audit and Position Tracking project IDs when tracking is on", () => {
    const next = applySemrushProjectDefaults({ ...base, siteUrl: "https://blindmagic.com/" });
    expect(next.semrushSiteAuditProjectId).toBe("25751625");
    expect(next.semrushPositionTrackingProjectId).toBe("25751625");
  });

  it("fills only Site Audit when tracking is off", () => {
    const next = applySemrushProjectDefaults({ ...base, siteUrl: "https://www.shutterspot.com" });
    expect(next.semrushSiteAuditProjectId).toBe("29672034");
    expect(next.semrushPositionTrackingProjectId).toBeUndefined();
  });

  it("fills Position Tracking campaign id for In the Shade and Interiors by Laura", () => {
    const shade = applySemrushProjectDefaults({ ...base, siteUrl: "https://intheshadeflorida.com/" });
    expect(shade.semrushSiteAuditProjectId).toBe("25786226");
    expect(shade.semrushPositionTrackingCampaignId).toBe("25786226_8251906");
    const laura = applySemrushProjectDefaults({ ...base, siteUrl: "https://interiorsbylaura.com/" });
    expect(laura.semrushSiteAuditProjectId).toBe("29036845");
    expect(laura.semrushPositionTrackingCampaignId).toBe("29036845_11197899");
  });

  it("keeps existing values and skips unknown or blank hosts", () => {
    const set = { ...base, siteUrl: "https://superiorblinds.com", semrushSiteAuditProjectId: "1", semrushPositionTrackingProjectId: "2" };
    expect(applySemrushProjectDefaults(set)).toBe(set);
    const unknown = { ...base, siteUrl: "https://eliteshadings.com" };
    expect(applySemrushProjectDefaults(unknown)).toBe(unknown);
    const blank = { ...base, siteUrl: "" };
    expect(applySemrushProjectDefaults(blank)).toBe(blank);
  });
});
