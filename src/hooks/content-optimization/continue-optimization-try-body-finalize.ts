import type { OptimizationFileManager } from "@/lib/optimization-file-manager";
import type { PendingOptimization } from "./use-optimization-state";
import {
  markContentPrepHarnessSection,
  syncContentOptimizeHarnessBodySections,
} from "@/lib/overview/overview-content-prep-harness-run";
import type { ContentPrepHarnessSetters } from "@/lib/overview/overview-content-prep-harness-run";
import {
  buildContentOptimizePipelineTitles,
  contentOptimizeHarnessSectionIndex,
} from "@/lib/overview/overview-content-optimize-pipeline";
import type { LinkTargetsPlan } from "@/lib/bulk/bulk-generation-wp-inventory";
import {
  runContentLinkTargetsHarness,
} from "@/lib/overview/overview-content-link-targets-harness-run";
import type { generateAndUploadFlow, generateBlueprintFlow } from "./blueprint-content-flow";

type BlueprintResult = Awaited<ReturnType<typeof generateBlueprintFlow>>["blueprintResult"];
type WordPressPostRow = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  link: string;
  date_gmt: string;
  postType?: "post" | "page" | "service-area";
};

export function markContinueOptimizationBlueprintHarness(args: {
  blueprintResult: BlueprintResult;
  url: string;
  contentPrepHarnessSetters: ContentPrepHarnessSetters | null;
  flushGeneratedFiles: () => void;
}): void {
  const { blueprintResult, url, contentPrepHarnessSetters, flushGeneratedFiles } = args;
  if (contentPrepHarnessSetters) {
    const bodyTitles = (blueprintResult.agents ?? [])
      .map((agent: { title?: string }) => agent.title?.trim())
      .filter(Boolean) as string[];
    const pipelineTitles = buildContentOptimizePipelineTitles(bodyTitles);
    if (bodyTitles.length) {
      syncContentOptimizeHarnessBodySections(url, bodyTitles, contentPrepHarnessSetters);
    }
    markContentPrepHarnessSection(
      url,
      contentOptimizeHarnessSectionIndex("Checklist"),
      "done",
      contentPrepHarnessSetters,
      0,
      undefined,
      pipelineTitles,
    );
    markContentPrepHarnessSection(
      url,
      contentOptimizeHarnessSectionIndex("Blueprint"),
      "done",
      contentPrepHarnessSetters,
      0,
      undefined,
      pipelineTitles,
    );
    flushGeneratedFiles();
  }
}

export async function resolveContinueOptimizationLinkTargets(args: {
  blueprintResult: BlueprintResult;
  pendingLinkTargetsPlan: LinkTargetsPlan | undefined;
  wordPressPosts: WordPressPostRow[];
  url: string;
  contentPrepHarnessSetters: ContentPrepHarnessSetters | null;
  flushGeneratedFiles: () => void;
  openRouterApiKey: string;
  siteId: string;
  primaryKeyword: string;
  fileManager: OptimizationFileManager;
}): Promise<{
  linkTargetsPlan: LinkTargetsPlan | undefined;
  bodyTitlesForLinkPlan: string[];
  pipelineTitlesAfterBlueprint: ReturnType<typeof buildContentOptimizePipelineTitles>;
}> {
  const {
    blueprintResult,
    pendingLinkTargetsPlan,
    wordPressPosts,
    url,
    contentPrepHarnessSetters,
    flushGeneratedFiles,
    openRouterApiKey,
    siteId,
    primaryKeyword,
    fileManager,
  } = args;
  let linkTargetsPlan: LinkTargetsPlan | undefined = pendingLinkTargetsPlan;
  const bodyTitlesForLinkPlan = (blueprintResult.agents ?? [])
    .map((agent: { title?: string }) => agent.title?.trim())
    .filter(Boolean) as string[];
  const pipelineTitlesAfterBlueprint = buildContentOptimizePipelineTitles(bodyTitlesForLinkPlan);
  if (contentPrepHarnessSetters) {
    markContentPrepHarnessSection(
      url,
      contentOptimizeHarnessSectionIndex("Link targets"),
      "start",
      contentPrepHarnessSetters,
      0,
      undefined,
      pipelineTitlesAfterBlueprint,
    );
  }

  if (!linkTargetsPlan && wordPressPosts.length > 0) {
    const fileSlug =
      url
        .split("/")
        .filter(Boolean)
        .pop()
        ?.toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 60) || "article";
    linkTargetsPlan = await runContentLinkTargetsHarness({
      apiKey: openRouterApiKey,
      siteId,
      primaryKeyword,
      bodySectionTitles: bodyTitlesForLinkPlan,
      linkPool: wordPressPosts.map((row) => ({
        ...row,
        postType: row.postType === "page" ? ("page" as const) : ("post" as const),
      })),
      fileManager,
      fileSlug,
    });
    flushGeneratedFiles();
  }

  if (contentPrepHarnessSetters && linkTargetsPlan) {
    markContentPrepHarnessSection(
      url,
      contentOptimizeHarnessSectionIndex("Link targets"),
      "done",
      contentPrepHarnessSetters,
      0,
      undefined,
      pipelineTitlesAfterBlueprint,
    );
    flushGeneratedFiles();
  }

  if (contentPrepHarnessSetters && bodyTitlesForLinkPlan.length) {
    syncContentOptimizeHarnessBodySections(url, bodyTitlesForLinkPlan, contentPrepHarnessSetters);
    flushGeneratedFiles();
  }

  return {
    linkTargetsPlan,
    bodyTitlesForLinkPlan,
    pipelineTitlesAfterBlueprint,
  };
}

