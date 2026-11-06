import { describe, expect, it } from "vitest";
import type { WorkflowStepOutput } from "@/lib/workflow/workflow-types";
import {
  findWorkflowSerpResearchFileRef,
  parseSeoContentBriefFromRow,
  serpResearchBriefArtifactName,
  serializeWorkflowSerpResearchBrief,
} from "@/lib/workflow/workflow-serp-research-cache";

describe("workflow-serp-research-cache", () => {
  it("builds stable serp brief artifact names from keyword slug", () => {
    expect(serpResearchBriefArtifactName("alberta tax brackets sherwood park")).toBe(
      "serp-research-brief-alberta-tax-brackets-sherwood-park.json",
    );
  });

  it("finds workflow serp brief file ref by keyword slug", () => {
    const outputs: WorkflowStepOutput[] = [
      {
        id: 1,
        runId: 1,
        nodeId: "archive",
        variableKey: "workflow_output",
        scope: "run",
        label: "Archive",
        textPreview: "",
        createdAt: "",
        fileRefs: [
          {
            name: "serp-research-brief-alberta-tax-brackets-sherwood-park.json",
            url: "https://example.com/serp.json",
            mime: "application/json",
          },
        ],
      },
    ];
    const ref = findWorkflowSerpResearchFileRef(outputs, "alberta tax brackets sherwood park");
    expect(ref?.url).toBe("https://example.com/serp.json");
  });

  it("parses seo_research from bulk row", () => {
    const brief = parseSeoContentBriefFromRow({
      seo_research: JSON.stringify({ focusKeyword: "test keyword", dataforseo: {} }),
    });
    expect(brief?.focusKeyword).toBe("test keyword");
  });

  it("serializes serp stored file alongside brief", () => {
    const json = serializeWorkflowSerpResearchBrief(
      {
        version: 1,
        generatedAt: "",
        focusKeyword: "kw",
        pageUrl: "",
        dataforseo: {
          seedKeyword: null,
          organic: [],
          peopleAlsoAsk: [],
          peopleAlsoSearchPhrases: [],
          relatedSearches: [],
          refinementChips: [],
          popularProducts: [],
        },
        gsc: { pageUrl: "", queries: [] },
        semrush: {
          urlOrganicKeywords: [],
          phraseRelatedKeywords: [],
          urlOrganicUrls: [],
          phraseRelatedUrls: [],
          phraseOrganicUrls: [],
          externalSemrushUrls: [],
        },
        llmAudit: { siteUrl: "", location: "", platforms: [] },
      },
      "serp-file.json",
    );
    const parsed = JSON.parse(json) as { serpStoredFile?: string };
    expect(parsed.serpStoredFile).toBe("serp-file.json");
  });
});
