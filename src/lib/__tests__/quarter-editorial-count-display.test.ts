import { describe, expect, it } from "vitest";
import type { QuarterEditorialTileStats } from "@/lib/wordpress-api/types";
import {
  entityStripLoading,
  editorialPostsMonthBreakdown,
  formatQuarterCountCell,
  postsStripLoading,
  quarterPairTotalForStrip,
} from "@/lib/quarter-editorial-count-display";

function tile(partial: Partial<QuarterEditorialTileStats>): QuarterEditorialTileStats {
  return {
    quarterLabel: "M10",
    loading: false,
    postsLive: null,
    postsScheduled: null,
    entityLive: null,
    entityScheduled: null,
    entityConfigured: false,
    entityCountsAvailable: false,
    countsPeriodAfterIso: "2026-10-01T00:00:00.000Z",
    countsPeriodEndExclusiveIso: "2026-11-01T00:00:00.000Z",
    countsPeriodMode: "month",
    ...partial,
  };
}

describe("quarter-editorial-count-display", () => {
  it("postsStripLoading is true whenever stats.loading is true (stale numbers ignored)", () => {
    const stats = tile({ loading: true, postsLive: 3, postsScheduled: 15 });
    expect(postsStripLoading(stats)).toBe(true);
    expect(
      formatQuarterCountCell(
        quarterPairTotalForStrip(stats.postsLive, stats.postsScheduled, postsStripLoading(stats)),
        postsStripLoading(stats),
      ),
    ).toBe("—");
  });

  it("entityStripLoading respects showEntityCount", () => {
    const stats = tile({ loading: true, entityLive: 5, entityScheduled: 0, entityConfigured: true });
    expect(entityStripLoading(stats, false)).toBe(false);
    expect(entityStripLoading(stats, true)).toBe(true);
  });

  it("formatQuarterCountCell shows digits when not loading", () => {
    expect(formatQuarterCountCell(18, false)).toBe("18");
    expect(formatQuarterCountCell(null, false)).toBe("—");
  });

  it("editorialPostsMonthBreakdown sums published and scheduled for the month", () => {
    const row = editorialPostsMonthBreakdown(2, 1, false);
    expect(row.total).toBe(3);
    expect(row.summary).toBe("2 published + 1 scheduled (3 in month)");
  });
});
