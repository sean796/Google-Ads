import { describe, expect, it } from "vitest";
import {
  buildGbpLiveMessage,
  buildGbpPostBulkGeneratorDetailsProps,
  gbpPostDetailsCanOpen,
  gbpPostSiteToCsvRow,
} from "@/lib/gbp-post/gbp-post-bulk-generator-bindings";
import { GBP_POST_PIPELINE_TITLES } from "@/lib/gbp-post/gbp-post-card-pipeline";
import type { WordPressSite } from "@/components/integrations/types";

const sampleSite: WordPressSite = {
  id: "site-1",
  name: "Advance Blinds",
  siteUrl: "https://example.com",
  username: "user",
  appPassword: "pass",
  connectedAt: 0,
  gbpLocationId: "loc-1",
  enabled: true,
};

const sampleSite2: WordPressSite = {
  id: "site-2",
  name: "You Junk It... I Dump It",
  siteUrl: "https://junk.example.com",
  username: "user",
  appPassword: "pass",
  connectedAt: 0,
  gbpLocationId: "loc-2",
  enabled: true,
};

describe("gbp-post-bulk-generator-bindings", () => {
  it("maps GBP sites to csv rows for the universal details drawer", () => {
    const csvRow = gbpPostSiteToCsvRow(sampleSite, "Tailored Interiors");
    expect(csvRow.keyword).toBe("Tailored Interiors");
    expect(csvRow.title).toBe("Advance Blinds");
    expect(csvRow.destination_url).toBe("https://example.com");
  });

  it("prefers landing page URL over site URL in csv rows", () => {
    const csvRow = gbpPostSiteToCsvRow(
      sampleSite,
      "blinds",
      "https://example.com/custom-landing",
    );
    expect(csvRow.destination_url).toBe("https://example.com/custom-landing");
  });

  it("builds BulkGeneratorDetailsPanelProps with pipeline titles and live message", () => {
    const props = buildGbpPostBulkGeneratorDetailsProps({
      displaySite: sampleSite,
      selectedSites: [sampleSite],
      topicForSite: () => "Tailored Interiors",
      landingPageForSite: () => "https://example.com/pages/blinds",
      sitemapSource: "pages",
      isPosting: false,
      workspaceBusy: false,
      statusLine: "Internal error encountered.",
      resolvedTopic: "Tailored Interiors",
      harnessSections: [],
      harnessSectionsBySiteId: {},
      harnessPlannedCount: 3,
      bulkSlotIndex: 0,
      harnessTotalRows: 1,
      multiPropertyRun: false,
      activeSiteId: null,
      activePropertyIndex: 0,
      previewBySiteId: {},
      inventoryLinkBySiteId: {},
      bulkSummary: { published: 5, queued: 0, failed: 5 },
      numberOfPosts: 1,
      selectedCount: 10,
      rosterCount: 10,
    });

    expect(props.variant).toBe("csv");
    expect(props.displayRows).toHaveLength(1);
    expect(props.pipelineSectionTitles).toEqual([...GBP_POST_PIPELINE_TITLES]);
    expect(props.liveMessage).toContain("Advance Blinds");
    expect(props.liveMessage).toContain("5 published, 0 queued, 5 failed");
  });

  it("buildGbpLiveMessage includes workspace context", () => {
    const message = buildGbpLiveMessage({
      displaySite: sampleSite,
      sitemapSource: "pages",
      selectedCount: 10,
      rosterCount: 10,
      numberOfPosts: 1,
      resolvedTopic: "Tailored Interiors",
      keyword: "Tailored Interiors",
      multiSiteDrawer: false,
      isPosting: false,
      statusLine: "",
      bulkSummary: null,
    });
    expect(message).toContain("Pages");
    expect(message).toContain("10/10 selected");
  });

  it("maps multi-site harness and inventory to the matching row after batch", () => {
    const props = buildGbpPostBulkGeneratorDetailsProps({
      displaySite: sampleSite,
      selectedSites: [sampleSite, sampleSite2],
      topicForSite: (id) => (id === "site-1" ? "Advance topic" : "Junk topic"),
      landingPageForSite: (id) =>
        id === "site-1" ? "https://example.com/advance" : "https://junk.example.com/dump",
      sitemapSource: "pages",
      isPosting: false,
      workspaceBusy: false,
      statusLine: "Done: 2 published, 0 queued.",
      resolvedTopic: "You Junk It... I Dump It: Junk topic",
      harnessSections: [],
      harnessSectionsBySiteId: {
        "site-1": [
          { sectionIndex: 0, title: "Topic", status: "done", markdown: "Topic: Advance topic" },
          { sectionIndex: 1, title: "Site page", status: "done" },
          { sectionIndex: 2, title: "Post card", status: "done", markdown: "Post card published." },
        ],
        "site-2": [
          { sectionIndex: 0, title: "Topic", status: "done", markdown: "Topic: Junk topic" },
          { sectionIndex: 1, title: "Site page", status: "done" },
          { sectionIndex: 2, title: "Post card", status: "done", markdown: "Post card published." },
        ],
      },
      harnessPlannedCount: 3,
      bulkSlotIndex: 0,
      harnessTotalRows: 2,
      multiPropertyRun: false,
      activeSiteId: null,
      activePropertyIndex: 0,
      previewBySiteId: {},
      inventoryLinkBySiteId: {
        "site-2": {
          href: "blob:junk",
          filename: "gbp-posts-You-Junk-It-I-Dump-It-123.json",
          rowCount: 4,
        },
      },
      bulkSummary: { published: 2, queued: 0, failed: 0 },
      numberOfPosts: 1,
      selectedCount: 2,
      rosterCount: 10,
    });

    expect(props.displayRows).toHaveLength(2);
    expect(props.displayRows[0]?.title).toBe("Advance Blinds");
    expect(props.displayRows[1]?.title).toBe("You Junk It... I Dump It");
    expect(props.harnessByRow?.get(0)?.[0]?.markdown).toContain("Advance topic");
    expect(props.harnessByRow?.get(1)?.[0]?.markdown).toContain("Junk topic");
    expect(props.filesByRow?.get(0)).toBeUndefined();
    expect(props.filesByRow?.get(1)?.[0]?.fileName).toContain("You-Junk-It");
    expect(props.liveMessage).toContain("2 sites");
    expect(props.liveMessage).not.toContain("You Junk It");
  });

  it("maps activeSiteId to currentRow during multi-site posting", () => {
    const props = buildGbpPostBulkGeneratorDetailsProps({
      displaySite: sampleSite,
      selectedSites: [sampleSite, sampleSite2],
      topicForSite: (id) => (id === "site-1" ? "Advance topic" : "Junk topic"),
      landingPageForSite: (id) =>
        id === "site-1" ? "https://example.com/advance" : "https://junk.example.com/dump",
      sitemapSource: "pages",
      isPosting: true,
      workspaceBusy: true,
      statusLine: "You Junk It... I Dump It: Publishing to GBP…",
      resolvedTopic: "",
      harnessSections: [],
      harnessSectionsBySiteId: {
        "site-2": [{ sectionIndex: 0, title: "Topic", status: "generating" }],
      },
      harnessPlannedCount: 3,
      bulkSlotIndex: 0,
      harnessTotalRows: 2,
      multiPropertyRun: true,
      activeSiteId: "site-2",
      activePropertyIndex: 1,
      previewBySiteId: {},
      inventoryLinkBySiteId: {},
      bulkSummary: null,
      numberOfPosts: 1,
      selectedCount: 2,
      rosterCount: 10,
    });

    expect(props.displayRows).toHaveLength(2);
    expect(props.displayRows[1]?.title).toBe("You Junk It... I Dump It");
    expect(props.currentRow).toBe(1);
    expect(props.status).toBe("You Junk It... I Dump It: Publishing to GBP…");
    expect(props.headerProgress?.phase).toContain("Posting 2/2");
  });

  it("opens details when roster, selection, or run data exists", () => {
    expect(gbpPostDetailsCanOpen(10, false, false, true, false)).toBe(true);
    expect(gbpPostDetailsCanOpen(0, false, false, false, false)).toBe(false);
  });
});
