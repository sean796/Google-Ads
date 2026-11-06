import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/integrations/storage", () => ({
  getStoredSites: vi.fn(() => [
    {
      id: "kwb",
      name: "KWB",
      siteUrl: "https://kwbllp.com",
      entitySitemapUrl: "https://kwbllp.com/entity-sitemap.xml",
    },
  ]),
}));

import type { WordPressSite } from "@/components/integrations/types";
import { buildEntityPageCreatorWordPressPosting } from "@/lib/entity-page-creator/entity-page-creator-schedule";
import { resolveBulkWordPressPublishDate } from "@/lib/wordpress-scheduler";

const site: WordPressSite = {
  id: "kwb",
  name: "KWB",
  siteUrl: "https://kwbllp.com",
  username: "user",
  appPassword: "pass",
  connectedAt: 0,
  entitySitemapUrl: "https://kwbllp.com/entity-sitemap.xml",
};

describe("buildEntityPageCreatorWordPressPosting", () => {
  it("publishes immediately when scheduleFrequency is immediately", () => {
    const posting = buildEntityPageCreatorWordPressPosting(site, 3, {
      locationSource: "grid",
      entityAdGroupCount: 1,
      entityAdsPerGroup: 3,
      entityPageCount: 3,
      scheduleFrequency: "immediately",
      scheduleStartDateOption: "custom",
      postDestination: "wordpress",
    });
    expect(posting?.frequency).toBe("immediately");

    const { date, source } = resolveBulkWordPressPublishDate({
      rowIndex: 0,
      schedule: {
        frequency: posting!.frequency,
        customInterval: posting!.customInterval,
        customStaggerOptimized: posting!.customStaggerOptimized,
        dayOfWeek: posting!.dayOfWeek,
        startDate: posting!.startDate,
        startTime: posting!.startTime,
        totalRows: 3,
      },
    });
    expect(source).toBe("calculated");
    expect(date.getTime()).toBeLessThanOrEqual(Date.now() + 30_000);
  });

  it("does not treat custom frequency + immediate start option as publish now", () => {
    const posting = buildEntityPageCreatorWordPressPosting(site, 3, {
      locationSource: "grid",
      entityAdGroupCount: 1,
      entityAdsPerGroup: 3,
      entityPageCount: 3,
      scheduleFrequency: "custom",
      scheduleStartDateOption: "immediate",
      scheduleCustomInterval: 9,
      scheduleStartTime: "09:00",
      postDestination: "wordpress",
    });
    expect(posting?.frequency).toBe("custom");
    const { date } = resolveBulkWordPressPublishDate({
      rowIndex: 0,
      schedule: {
        frequency: posting!.frequency,
        customInterval: posting!.customInterval,
        customStaggerOptimized: posting!.customStaggerOptimized,
        dayOfWeek: posting!.dayOfWeek,
        startDate: posting!.startDate,
        startTime: posting!.startTime,
        totalRows: 3,
      },
    });
    expect(date.getTime()).toBeGreaterThan(Date.now());
  });

  it("passes schedulePublishDays onto WordPress posting options", () => {
    const posting = buildEntityPageCreatorWordPressPosting(site, 3, {
      locationSource: "grid",
      entityAdGroupCount: 1,
      entityAdsPerGroup: 3,
      entityPageCount: 3,
      scheduleFrequency: "custom",
      scheduleStartDateOption: "custom",
      scheduleCustomStartDate: "2026-03-01",
      scheduleCustomInterval: 3,
      scheduleTimesPerMonth: 3,
      scheduleStartTime: "09:00",
      schedulePublishDays: [3, 10, 20],
      postDestination: "wordpress",
    });
    expect(posting?.publishDays).toEqual([3, 10, 20]);
  });
});
