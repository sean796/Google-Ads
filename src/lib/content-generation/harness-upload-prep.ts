import type { AgentConfig } from "@/types/agent-config";
import { markdownToHtml } from "@/lib/markdown-to-html";
import { buildBulkHarnessOutlineFromAgents } from "@/lib/bulk/bulk-harness-outline";
import {
  buildHarnessSectionAnchorMap,
} from "@/lib/bulk/harness-section-anchor-ids";
import { splitBlogHarnessBodyAndOverview } from "@/lib/bulk/blog-harness-summary-agent";
import { stitchHarnessSections } from "@/lib/bulk/bulk-harness-outline";
import {
  extractOverviewSectionHtml,
  extractAnswerSectionHtml,
  enforceHarnessAnswerBeforeOverview,
  injectHarnessH2AnchorIdsForStitchedBlog,
  stripLeadingOverviewSection,
  stripLeadingAnswerSection,
} from "@/lib/overview/overview-blog-overview-prepend";
import { completeOverviewScrollLinks } from "@/lib/prompt-builders/overview-link-rules";
import {
  expandOverviewScrollLinkPlaceholders,
  expandOverviewScrollLinkPlaceholdersInMarkdown,
} from "@/lib/prompt-builders/overview-link-rules";
import {
  ensureHarnessListItemBoldLabels,
  ensureOverviewBulletBoldLabels,
} from "@/lib/overview/overview-bullet-bold-labels";
import { runHarnessHtmlQualityControl } from "@/lib/content-generation/harness-html-quality-control";
import { isGeneratedContentHtml } from "@/lib/content-generation/content-format";
import {
  resolveInternalLinkPlaceholdersInHtml,
  resolveInternalLinkPlaceholdersInMarkdown,
} from "@/lib/content-generation/internal-link-placeholders";
import {
  finalizeExternalLinksInHtml,
  type ExternalLinkPair,
} from "@/lib/content-generation/external-link-placeholders";
import { repairHarnessHtmlForUpload } from "@/lib/content-generation/repair-harness-html";
import { labelMapFromAnchorTargets } from "@/lib/content-generation/harness-link-leak-repair";
import { applyLinkTargetsPlanToHtmlDeterministic } from "@/lib/content-generation/ensure-links-per-section";

export type HarnessUploadPrepWordPressPost = {
  id: number;
  slug: string;
  title: string;
  excerpt: string;
  link: string;
  date_gmt: string;
  collection?: string;
  postType?: string;
};

export type PrepareHarnessContentForUploadArgs = {
  markdownContent: string;
  blueprintAgents: AgentConfig[];
  wordPressPosts?: HarnessUploadPrepWordPressPost[];
  postsForInternalLinks?: HarnessUploadPrepWordPressPost[];
  siteId?: string;
  siteUrl?: string;
  currentPageUrl?: string;
  externalUrlPairs?: ExternalLinkPair[];
  apiKey?: string;
  keyword?: string;
  articleTitle?: string;
  model?: string;
  signal?: AbortSignal;
  linkTargetsPlan?: import("@/lib/bulk/bulk-generation-wp-inventory").LinkTargetsPlan;
  /** Blog optimize: one [[LINK]] resolve pass, no overview body re-stitch. */
  onePassOptimize?: boolean;
};

/**
 * Shared harness → HTML pipeline used by Prompt Generator bulk upload and Content Optimizer.
 * Expands Overview scroll links, injects body H2 anchors, resolves placeholders, repairs artifacts.
 */
