import type { WordPressSite } from "@/components/integrations/types";
import { headingTitleToHarnessAnchorId } from "@/lib/bulk/harness-section-anchor-ids";
import {
  normalizeSectionProseHtml,
} from "@/lib/elementor-page-content/extract-text-editor-prose";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import { getBlogModel } from "@/lib/optimization-settings-storage";
import { stripTrailingFaqSection } from "@/lib/overview/overview-blog-faq-append";
import {
  extractAnswerSectionHtml,
  extractOverviewSectionHtml,
  generateAndPrependAnswerHtml,
  generateAndPrependOverviewHtml,
  stripLeadingAnswerSection,
  stripLeadingOverviewSection,
} from "@/lib/overview/overview-blog-overview-prepend";
import {
  buildH2OpenTagForTitle,
  rewriteBlogLeadSectionBlock,
  rewriteBlogPassageSection,
  splitHtmlBodyIntoH2PassageSections,
  stitchHtmlBodyFromH2PassageSections,
  stitchOverviewBlogPostHtml,
} from "@/lib/overview/overview-blog-passage-sections";
import {
  extractAllSectionLinkRowsFromHtml,
} from "@/lib/overview/overview-blog-links-extract";
import {
  rankFuzzyMoneyPageLinksForAnswer,
  rankFuzzySitemapLinksForSection,
  resolveSitemapFuzzyLinkPool,
} from "@/lib/overview/overview-blog-sitemap-fuzzy-links";
import { recordOverviewStudioRevision } from "@/lib/overview/record-overview-studio-revision";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { normalizePageUrlKey } from "@/lib/sitemap-optimizer/normalize-page-url";

export function countAutoSeoBlogBodySteps(sourceHtml: string): number {
  const ansBefore = extractAnswerSectionHtml(sourceHtml);
  const ovBefore = extractOverviewSectionHtml(sourceHtml);
  const withoutLead = stripLeadingOverviewSection(stripLeadingAnswerSection(sourceHtml));
  const coreOnly = stripTrailingFaqSection(withoutLead);
  const parsedBlog = splitHtmlBodyIntoH2PassageSections(coreOnly);
  const hasIntro = Boolean(parsedBlog.leadingHtml.trim());
  const sectionCount = parsedBlog.sections.length;
  const hasAnswer = sectionCount > 0 || Boolean(ansBefore.trim());
  const hasOverview = sectionCount > 0 || Boolean(ovBefore.trim());
  return (hasAnswer ? 1 : 0) + (hasOverview ? 1 : 0) + (hasIntro ? 1 : 0) + sectionCount;
}

export interface RunAutoSeoBlogBodyRewriteArgs {
  sourceHtml: string;
  articleTitle: string;
  focusKeyword: string;
  seoResearchBrief?: string;
  site?: WordPressSite | null;
  pageUrl: string;
  sitemapSource?: OverviewSitemapSource;
  revisionRunId?: string;
  shouldContinue?: () => boolean;
  onStepProgress?: (stepIndex: number, totalBodySteps: number, stepLabel: string) => void;
  onCommitHtml: (html: string, h2Titles: string[]) => void;
}

