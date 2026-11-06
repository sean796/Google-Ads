import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/bulk/bulk-content-generator", () => ({
  generateMarkdownContentHarnessed: vi.fn(async () => {
    throw new Error("model returned truncated section");
  }),
  addEntityLinksToContent: vi.fn(async (md: string) => md),
}));

import { runBulkRowContentAndMediaPhase } from "@/lib/bulk/bulk-row-content-media-phase";
import { BulkFileManager } from "@/lib/bulk-file-manager";
import type { BulkRowChecklistBlueprintPhaseResult } from "@/lib/bulk/bulk-row-checklist-blueprint-phase";

const draft = {
  checklistResult: {},
  checklist: {},
  linkTargetsPlan: null,
  flowPurposeStr: "",
  outlineTextForImage: "",
  entityForImage: "",
  useGoogleMaps: false,
  useAiImagePath: false,
  preBlogSeoSkeleton: null,
  blueprintResult: { title: "T", agents: [] },
  precomputedImageChecklist: null,
  precomputedMetaDescription: "",
  flowTitleForBlueprint: "T",
  flowPurposeResolved: "",
  bulkPrimaryKwResolved: "blinds",
  bulkResolvedPostTitle: "T",
} as unknown as BulkRowChecklistBlueprintPhaseResult;

describe("bulk row content phase failure (Wave 2)", () => {
  it("propagates the real generation error instead of fabricating content", async () => {
    const promise = runBulkRowContentAndMediaPhase({
      rowIndex: 0,
      row: { keyword: "blinds" } as never,
      enrichedRow: { keyword: "blinds" } as never,
      keywordData: { keyword: "blinds" } as never,
      options: {} as never,
      bulkOptions: {} as never,
      fileManager: new BulkFileManager(),
      timestamp: 1,
      generatedFiles: [],
      postsForInternalLinks: [],
      knowledgeFiles: [],
      activeKnowledgeBaseText: "",
      rowExplicitExternalPairs: [],
      pipelineBlogModel: "m",
      pipelineResearchModel: "m",
      pipelineImageModel: "m",
      serpSite: undefined,
      serpLlmBriefJson: "",
      llmAuditSummaryPrompt: "",
      dfsArticleAuditBlock: "",
      firstPartyAuthorityBlock: "",
      llmAuditAuthorityLinks: [],
      rowExternalUrlsForSanitize: [],
      semrushCitationForAcf: null,
      intelligentMergeForAcf: null,
      draft,
    });

    await expect(promise).rejects.toThrow("model returned truncated section");
  });
});
