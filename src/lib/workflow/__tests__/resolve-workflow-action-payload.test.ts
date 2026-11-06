import { describe, expect, it } from "vitest";
import {
  applyEntityPageCreatorWorkflowFocusKeyword,
  resolveWorkflowActionPayload,
} from "@/lib/workflow/resolve-workflow-action-payload";
import { stashWorkflowGridCsv } from "@/lib/workflow/workflow-grid-csv-stash";

describe("resolveWorkflowActionPayload", () => {
  it("strips pipe brand suffix from site name for local_dominator_export", () => {
    const result = resolveWorkflowActionPayload(
      "local_dominator_export",
      { keyword: "auto" },
      { name: "Blind Magic Window Coverings | Hunter Douglas Blinds", siteUrl: "https://example.com" },
    );
    expect(result.businessName).toBe("Blind Magic Window Coverings");
  });

  it("fills businessName from site for local_dominator_export when empty", () => {
    const result = resolveWorkflowActionPayload(
      "local_dominator_export",
      { keyword: "blinds near me" },
      { name: "Advance Blinds", siteUrl: "https://example.com" },
    );
    expect(result.businessName).toBe("Advance Blinds");
    expect(result.keyword).toBe("blinds near me");
  });

  it("passes empty keyword for local_dominator_export auto grid selection", () => {
    const result = resolveWorkflowActionPayload(
      "local_dominator_export",
      { businessName: "", keyword: "auto" },
      { name: "Advance Blinds", siteUrl: "https://example.com" },
    );
    expect(result.businessName).toBe("Advance Blinds");
    expect(result.keyword).toBe("auto");
  });

  it("overrides stale stored businessName from workflow client site for local_dominator_export", () => {
    const result = resolveWorkflowActionPayload(
      "local_dominator_export",
      { businessName: "Custom Co", keyword: "plumber" },
      { name: "Advance Blinds", siteUrl: "https://example.com" },
    );
    expect(result.businessName).toBe("Advance Blinds");
  });

  it("does not fill businessName when site name is missing", () => {
    const result = resolveWorkflowActionPayload(
      "local_dominator_export",
      { keyword: "blinds near me" },
      null,
    );
    expect(result.businessName).toBeUndefined();
  });

  it("fills businessName from site for entity_page_creator when empty", () => {
    const result = resolveWorkflowActionPayload(
      "entity_page_creator",
      { focusKeyword: "blinds near me" },
      { name: "Advance Blinds", siteUrl: "https://example.com" },
    );
    expect(result.businessName).toBe("Advance Blinds");
  });

  it("passes through other execution kinds unchanged", () => {
    const payload = { keyword: "test" };
    const result = resolveWorkflowActionPayload("gsc_reporting", payload, { name: "Site A", siteUrl: "https://example.com" });
    expect(result).toEqual(payload);
  });

  it("fills entity focusKeyword from stashed grid keyword in grid mode", () => {
    stashWorkflowGridCsv(42, "csv", [{ name: "grid.csv", url: "https://example.com/grid.csv" }], "kwb near me");
    const result = resolveWorkflowActionPayload(
      "entity_page_creator",
      { locationSource: "grid", gridInputSource: "workflow", focusKeyword: "" },
      { name: "KWB", siteUrl: "https://example.com" },
      42,
    );
    expect(result.focusKeyword).toBe("kwb near me");
  });

  it("fills entity focusKeyword from stashed grid CSV when keyword stash is empty", () => {
    const csv = "Keyword,Rank,Latitude,Longitude\nblinds near me,1,51.0,-114.0\nblinds near me,2,51.1,-114.1";
    stashWorkflowGridCsv(44, csv, [{ name: "grid.csv", url: "https://example.com/grid.csv" }]);
    const result = resolveWorkflowActionPayload(
      "entity_page_creator",
      { locationSource: "grid", gridInputSource: "workflow", focusKeyword: "" },
      { name: "KWB", siteUrl: "https://example.com" },
      44,
    );
    expect(result.focusKeyword).toBe("blinds near me");
  });

  it("promotes wiki entity payload to grid workflow mode when grid CSV is stashed", () => {
    stashWorkflowGridCsv(45, "Keyword,Rank,Latitude,Longitude\nkwb near me,1,51.0,-114.0", [
      { name: "grid.csv", url: "https://example.com/grid.csv" },
    ]);
    const result = resolveWorkflowActionPayload(
      "entity_page_creator",
      { locationSource: "wiki", focusKeyword: "" },
      { name: "KWB", siteUrl: "https://example.com" },
      45,
    );
    expect(result.focusKeyword).toBe("kwb near me");
    expect(result.locationSource).toBe("grid");
    expect(result.gridInputSource).toBe("workflow");
  });

  it("uses site name when business listing CSV has no Keyword column", () => {
    const csv = [
      "Business Name,Address,Average Rank,Latitude,Longitude,Place ID",
      '"TaxRush Accounting Solutions","8826 51 Ave NW Unit 200, Edmonton, AB T6E 5E8","8.78","","",5319387678612147329',
    ].join("\n");
    stashWorkflowGridCsv(47, csv, [{ name: "grid.csv", url: "https://example.com/grid.csv" }]);
    const result = resolveWorkflowActionPayload(
      "entity_page_creator",
      { locationSource: "wiki", focusKeyword: "" },
      { name: "KWB", siteUrl: "https://example.com" },
      47,
    );
    expect(result.focusKeyword).toBe("KWB");
    expect(result.locationSource).toBe("grid");
    expect(result.gridInputSource).toBe("workflow");
  });

  it("applyEntityPageCreatorWorkflowFocusKeyword leaves explicit focusKeyword unchanged", () => {
    stashWorkflowGridCsv(43, "csv", [{ name: "grid.csv", url: "https://example.com/grid.csv" }], "other");
    const result = applyEntityPageCreatorWorkflowFocusKeyword(
      { locationSource: "grid", focusKeyword: "custom keyword" },
      43,
    );
    expect(result.focusKeyword).toBe("custom keyword");
  });

  it("resolves browser_automation client_site URL from site record", () => {
    const result = resolveWorkflowActionPayload(
      "browser_automation",
      {
        targetUrlSource: "client_site",
        browserInstructionsHtml: "<p>Audit</p>",
      },
      { name: "Site A", siteUrl: "https://a.example/" },
    );
    expect(result.targetUrl).toBe("https://a.example/");
  });
});