export async function runAutoSeoBlogBodyRewrite(
  args: RunAutoSeoBlogBodyRewriteArgs,
): Promise<{ html: string; h2Titles: string[]; trailingFaq: string }> {
  const {
    sourceHtml,
    articleTitle,
    focusKeyword,
    seoResearchBrief,
    site,
    pageUrl,
    sitemapSource,
    revisionRunId,
    shouldContinue = () => true,
    onStepProgress,
    onCommitHtml,
  } = args;

  const ansBefore = extractAnswerSectionHtml(sourceHtml);
  const ovBefore = extractOverviewSectionHtml(sourceHtml);
  const withoutLead = stripLeadingOverviewSection(stripLeadingAnswerSection(sourceHtml));
  const coreOnly = stripTrailingFaqSection(withoutLead);
  const trailingFaq =
    withoutLead.length > coreOnly.length
      ? withoutLead.slice(coreOnly.length).trim()
      : "";
  const parsedBlog = splitHtmlBodyIntoH2PassageSections(coreOnly);

  let ansHtml = ansBefore;
  let ovHtml = ovBefore;
  let leadingHtml = parsedBlog.leadingHtml;
  let workingSections = [...parsedBlog.sections];

  const totalBodySteps = countAutoSeoBlogBodySteps(sourceHtml);
  let stepCursor = 0;

  const sitemapLinkPool = await resolveSitemapFuzzyLinkPool({
    site,
    siteId: site?.id ?? null,
    pageUrl,
  });
  const usedLinkUrlKeys = new Set<string>();
  const recordUsedLinksFromHtml = (fragmentHtml: string) => {
    for (const row of extractAllSectionLinkRowsFromHtml(fragmentHtml)) {
      if (!row.href || row.href.startsWith("#")) continue;
      const k = normalizePageUrlKey(row.href);
      if (k) usedLinkUrlKeys.add(k);
    }
  };

  const passageRewriteCtx = {
    articleTitle,
    focusKeyword,
    seoResearchBrief,
    siteId: site?.id ?? null,
    siteUrl: site?.siteUrl,
    pageUrl,
    businessName: site?.name,
  };

  const commitCurrent = () => {
    const html = stitchOverviewBlogPostHtml({
      ansHtml,
      ovHtml,
      leadingHtml,
      sections: workingSections,
      trailingFaq,
    });
    const h2Titles = workingSections.map((s) => s.title).filter(Boolean);
    onCommitHtml(html, h2Titles);
    return { html, h2Titles };
  };

  const hasAnswer = workingSections.length > 0 || Boolean(ansBefore.trim());
  const hasOverview = workingSections.length > 0 || Boolean(ovBefore.trim());

  // 1. Answer (top of blog first)
  if (hasAnswer && shouldContinue()) {
    stepCursor += 1;
    onStepProgress?.(stepCursor, totalBodySteps, "Answer");
  console.log(`[Auto SEO] Step ${stepCursor}/${totalBodySteps}: Answer -> ${pageUrl}`);
    const answerMoneyPages = rankFuzzyMoneyPageLinksForAnswer({
      pool: sitemapLinkPool,
      articleTitle,
      focusKeyword,
      bodyH2Titles: workingSections.map((s) => s.title),
      pageUrl,
      limit: 6,
    });
    try {
      if (workingSections.length > 0) {
        const apiKey = await resolveOpenRouterApiKeyForHarness();
        const model = getBlogModel(site?.id);
        const coreHtml = stitchHtmlBodyFromH2PassageSections({
          leadingHtml,
          sections: workingSections,
        });
        const ansRes = await generateAndPrependAnswerHtml({
          sourceHtml: coreHtml,
          articleTitle,
          focusKeyword,
          pageUrl,
          connectedSite: site ? { name: site.name, siteUrl: site.siteUrl } : undefined,
          site: site ?? undefined,
          pageKind: sitemapSource === "sap" ? "entity" : "post",
          seoResearchBrief,
          previousAnswerHtml: ansBefore,
          moneyPageCandidates: answerMoneyPages,
          apiKey,
          model,
        });
        ansHtml = ansRes.answerHtml;
      } else {
        ansHtml = await rewriteBlogLeadSectionBlock(ansBefore, {
          ...passageRewriteCtx,
          siblingTitles: [],
          sitemapLinkCandidates: answerMoneyPages,
        });
      }
      recordUsedLinksFromHtml(ansHtml);
      if (shouldContinue()) {
        recordOverviewStudioRevision({
          pageUrl,
          stepLabel: "Answer",
          runId: revisionRunId,
          beforeHtml: ansBefore,
          afterHtml: ansHtml,
        });
        commitCurrent();
      }
    } catch (err) {
      console.warn("[Auto SEO] Answer section warning for", pageUrl, err);
    }
  }

  // 2. Overview (second block from top of blog)
  if (hasOverview && shouldContinue()) {
    stepCursor += 1;
    onStepProgress?.(stepCursor, totalBodySteps, "Overview");
  console.log(`[Auto SEO] Step ${stepCursor}/${totalBodySteps}: Overview -> ${pageUrl}`);
    try {
      if (workingSections.length > 0) {
        const apiKey = await resolveOpenRouterApiKeyForHarness();
        const model = getBlogModel(site?.id);
        const coreHtml = stitchHtmlBodyFromH2PassageSections({
          leadingHtml,
          sections: workingSections,
        });
        const ovRes = await generateAndPrependOverviewHtml({
          sourceHtml: coreHtml,
          articleTitle,
          focusKeyword,
          pageUrl,
          connectedSite: site ? { name: site.name, siteUrl: site.siteUrl } : undefined,
          site: site ?? undefined,
          pageKind: sitemapSource === "sap" ? "entity" : "post",
          seoResearchBrief,
          pregeneratedAnswerHtml: ansHtml,
          apiKey,
          model,
        });
        if (ovRes) {
          ovHtml = extractOverviewSectionHtml(ovRes.html);
          const coreWithIds = stripLeadingOverviewSection(
            stripLeadingAnswerSection(ovRes.html),
          );
          const reparsed = splitHtmlBodyIntoH2PassageSections(coreWithIds);
          leadingHtml = reparsed.leadingHtml;
          workingSections = reparsed.sections;
        }
      } else {
        ovHtml = await rewriteBlogLeadSectionBlock(ovBefore, {
          ...passageRewriteCtx,
          siblingTitles: [],
        });
      }
      if (shouldContinue()) {
        recordOverviewStudioRevision({
          pageUrl,
          stepLabel: "Overview",
          runId: revisionRunId,
          beforeHtml: ovBefore,
          afterHtml: ovHtml,
        });
        commitCurrent();
      }
    } catch (err) {
      console.warn("[Auto SEO] Overview section warning for", pageUrl, err);
    }
  }

  // 3. Introduction lead (if present before first H2)
  if (leadingHtml.trim() && shouldContinue()) {
    stepCursor += 1;
    onStepProgress?.(stepCursor, totalBodySteps, "Introduction");
    const introBefore = leadingHtml;
    try {
      leadingHtml = await rewriteBlogLeadSectionBlock(leadingHtml, {
        ...passageRewriteCtx,
        siblingTitles: workingSections.map((s) => s.title),
      });
      if (!shouldContinue()) {
        return { ...commitCurrent(), trailingFaq };
      }
      recordOverviewStudioRevision({
        pageUrl,
        stepLabel: "Introduction",
        runId: revisionRunId,
        beforeHtml: introBefore,
        afterHtml: leadingHtml,
      });
      commitCurrent();
    } catch (err) {
      console.warn("[Auto SEO] Intro lead warning for", pageUrl, err);
    }
  }

  // 4. Every H2 section in document order (top to bottom)
  for (let sIdx = 0; sIdx < workingSections.length; sIdx += 1) {
    if (!shouldContinue()) {
      return { ...commitCurrent(), trailingFaq };
    }
    const sec = workingSections[sIdx]!;
    stepCursor += 1;
    onStepProgress?.(
      stepCursor,
      totalBodySteps,
      sec.title?.trim() || `Section ${sIdx + 1}`,
    );
    console.log(
      `[Auto SEO] Step ${stepCursor}/${totalBodySteps}: H2 Section ${sIdx + 1}/${workingSections.length} "${sec.title}" -> ${pageUrl}`,
    );
    if (!sec.bodyHtml.trim()) continue;

    const oldAnchorId = sec.id || headingTitleToHarnessAnchorId(sec.title);
    const beforeSectionHtml = `${sec.h2OpenTag.trim() || "<h2>"}${sec.title.trim()}</h2>\n${sec.bodyHtml.trim()}`;
    const sectionLinkCandidates = rankFuzzySitemapLinksForSection({
      pool: sitemapLinkPool,
      sectionTitle: sec.title,
      sectionBodyHtml: sec.bodyHtml,
      articleTitle,
      focusKeyword,
      pageUrl,
      usedUrls: usedLinkUrlKeys,
      limit: 8,
    });
    try {
      const rewritten = await rewriteBlogPassageSection({
        mode: "both",
        section: sec,
        siblingTitles: workingSections
          .filter((_, i) => i !== sIdx)
          .map((s) => s.title),
        ...passageRewriteCtx,
        sitemapLinkCandidates: sectionLinkCandidates,
      });
      if (!shouldContinue()) {
        return { ...commitCurrent(), trailingFaq };
      }
      const nextTitle = (rewritten.title || sec.title).trim();
      const nextBody = normalizeSectionProseHtml(rewritten.bodyHtml);
      recordUsedLinksFromHtml(nextBody);
      const nextH2OpenTag = buildH2OpenTagForTitle(nextTitle);
      const nextId = headingTitleToHarnessAnchorId(nextTitle);
      const afterSectionHtml = `${nextH2OpenTag}${nextTitle}</h2>\n${nextBody}`;

      if (ovHtml && oldAnchorId && nextId && oldAnchorId !== nextId) {
        ovHtml = ovHtml
          .split(`href="#${oldAnchorId}"`)
          .join(`href="#${nextId}"`)
          .split(`href='#${oldAnchorId}'`)
          .join(`href='#${nextId}'`);
      }

      recordOverviewStudioRevision({
        pageUrl,
        stepLabel: nextTitle || `Section ${sIdx + 1}`,
        sectionTitle: nextTitle || undefined,
        runId: revisionRunId,
        beforeHtml: beforeSectionHtml,
        afterHtml: afterSectionHtml,
      });
      workingSections[sIdx] = {
        ...sec,
        id: nextId,
        h2OpenTag: nextH2OpenTag,
        title: nextTitle,
        bodyHtml: nextBody,
      };
      commitCurrent();
    } catch (err) {
      console.warn(
        `[Auto SEO] Blog section ${sIdx + 1} (${sec.title}) warning for ${pageUrl}:`,
        err,
      );
    }
  }

  return { ...commitCurrent(), trailingFaq };
}
