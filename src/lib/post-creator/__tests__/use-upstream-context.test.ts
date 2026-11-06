import { describe, expect, it } from "vitest";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { postCreatorPayloadFromContract } from "@/lib/post-creator/post-creator-agent-harness";
import { applyUpstreamContextToPostCreatorPayload } from "@/lib/workflow/upstream-research-facts";

describe("useUpstreamContext", () => {
  it("defaults off and does not inject previous-agent facts", () => {
    const payload = postCreatorPayloadFromContract({
      postCount: 1,
      keywordSource: "gsc",
      workflowContextBlock: "Neighborhood SWOT facts.",
    });
    expect(payload.useUpstreamContext).toBe(false);
    expect(payload.optionalPrompt).toBeUndefined();
  });

  it("copies prefilled import rows and the flag from the contract", () => {
    const payload = postCreatorPayloadFromContract({
      useUpstreamContext: true,
      prefilledImportRows: [
        {
          keyword: "window blinds",
          title: "Window blinds",
          destination_url: "https://example.com/blinds/",
          seo_research: "Prairie sun and frost at entry doors.",
        },
      ],
    });
    expect(payload.useUpstreamContext).toBe(true);
    expect(payload.keywordSource).toBe("manual");
    expect(payload.postCount).toBe(1);
    expect(payload.prefilledImportRows?.[0]?.prompt_modifier).toContain("MANDATORY SOURCE FACTS");
    expect(payload.prefilledImportRows?.[0]?.prompt_modifier).toContain("Prairie sun");
  });

  it("leaves row keyword and URL in place when the flag is off", () => {
    const prefilledImportRows: CSVRow[] = [
      {
        keyword: "window blinds",
        title: "Window blinds",
        destination_url: "https://example.com/blinds/",
        seo_research: "Prairie sun",
      },
    ];
    const payload = applyUpstreamContextToPostCreatorPayload({
      useUpstreamContext: false,
      prefilledImportRows,
    });
    expect(payload.prefilledImportRows?.[0]?.prompt_modifier).toBeUndefined();
    expect(payload.prefilledImportRows?.[0]?.keyword).toBe("window blinds");
  });
});
