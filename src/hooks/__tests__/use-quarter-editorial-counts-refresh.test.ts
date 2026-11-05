import { describe, expect, it } from "vitest";
import type { WordPressSite } from "@/components/integrations/types";
import { resolveEditorialCountsRangeForDashboard } from "@/lib/quarter-bounds";
import { buildQuarterTilesForRefresh } from "@/hooks/use-quarter-editorial-counts";
import { postsStripLoading } from "@/lib/quarter-editorial-count-display";
import type { QuarterEditorialTileStats } from "@/lib/wordpress-api/types";

function mockSite(id: string): WordPressSite {
  return {
    id,
    name: "Test",
    siteUrl: "https://example.com",
    username: "u",
    appPassword: "p",
    enabled: true,
  } as WordPressSite;
}

const monthKey = "2026-10";
const now = new Date("2026-10-02T12:00:00");
const resolveRange = (s: WordPressSite, at: Date) =>
  resolveEditorialCountsRangeForDashboard(s.editorialCountsPeriodStartYmd, monthKey, at);

describe("buildQuarterTilesForRefresh", () => {
  it("keeps prior non-zero blog and SAP totals visible while reloading the same window", () => {
    const site = mockSite("s1");
    const range = resolveRange(site, now);
    const prev: Record<string, QuarterEditorialTileStats> = {
      s1: {
        quarterLabel: range.quarterLabel,
        loading: false,
        errorTitle: "stale error",
        postsLive: 1,
        postsScheduled: 1,
        entityLive: 1,
        entityScheduled: 3,
        entityConfigured: true,
        entityCountsAvailable: true,
        countsPeriodAfterIso: range.after,
        countsPeriodEndExclusiveIso: range.before,
        countsPeriodMode: range.mode,
      },
    };

    const tile = buildQuarterTilesForRefresh([site], prev, resolveRange, now).s1;
    expect(postsStripLoading(tile)).toBe(true);
    expect(tile.errorTitle).toBeUndefined();
    expect(tile.postsScheduled).toBe(1);
    expect(tile.entityScheduled).toBe(3);
    expect(tile.entityConfigured).toBe(true);
  });

  it("uses a loading placeholder with SAP configured when there is nothing to preserve, and drops removed sites", () => {
    const site = mockSite("s1");
    const prev: Record<string, QuarterEditorialTileStats> = {
      gone: {
        quarterLabel: "x",
        loading: false,
        postsLive: 2,
        postsScheduled: 0,
        entityLive: 0,
        entityScheduled: 0,
        entityConfigured: true,
        entityCountsAvailable: true,
      },
    };

    const tiles = buildQuarterTilesForRefresh([site], prev, resolveRange, now);
    expect(tiles.gone).toBeUndefined();
    expect(tiles.s1.loading).toBe(true);
    expect(tiles.s1.postsScheduled).toBeNull();
    expect(tiles.s1.entityScheduled).toBeNull();
    expect(tiles.s1.entityConfigured).toBe(true);
  });
});
