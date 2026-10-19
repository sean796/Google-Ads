import { loadApiKey } from "@/lib/api";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import {
  applyElementorSectionCopy,
  sectionOutlineFromJson,
} from "@/lib/elementor-page-content/apply-elementor-section-copy";
import {
  assertSameTopLevelCount,
  parseElementorDataJson,
} from "@/lib/elementor-page-content/parse-elementor-section-outline";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { richestSectionBodyForOptimize } from "@/lib/elementor-page-content/elementor-section-headers-from-cache";

export type RunElementorPageOptimizeArgs = {
  site: WordPressSite;
  elementorJson: string;
  designBreakdown?: string;
  seoResearchBrief: string;
  focusKeyword: string;
  pageTitle?: string;
  pageUrl?: string;
  row?: OverviewRow;
  apiKey?: string;
  model?: string;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
};

export type RunElementorPageOptimizeResult = {
  summary: string;
  modifiedElementorData: unknown[];
  designBreakdown: string;
};

function sectionsWithBody(elementorJson: string) {
  return sectionOutlineFromJson(elementorJson).filter(
    (section) => section.bodyText?.trim() || section.bodyHtml?.trim(),
  );
}

/** Full-page Elementor optimize: full rewrite of section body copy. Headings unchanged unless header harness runs. */
export async function runElementorPageOptimizeFromResearch(
  args: RunElementorPageOptimizeArgs,
): Promise<RunElementorPageOptimizeResult> {
  const before = parseElementorDataJson(args.elementorJson);
  const breakdown = args.designBreakdown?.trim() ?? "";

  const apiKey = args.apiKey?.trim() || loadApiKey()?.trim() || "";
  const model = args.model?.trim() || getResearchModel(args.site.id);
  const businessName = args.site.name ?? args.site.siteUrl;
  const pageTitle = args.pageTitle?.trim() || args.focusKeyword?.trim() || businessName;

  const targets = sectionsWithBody(args.elementorJson);
  let workingJson = args.elementorJson;
  let optimizedCount = 0;

  for (let i = 0; i < targets.length; i++) {
    args.onProgress?.(`Rewriting section ${i + 1} of ${targets.length}…`);
    const section =
      sectionOutlineFromJson(workingJson).find((entry) => entry.id === targets[i]!.id) ??
      targets[i]!;
    const sectionForCopy = args.row
      ? richestSectionBodyForOptimize(args.row, section)
      : section;

    if (!apiKey) continue;

    try {
      const modified = await applyElementorSectionCopy({
        elementorJson: workingJson,
        sectionId: section.id,
        kind: "section-content",
        section: sectionForCopy,
        focusKeyword: args.focusKeyword,
        pageTitle,
        businessName,
        seoResearch: args.seoResearchBrief,
        siteBaseUrl: args.site.siteUrl,
        pageUrl: args.pageUrl,
        apiKey,
        model,
      });
      workingJson = JSON.stringify(modified);
      optimizedCount += 1;
    } catch {
      continue;
    }
  }

  const modifiedElementorData =
    optimizedCount > 0 ? parseElementorDataJson(workingJson) : before;
  if (optimizedCount > 0) {
    assertSameTopLevelCount(before, modifiedElementorData);
  }

  return {
    summary:
      optimizedCount > 0
        ? `Optimized body copy in ${optimizedCount} section(s). Headings unchanged.`
        : "Page optimize finished.",
    modifiedElementorData,
    designBreakdown: breakdown,
  };
}
