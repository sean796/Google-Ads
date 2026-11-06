import { describe, expect, it } from "vitest";
import {
  hasOverviewContentDetailsActivity,
  hasSinglePageOptimizationDetailsActivity,
  isOverviewResearchWorkerActive,
  overviewContentDetailsCanOpen,
} from "@/components/overview/overview-tab/overview-content-details-helpers";
import { buildSinglePageOptimizationSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { WordPressSite } from "@/components/integrations/types";

describe("overviewContentDetailsCanOpen", () => {
  const site: WordPressSite = {
    id: "1",
    name: "Test Site",
    siteUrl: "https://example.com",
    username: "admin",
    appPassword: "test-password",
    connectedAt: 0,
  };

  it("returns false without site", () => {
    expect(overviewContentDetailsCanOpen(null, {}, undefined)).toBe(false);
  });

  it("returns false when only rows exist (no active run)", () => {
    expect(overviewContentDetailsCanOpen(site, {}, undefined)).toBe(false);
  });

  it("returns true when bulk slice is in progress", () => {
    expect(
      overviewContentDetailsCanOpen(site, { scrape: { total: 10, completed: 2 } }, undefined),
    ).toBe(true);
  });

  it("returns false when bulk slice is finished", () => {
    expect(
      overviewContentDetailsCanOpen(site, { scrape: { total: 10, completed: 10 } }, undefined),
    ).toBe(false);
  });

  it("returns true when batch has urls", () => {
    expect(
      overviewContentDetailsCanOpen(
        site,
        {},
        { urls: ["https://example.com/a"], urlStatuses: {} } as never,
      ),
    ).toBe(true);
  });

  it("returns true when single-page optimization is running", () => {
    expect(
      overviewContentDetailsCanOpen(site, {}, undefined, {
        siteId: "1",
        isOptimizingContent: { "1": true },
        optimizationProgress: {},
        optimizationFileManagers: {},
      }),
    ).toBe(true);
  });

  it("returns true when warm inventory is loading", () => {
    expect(
      overviewContentDetailsCanOpen(site, {}, undefined, undefined, {
        sitemapInventoryLinks: [],
        gscHostedLink: null,
        sitemapInventoryLoading: true,
      }),
    ).toBe(true);
  });

  it("returns true when warm inventory links exist", () => {
    expect(
      overviewContentDetailsCanOpen(site, {}, undefined, undefined, {
        sitemapInventoryLinks: [
          { label: "Pages", href: "blob:1", filename: "pages.json", rowCount: 1, source: "pages" },
        ],
        gscHostedLink: null,
        sitemapInventoryLoading: false,
      }),
    ).toBe(true);
  });
});

describe("hasOverviewContentDetailsActivity", () => {
  it("detects active slice vs completed slice", () => {
    expect(hasOverviewContentDetailsActivity({ contentKw: { total: 5, completed: 3 } }, undefined)).toBe(
      true,
    );
    expect(hasOverviewContentDetailsActivity({ contentKw: { total: 5, completed: 5 } }, undefined)).toBe(
      false,
    );
  });
});

describe("hasSinglePageOptimizationDetailsActivity", () => {
  it("detects optimizing flag and artifact files", () => {
    expect(
      hasSinglePageOptimizationDetailsActivity({
        siteId: "1",
        isOptimizingContent: { "1": true },
        optimizationProgress: {},
        optimizationFileManagers: {},
      }),
    ).toBe(true);

    const fileManager = {
      getFileCount: () => 2,
    } as never;

    expect(
      hasSinglePageOptimizationDetailsActivity({
        siteId: "1",
        isOptimizingContent: {},
        optimizationProgress: {},
        optimizationFileManagers: { "1": fileManager },
      }),
    ).toBe(true);
  });
});

describe("isOverviewResearchWorkerActive", () => {
  it("returns true when site optimizing flag is set", () => {
    expect(
      isOverviewResearchWorkerActive(undefined, "site1-batch", "site1", {
        "site1-batch": false,
        site1: true,
      }),
    ).toBe(true);
  });

  it("returns true for in-flight research batch state", () => {
    expect(
      isOverviewResearchWorkerActive(
        {
          runKind: "research",
          urls: ["https://example.com/a"],
          urlStatuses: { "https://example.com/a": "optimizing" },
          currentStep: "Researching…",
        } as never,
        "site1-batch",
        "site1",
        {},
      ),
    ).toBe(true);
  });

  it("returns false when research batch is complete", () => {
    expect(
      isOverviewResearchWorkerActive(
        {
          runKind: "research",
          urls: ["https://example.com/a"],
          urlStatuses: { "https://example.com/a": "completed" },
          currentStep: "Batch complete",
        } as never,
        "site1-batch",
        "site1",
        {},
      ),
    ).toBe(false);
  });

  it("returns false when every row is finished even if optimizing flags linger", () => {
    expect(
      isOverviewResearchWorkerActive(
        {
          runKind: "research",
          urls: ["https://example.com/a"],
          urlStatuses: { "https://example.com/a": "completed" },
          currentStep: "Researching…",
        } as never,
        "site1-batch",
        "site1",
        { "site1-batch": true, site1: true },
      ),
    ).toBe(false);
  });
});

describe("buildSinglePageOptimizationSnapshot", () => {
  it("builds header snapshot from optimization progress", () => {
    const snapshot = buildSinglePageOptimizationSnapshot(
      { step: "Blueprint", stepId: "plan", subProgress: 0, progress: 75, message: "Generating sections" },
      { isOptimizing: true, pageUrl: "https://example.com/page" },
    );
    expect(snapshot).toMatchObject({
      label: expect.stringContaining("https://example.com/page"),
      progressPct: 75,
    });
  });

  it("returns null when idle with no progress", () => {
    expect(buildSinglePageOptimizationSnapshot(undefined, { isOptimizing: false })).toBeNull();
  });
});
