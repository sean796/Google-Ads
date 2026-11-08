import { describe, expect, it } from "vitest";
import {
  buildCompanyKeepContentSheetRow,
  partitionCompanyEditorialRows,
} from "@/lib/sitemap-optimizer/company-content-policy";
import {
  buildRedirectMapFamilyRows,
} from "@/lib/sitemap-optimizer/build-grid-pulse-redirect-redirects";
import { COMPANY_TAG_LABEL, COMPANY_TOPIC_TAG } from "@/lib/sitemap-optimizer/grid-company-news";
import { brandTokensFromSiteUrl } from "@/lib/sitemap-optimizer/site-brand-tokens";
import type { SitemapOptimizerPostRow } from "@/lib/sitemap-optimizer/types";

function row(overrides: Partial<SitemapOptimizerPostRow> = {}): SitemapOptimizerPostRow {
  return {
    postId: "wp:1",
    url: "https://www.kwbllp.com/blog/example/",
    collection: "posts",
    title: "Example",
    keyword: "",
    meta: "Meta",
    contentSnippet: "",
    gscQueries: [],
    gscFetched: true,
    ...overrides,
  };
}

describe("partitionCompanyEditorialRows", () => {
  it("derives brand from hostname and tags firm slug content as company", () => {
    const siteUrl = "https://www.kwbllp.com";
    const tokens = brandTokensFromSiteUrl(siteUrl);
    expect(tokens).toContain("kwbllp");

    const { editorial, company } = partitionCompanyEditorialRows(
      [
        row({
          postId: "wp:co",
          url: "https://www.kwbllp.com/blog/kwb-llp-updates/",
          gridRedirectFromUrl: "https://www.kwbllp.com/2014/12/19/merry-christmas-from-kwb/",
          title: "Merry Christmas from KWB",
        }),
        row({
          postId: "wp:ed",
          url: "https://www.kwbllp.com/blog/quickbooks-online-optimization/",
          gridRedirectFromUrl: "https://www.kwbllp.com/2026/02/05/how-to-get-the-most-out-of-quickbooks-online/",
          title: "How to Get the Most Out of QuickBooks Online",
        }),
      ],
      siteUrl,
    );

    expect(company).toHaveLength(1);
    expect(company[0]?.postId).toBe("wp:co");
    expect(company[0]?.gridTopicTag).toBe(COMPANY_TOPIC_TAG);
    expect(company[0]?.url).toContain("merry-christmas-from-kwb");
    expect(editorial).toHaveLength(1);
    expect(editorial[0]?.postId).toBe("wp:ed");
  });
});

describe("buildCompanyKeepContentSheetRow", () => {
  it("uses keep action and legacy URL without redirect destination", () => {
    const keep = buildCompanyKeepContentSheetRow(
      row({
        url: "https://www.kwbllp.com/blog/wrong-dest/",
        gridRedirectFromUrl: "https://www.kwbllp.com/2014/12/19/merry-christmas-from-kwb/",
        title: "Merry Christmas from KWB",
        gridTopicTag: COMPANY_TOPIC_TAG,
        gridTagLabel: COMPANY_TAG_LABEL,
      }),
    );
    expect(keep.action).toBe("keep");
    expect(keep.proposedDestinationUrl).toContain("merry-christmas-from-kwb");
    expect(keep.gridTopicTag).toBe(COMPANY_TOPIC_TAG);
  });
});

describe("buildRedirectMapFamilyRows company exclusion", () => {
  it("omits company rows from redirect export", () => {
    const companyRow = row({
      postId: "wp:co",
      url: "https://www.kwbllp.com/2014/12/19/merry-christmas-from-kwb/",
      gridRedirectFromUrl: "https://www.kwbllp.com/2014/12/19/merry-christmas-from-kwb/",
      title: "Merry Christmas from KWB",
      gridTopicTag: COMPANY_TOPIC_TAG,
      gridTagLabel: COMPANY_TAG_LABEL,
    });
    const editorialRow = row({
      postId: "wp:ed",
      url: "https://www.kwbllp.com/blog/quickbooks-online-optimization/",
      gridRedirectFromUrl: "https://www.kwbllp.com/2026/02/05/how-to-get-the-most-out-of-quickbooks-online/",
      title: "QuickBooks Online Tips",
    });

    const result = {
      rows: [editorialRow, companyRow],
      clusters: {
        clusters: [
          {
            clusterId: "c-ed",
            label: "QB",
            intent: "informational" as const,
            memberPostIds: ["wp:ed"],
            confidence: "high" as const,
            rationale: "",
          },
          {
            clusterId: "company-keep-wp:co",
            label: "Company",
            intent: "mixed" as const,
            memberPostIds: ["wp:co"],
            confidence: "high" as const,
            rationale: "",
          },
        ],
        singletons: [],
      },
      merges: [
        {
          clusterId: "c-ed",
          recommendedTitle: "QuickBooks Online Optimization Guide",
          recommendedPrimaryKeyword: "quickbooks online optimization",
          recommendedMeta: "Learn how to optimize QuickBooks Online for your business with practical workflow tips.",
          combinedOutline: ["Setup", "Workflows"],
          whatToKeepFromEach: [],
          redirectOrCanonicalNote: "",
          priority: "medium" as const,
          confidence: "high" as const,
          rationale: "",
          lockedDestinationUrl: editorialRow.url,
        },
      ],
      contentSheet: [],
      gscMissCount: 0,
      dateRange: { startDate: "", endDate: "" },
      analyzedAt: "2026-06-01T00:00:00.000Z",
      runMode: "wordpress" as const,
      gridMaxUrlsPerPost: 1 as const,
      blogDestination: { forceBlogPermalink: true, parentPrefix: "blog" },
    };

    const familyRows = buildRedirectMapFamilyRows(result);
    expect(familyRows).toHaveLength(1);
    expect(familyRows[0]?.sourceUrl).toContain("how-to-get-the-most-out-of-quickbooks");
  });
});
