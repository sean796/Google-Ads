import { describe, expect, it } from "vitest";
import {
  DEFAULT_ENTITY_AD_GROUP_COUNT,
  DEFAULT_ENTITY_ADS_PER_GROUP,
  ensureEntityPageCreatorPayload,
} from "@/lib/entity-page-creator/entity-page-creator-defaults";
import { DEFAULT_ENTITY_PAGE_CREATOR_ENTITY_TYPE_FOCUS } from "@/lib/entity-page-creator/entity-page-creator-cluster-context";
import { resolveEntityPageCreatorClusterContext } from "@/lib/entity-page-creator/entity-page-creator-cluster-context";
import type { WordPressSite } from "@/components/integrations/types";
import { entitySapTotalFromParts } from "@/lib/local-analysis/entity-ad-group-budget";
import { resolveUpstreamGridCsvUrlFromOutputs } from "@/lib/entity-page-creator/resolve-upstream-grid-csv";
import { resolveUpstreamEntityCsvUrlFromOutputs } from "@/lib/entity-page-creator/resolve-upstream-entity-csv";
import { parseCsvStaticText } from "@/lib/bulk/bulk-csv-parser";
import type { WorkflowStepOutput } from "@/lib/workflow/workflow-types";

describe("ensureEntityPageCreatorPayload", () => {
  it("derives entityPageCount from ad group layout", () => {
    const payload = ensureEntityPageCreatorPayload({
      entityAdGroupCount: 3,
      entityAdsPerGroup: 5,
    });
    expect(payload.entityPageCount).toBe(15);
    expect(payload.postCount).toBe(15);
    expect(payload.scheduleTimesPerMonth).toBe(15);
    expect(payload.locationSource).toBe("grid");
    expect(payload.gridInputSource).toBe("workflow");
    expect(payload.sitemapType).toBe("entity");
  });

  it("defaults ad group counts", () => {
    const payload = ensureEntityPageCreatorPayload({});
    expect(payload.entityAdGroupCount).toBe(DEFAULT_ENTITY_AD_GROUP_COUNT);
    expect(payload.entityAdsPerGroup).toBe(DEFAULT_ENTITY_ADS_PER_GROUP);
    expect(entitySapTotalFromParts(payload.entityAdGroupCount!, payload.entityAdsPerGroup!)).toBe(15);
  });

  it("defaults entity type focus to business districts before neighbourhoods", () => {
    const payload = ensureEntityPageCreatorPayload({});
    expect(payload.entityTypeFocus).toEqual([...DEFAULT_ENTITY_PAGE_CREATOR_ENTITY_TYPE_FOCUS]);
    expect(payload.entityTypeFocus?.[0]).toContain("Business districts");
  });
});

describe("resolveEntityPageCreatorClusterContext", () => {
  const site: WordPressSite = {
    id: "wp-test",
    name: "KWB LLP",
    siteUrl: "https://kwb.example.com",
    username: "u",
    appPassword: "p",
    connectedAt: 0,
    entitySitemapUrl: "https://kwb.example.com/entity-sitemap.xml",
  };

  it("builds client audience markdown from site and payload without manual UI", () => {
    const ctx = resolveEntityPageCreatorClusterContext({
      site,
      payload: ensureEntityPageCreatorPayload({
        businessName: "KWB LLP",
        focusKeyword: "accounting services",
      }),
      gridPlaceHints: ["Sherwood Park, AB"],
      focusKeyword: "accounting services",
    });
    expect(ctx.businessName).toBe("KWB LLP");
    expect(ctx.entityTypeFocus[0]).toContain("Business districts");
    expect(ctx.clientAudienceContextMarkdown).toContain("KWB LLP");
    expect(ctx.clientAudienceContextMarkdown).toContain("accounting services");
    expect(ctx.clientAudienceContextMarkdown).toContain("Sherwood Park, AB");
  });
});

describe("resolveUpstreamGridCsvUrlFromOutputs", () => {
  it("picks csv file ref from upstream output", () => {
    const outputs: WorkflowStepOutput[] = [
      {
        id: 1,
        runId: 1,
        nodeId: "a",
        variableKey: "local_dominator_export_1",
        scope: "run",
        label: "Grid export",
        textPreview: "done",
        fileRefs: [{ name: "grid.csv", url: "https://example.com/grid.csv", mime: "text/csv" }],
        createdAt: "",
      },
    ];
    expect(
      resolveUpstreamGridCsvUrlFromOutputs(outputs, ["local_dominator_export_1"]),
    ).toBe("https://example.com/grid.csv");
  });

  it("throws when no csv file ref exists", () => {
    const outputs: WorkflowStepOutput[] = [
      {
        id: 1,
        runId: 1,
        nodeId: "a",
        variableKey: "local_dominator_export_1",
        scope: "run",
        label: "Grid export",
        textPreview: "done",
        fileRefs: [],
        createdAt: "",
      },
    ];
    expect(() => resolveUpstreamGridCsvUrlFromOutputs(outputs)).toThrow(
      /did not produce a grid CSV/i,
    );
  });
});

describe("resolveUpstreamEntityCsvUrlFromOutputs", () => {
  it("picks entity-bulk.csv from upstream entity generator output", () => {
    const outputs: WorkflowStepOutput[] = [
      {
        id: 1,
        runId: 1,
        nodeId: "a",
        variableKey: "entity_generator_1",
        scope: "run",
        label: "Entity bulk CSV",
        textPreview: "done",
        fileRefs: [{ name: "entity-bulk.csv", url: "https://example.com/entity-bulk.csv", mime: "text/csv" }],
        createdAt: "",
      },
    ];
    expect(
      resolveUpstreamEntityCsvUrlFromOutputs(outputs, ["entity_generator_1"]),
    ).toBe("https://example.com/entity-bulk.csv");
  });

  it("throws when no entity csv file ref exists", () => {
    const outputs: WorkflowStepOutput[] = [
      {
        id: 1,
        runId: 1,
        nodeId: "a",
        variableKey: "entity_generator_1",
        scope: "run",
        label: "Entity generator",
        textPreview: "done",
        fileRefs: [],
        createdAt: "",
      },
    ];
    expect(() => resolveUpstreamEntityCsvUrlFromOutputs(outputs)).toThrow(
      /did not produce an entity CSV/i,
    );
  });
});

describe("parseCsvStaticText neo passwords fixture", () => {
  const neoRowCsv = `keyword,entity,title,modifier,featuredImage,publish_date_gmt,sitemap_type,meta_description,target_slug,wikipedia_url,wikipedia_title
blinds and drapery municipality of rhineland altona,"Municipality of Rhineland, Altona, MB","Blinds And Drapery Near Municipality Of Rhineland, Altona, MB",,google-maps,,entity,"Discover top-quality blinds and drapery services in the Municipality of Rhineland, Altona, MB.",blinds-and-drapery-municipality-of-rhineland-altona-mb,https://en.wikipedia.org/wiki/Municipality_of_Rhineland,Municipality of Rhineland`;

  it("parses hydrated entity csv columns", () => {
    const rows = parseCsvStaticText(neoRowCsv);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.entity).toContain("Municipality of Rhineland");
    expect(rows[0]?.keyword).toContain("blinds and drapery");
    expect(rows[0]?.target_slug).toBe("blinds-and-drapery-municipality-of-rhineland-altona-mb");
    expect(rows[0]?.wikipedia_url).toContain("wikipedia.org");
  });
});
