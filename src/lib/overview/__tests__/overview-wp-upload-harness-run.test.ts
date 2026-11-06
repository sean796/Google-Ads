import { describe, expect, it } from "vitest";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { WordPressSite } from "@/components/integrations/types";
import { initOverviewWpUploadHarnessBatchState } from "@/lib/overview/overview-wp-upload-harness-run";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";

function testSite(): WordPressSite {
  return {
    id: "site-1",
    name: "Test",
    siteUrl: "https://example.com",
    username: "user",
    appPassword: "pass",
    connectedAt: Date.now(),
  } as WordPressSite;
}

describe("initOverviewWpUploadHarnessBatchState", () => {
  it("sets batch Upload CSV harness section", () => {
    const rows: OverviewRow[] = [
      {
        url: "https://example.com/a/",
        title: "Title A",
        metaDescription: "Meta A",
        aiTitle: "",
        aiMeta: "",
        status: "idle",
        focusKeyword: "kw a",
      },
    ];
    const bindings: Record<string, OverviewBinding> = {
      "https://example.com/a/": { postId: 42, subtype: "post" },
    };

    let batchState: Record<string, BulkOptimizationState> = {};
    initOverviewWpUploadHarnessBatchState({
      site: testSite(),
      rows,
      bindings,
      setBulkOptimizationState: (updater) => {
        batchState = typeof updater === "function" ? updater(batchState) : updater;
      },
      setOptimizationProgress: () => {},
      setIsOptimizingContent: () => {},
    });

    const batch = batchState["site-1-batch"] as {
      wpUploadBatchHarnessSections?: Array<{ title: string; markdown?: string }>;
    };
    expect(batch?.wpUploadBatchHarnessSections?.[0]?.title).toBe("Upload");
    expect(batch?.wpUploadBatchHarnessSections?.[0]?.markdown).toMatch(/^```csv\n/);
    expect(batch?.wpUploadBatchHarnessSections?.[0]?.markdown).toContain("post_id");
    expect(batch?.wpUploadBatchHarnessSections?.[0]?.markdown).toContain("42");
  });
});