export async function prepareHarnessContentForUpload(
  args: PrepareHarnessContentForUploadArgs,
): Promise<string> {
  const {
    markdownContent,
    blueprintAgents,
    wordPressPosts,
    postsForInternalLinks,
    siteId,
    siteUrl,
    currentPageUrl,
    externalUrlPairs = [],
    apiKey,
    model,
    signal,
    linkTargetsPlan,
    onePassOptimize = false,
  } = args;
  const linkCatalog = wordPressPosts ?? postsForInternalLinks;

  if (!markdownContent?.trim()) return markdownContent;

  const { bodyAgents } = splitBlogHarnessBodyAndOverview(blueprintAgents);
  const bodyAnchors = buildHarnessSectionAnchorMap(buildBulkHarnessOutlineFromAgents(bodyAgents));
  const scrollLabelById = labelMapFromAnchorTargets(
    bodyAnchors.map((entry) => ({ id: entry.anchorId, label: entry.displayTitle })),
  );
  const linkLeakOpts = scrollLabelById.size ? { labelById: scrollLabelById } : undefined;

  let mdForUpload = markdownContent;
  const canResolveLinks = Boolean(siteUrl && (siteId || linkCatalog?.length));
  const inputIsHtml = isGeneratedContentHtml(markdownContent);
  if (canResolveLinks && siteUrl && !inputIsHtml) {
    mdForUpload = await resolveInternalLinkPlaceholdersInMarkdown(mdForUpload, {
      siteId,
      siteUrl,
      currentPageUrl,
      wordPressPosts: linkCatalog,
      apiKey,
      model,
      signal,
      linkTargetsPlan,
    });
  }

  mdForUpload = expandOverviewScrollLinkPlaceholdersInMarkdown(mdForUpload);

  let htmlContent = inputIsHtml
    ? expandOverviewScrollLinkPlaceholders(mdForUpload)
    : await markdownToHtml(mdForUpload);

  htmlContent = injectHarnessH2AnchorIdsForStitchedBlog(htmlContent, bodyAnchors);

  if ((canResolveLinks && siteUrl && inputIsHtml) || htmlContent.includes("[[LINK:")) {
    htmlContent = await resolveInternalLinkPlaceholdersInHtml(htmlContent, {
      siteId,
      siteUrl: siteUrl ?? "",
      currentPageUrl,
      wordPressPosts: linkCatalog,
      apiKey,
      model,
      signal,
      linkTargetsPlan,
    });
  }

  htmlContent = finalizeExternalLinksInHtml(htmlContent, externalUrlPairs);

  if (linkTargetsPlan && siteUrl && linkCatalog?.length) {
    htmlContent = applyLinkTargetsPlanToHtmlDeterministic({
      htmlContent,
      linkTargetsPlan,
      wordPressPosts: linkCatalog,
      currentPageUrl,
      siteUrl,
    });
  }

  htmlContent = repairHarnessHtmlForUpload(htmlContent, linkLeakOpts);

  if (bodyAnchors.length > 0) {
    const overviewSection = extractOverviewSectionHtml(htmlContent);
    if (overviewSection) {
      let fixedOverview = completeOverviewScrollLinks(overviewSection, bodyAnchors);
      fixedOverview = ensureOverviewBulletBoldLabels(fixedOverview);
      fixedOverview = repairHarnessHtmlForUpload(fixedOverview, linkLeakOpts);
      const answerSection = extractAnswerSectionHtml(htmlContent);
      const bodyOnly = stripLeadingOverviewSection(stripLeadingAnswerSection(htmlContent));
      const pieces: string[] = [];
      if (answerSection?.trim()) pieces.push(answerSection);
      pieces.push(fixedOverview);
      if (bodyOnly?.trim()) pieces.push(bodyOnly);
      htmlContent = stitchHarnessSections(pieces);
      htmlContent = injectHarnessH2AnchorIdsForStitchedBlog(htmlContent, bodyAnchors);
    }
  }

  htmlContent = enforceHarnessAnswerBeforeOverview(htmlContent);
  if (bodyAnchors.length > 0) {
    htmlContent = injectHarnessH2AnchorIdsForStitchedBlog(htmlContent, bodyAnchors);
  }

  htmlContent = repairHarnessHtmlForUpload(htmlContent, linkLeakOpts);
  if (isGeneratedContentHtml(htmlContent)) {
    htmlContent = ensureHarnessListItemBoldLabels(htmlContent);
    htmlContent = await runHarnessHtmlQualityControl({
      html: htmlContent,
      apiKey,
      model,
      signal,
    });
  }
  return repairHarnessHtmlForUpload(htmlContent, linkLeakOpts);
}