export async function completeContinueOptimizationAfterUpload(args: {
  contentPrepHarnessSetters: ContentPrepHarnessSetters | null;
  url: string;
  contentHtmlIndex: number;
  contentMdIndex: number;
  implReportIndex: number;
  wpUploadIndex: number;
  pipelineTitlesForContent: ReturnType<typeof buildContentOptimizePipelineTitles>;
  flushGeneratedFiles: () => void;
  changes: Awaited<ReturnType<typeof generateAndUploadFlow>>["changes"];
  setPendingOptimization: (prev: unknown) => unknown;
  siteId: string;
  setOptimizationFileManagers: (prev: unknown) => unknown;
  optimizationFileManagers: Record<string, OptimizationFileManager>;
  fileManager: OptimizationFileManager;
  optimizationStartTime: number;
}): Promise<{ fileCount: number; timeString: string }> {
  const {
    contentPrepHarnessSetters,
    url,
    contentHtmlIndex,
    contentMdIndex,
    implReportIndex,
    wpUploadIndex,
    pipelineTitlesForContent,
    flushGeneratedFiles,
    changes,
    setPendingOptimization,
    siteId,
    setOptimizationFileManagers,
    optimizationFileManagers,
    fileManager,
    optimizationStartTime,
  } = args;
  if (contentPrepHarnessSetters) {
    if (contentHtmlIndex >= 0) {
      markContentPrepHarnessSection(
        url,
        contentHtmlIndex,
        "done",
        contentPrepHarnessSetters,
        0,
        undefined,
        pipelineTitlesForContent,
      );
    }
    if (contentMdIndex >= 0) {
      markContentPrepHarnessSection(
        url,
        contentMdIndex,
        "done",
        contentPrepHarnessSetters,
        0,
        undefined,
        pipelineTitlesForContent,
      );
    }
    if (implReportIndex >= 0) {
      markContentPrepHarnessSection(
        url,
        implReportIndex,
        "done",
        contentPrepHarnessSetters,
        0,
        undefined,
        pipelineTitlesForContent,
      );
    }
    if (wpUploadIndex >= 0) {
      markContentPrepHarnessSection(
        url,
        wpUploadIndex,
        "done",
        contentPrepHarnessSetters,
        0,
        undefined,
        pipelineTitlesForContent,
      );
    }
    flushGeneratedFiles();
  }

  if (changes) {
    setPendingOptimization((prev: Record<string, PendingOptimization>) => {
      const pend = prev[siteId];
      if (!pend) return prev;
      return {
        ...prev,
        [siteId]: { ...pend, optimizationChanges: changes, url },
      };
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  setPendingOptimization((prev: Record<string, PendingOptimization>) => {
    const updated = { ...prev };
    delete updated[siteId];
    return updated;
  });

  setOptimizationFileManagers((prev: Record<string, OptimizationFileManager>) => ({ ...prev }));

  const finalFileManager = optimizationFileManagers[siteId] || fileManager;
  const fileCount = finalFileManager.getFileCount();
  const totalOptimizationTime = Math.floor((Date.now() - optimizationStartTime) / 1000);
  const minutes = Math.floor(totalOptimizationTime / 60);
  const seconds = totalOptimizationTime % 60;
  const timeString = minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;

  return { fileCount, timeString };
}
