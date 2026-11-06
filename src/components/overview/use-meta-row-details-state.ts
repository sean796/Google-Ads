import React from "react";


import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { fullDestinationUrl, suggestedPathFromFocusKeywordForMetaOptimizer } from "@/lib/rank-math-redirect-csv";
import { parseFaqEntries } from "@/lib/faq-entries";
import { extractH2TextsFromHtml } from "@/lib/overview/overview-blog-headers-extract";
import { normalizeSectionProseHtml, prosePlainText } from "@/lib/elementor-page-content/extract-text-editor-prose";
import { elementorSectionHeadersFromCachedRow } from "@/lib/elementor-page-content/elementor-section-headers-from-cache";
import { patchElementorSectionInJson, sectionOutlineFromJson } from "@/lib/elementor-page-content/apply-elementor-section-copy";
import { buildElementorPageHtml } from "@/lib/elementor-page-content/elementor-page-html";
import { extractInternalLinksFromHtml } from "@/lib/overview/overview-blog-links-extract";
import { isWikipediaHref, extractWikipediaLinksWithContext } from "@/lib/overview/overview-blog-wikipedia-link-insert";
import { extractOverviewSectionHtml, extractAnswerSectionHtml } from "@/lib/overview/overview-blog-overview-prepend";
import { extractIllustrativeSectionHtml } from "@/lib/overview/overview-blog-scenario-section";
import { overviewTitlePrimarySegment } from "@/lib/overview/overview-tab-display";
import { overviewTitleOptimizationExcluded } from "@/lib/overview/overview-page-bucket";
import { buildOverviewRedirectRow } from "@/lib/overview/overview-redirect-row";

import type { MetaOptimizerPageRowDetailsProps } from "@/components/overview/MetaOptimizerPageRowDetails";

export function useMetaRowDetailsState(p: MetaOptimizerPageRowDetailsProps) {
  const {
    row,
    rowIndex: index,
    site,
    sitemapSource,
    opt,
    bindings,
    bulkAiFaqSeedCount,
    metaOptimizerPipelineBusy,
    expandedResearchBriefUrl,
    setExpandedResearchBriefUrl,
    expandedContentUrl,
    setExpandedContentUrl,
    updateRow,
    handleAiUrlRow,
    handleScrapeRow,
    handleUpdateWordPressForRow,
    handleDataForSeoResearch,
    handleOptimizeAllSerpRow,
    handleAiAllMetaRow,
    handleAiTitleRow,
    handleAiMetaRow,
    handleAiKeywordRow,
    handleSetDateToday,
    commitRowDateModifier,
    handleAiFaqRowAll,
    handleAiFaqQuestion,
    handleAiFaqAnswer,
    handleAiHeadersRow,
    handleAiLinksRow,
    handleAiWikipediaLinkRow,
    handleAiAnswerRow,
    handleAiOverviewRow,
    handleAiScenarioRow,
    handleAiInContentImageRow,
    placeholder = false,
    accordionBody = false,
    isSelected = false,
    onToggleSelect,
    onCollapse,
  } = p;
const shellOnly = placeholder;
const isElementorRow =
  sitemapSource === "pages" ||
  row.contentFormat === "elementor" ||
  Boolean(row.elementorDataJson?.trim());
const elementorFullPageReady = Boolean(row.seoResearch?.trim());
const elementorRunError =
  row.status === "error" ? opt.optimizationProgress[site.id]?.message?.trim() : "";
const faqEntries = parseFaqEntries(row.faq);
const faqPairCount = faqEntries.length;
const bodyHtmlForUi =
  isElementorRow && row.elementorDataJson?.trim()
    ? buildElementorPageHtml(row.elementorDataJson)
    : row.postContentOptimized?.trim() || row.postContent?.trim() || "";
const elementorHeaders = React.useMemo(
  () => elementorSectionHeadersFromCachedRow(row),
  [row],
);
const headerList = isElementorRow
  ? elementorHeaders.length
    ? elementorHeaders.map((s) => s.title)
    : row.blogH2List?.length
      ? row.blogH2List
      : []
  : bodyHtmlForUi
    ? extractH2TextsFromHtml(bodyHtmlForUi)
    : row.blogH2List?.length
      ? row.blogH2List
      : [];
const overviewReady = isElementorRow
  ? row.elementorHarnessSlots?.overview === true
  : Boolean(extractOverviewSectionHtml(bodyHtmlForUi));
const answerReady = isElementorRow
  ? row.elementorHarnessSlots?.answer === true
  : Boolean(extractAnswerSectionHtml(bodyHtmlForUi));
const scenarioReady = isElementorRow
  ? row.elementorHarnessSlots?.scenario === true
  : Boolean(extractIllustrativeSectionHtml(bodyHtmlForUi));
const overviewSectionHtml = extractOverviewSectionHtml(bodyHtmlForUi);
const answerSectionHtml = extractAnswerSectionHtml(bodyHtmlForUi);
const scenarioSectionHtml = extractIllustrativeSectionHtml(bodyHtmlForUi);

const commitElementorSectionField = React.useCallback(
  (sectionId: string, patch: { title?: string; bodyText?: string; bodyHtml?: string }) => {
    if (shellOnly || !sectionId) return;
    const bodyPatch =
      patch.bodyHtml != null
        ? { ...patch, bodyHtml: normalizeSectionProseHtml(patch.bodyHtml) }
        : patch;
    const raw = row.elementorDataJson?.trim();
    if (raw) {
      const nextJson = patchElementorSectionInJson(raw, sectionId, bodyPatch);
      const headers = sectionOutlineFromJson(nextJson).map((section) => ({
        ...section,
        bodyHtml: normalizeSectionProseHtml(section.bodyHtml ?? ""),
        bodyText: prosePlainText(normalizeSectionProseHtml(section.bodyHtml ?? "")),
      }));
      updateRow(index, {
        contentFormat: "elementor",
        elementorDataJson: nextJson,
        elementorSectionHeaders: headers,
        blogH2List: headers.map((section) => section.title),
      });
      return;
    }
    const headers = elementorSectionHeadersFromCachedRow(row);
    const nextHeaders = headers.map((section) => {
      if (section.id !== sectionId) return section;
      const bodyHtml =
        bodyPatch.bodyHtml != null
          ? bodyPatch.bodyHtml
          : bodyPatch.bodyText != null
            ? bodyPatch.bodyText
            : section.bodyHtml;
      const bodyText =
        bodyPatch.bodyText ??
        (bodyPatch.bodyHtml != null
          ? bodyPatch.bodyHtml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
          : section.bodyText);
      return {
        ...section,
        ...(bodyPatch.title != null ? { title: bodyPatch.title } : {}),
        ...(bodyHtml != null ? { bodyHtml, bodyText } : {}),
      };
    });
    updateRow(index, {
      elementorSectionHeaders: nextHeaders,
      blogH2List: nextHeaders.map((section) => section.title),
    });
  },
  [row, shellOnly, index, updateRow],
);
const [headersOpen, setHeadersOpen] = React.useState(false);
const [headersPlanOpen, setHeadersPlanOpen] = React.useState(false);
const [linksOpen, setLinksOpen] = React.useState(false);
const [linksPlanOpen, setLinksPlanOpen] = React.useState(false);
const [wikiLinksOpen, setWikiLinksOpen] = React.useState(false);
const [answerOpen, setAnswerOpen] = React.useState(false);
const [overviewOpen, setOverviewOpen] = React.useState(false);
const [scenarioOpen, setScenarioOpen] = React.useState(false);
const [inContentImageOpen, setInContentImageOpen] = React.useState(false);
const inContentImageReady = Boolean(row.blogInContentImageUrl?.trim());
const elementorLinkCount = React.useMemo(() => {
  if (!isElementorRow || !site?.siteUrl) return 0;
  return elementorHeaders.reduce((total, section) => {
    const html = section.bodyHtml?.trim() || section.bodyText?.trim() || "";
    if (!html) return total;
    return (
      total +
      extractInternalLinksFromHtml(html, site.siteUrl, row.url).filter((l) => !isWikipediaHref(l.href))
        .length
    );
  }, 0);
}, [isElementorRow, elementorHeaders, site?.siteUrl, row.url]);
const rawLinkList =
  row.blogLinkList?.length
    ? row.blogLinkList
    : bodyHtmlForUi && site?.siteUrl
      ? extractInternalLinksFromHtml(bodyHtmlForUi, site.siteUrl, row.url).map((l) => ({
          href: l.href,
          anchor: l.anchor,
        }))
      : [];
const linkList = rawLinkList.filter((l) => !isWikipediaHref(l.href));
const wikiLinkList =
  row.blogWikiLinkList?.length
    ? row.blogWikiLinkList
    : rawLinkList.filter((l) => isWikipediaHref(l.href));
const wikiLinksInBody = bodyHtmlForUi ? extractWikipediaLinksWithContext(bodyHtmlForUi) : [];
const wikiLinkCount = wikiLinksInBody.length > 0 ? wikiLinksInBody.length : wikiLinkList.length;
const briefJsonCharCount = (row.seoResearch ?? "").length;
const [faqEditorOpen, setFaqEditorOpen] = React.useState(false);
const suggestedFullUrl =
  row.aiSuggestedPath?.trim() ? fullDestinationUrl(row.url, row.aiSuggestedPath) : null;
let rowPathname = "/";
try {
  rowPathname = new URL(row.url).pathname || "/";
} catch {
  /* keep default */
}
const keywordUrlOutcome = suggestedPathFromFocusKeywordForMetaOptimizer(rowPathname, row.focusKeyword);
const keywordUrlAlreadyOptimized = keywordUrlOutcome.kind === "clear";
const titleReadOnly = overviewTitleOptimizationExcluded(row, sitemapSource);
const redirectRow = buildOverviewRedirectRow(row);

React.useEffect(() => {
  if (shellOnly || titleReadOnly) return;
  const patch: Partial<OverviewRow> = {};
  const t = overviewTitlePrimarySegment(row.title);
  if (t !== row.title) patch.title = t;
  if (row.aiTitle != null && row.aiTitle !== "") {
    const a = overviewTitlePrimarySegment(row.aiTitle);
    if (a !== row.aiTitle) patch.aiTitle = a;
  }
  if (Object.keys(patch).length) updateRow(index, patch);
}, [row.title, row.aiTitle, index, updateRow, titleReadOnly, shellOnly]);


  return {
    row,
    index,
    site,
    sitemapSource,
    opt,
    bindings,
    bulkAiFaqSeedCount,
    metaOptimizerPipelineBusy,
    expandedResearchBriefUrl,
    setExpandedResearchBriefUrl,
    expandedContentUrl,
    setExpandedContentUrl,
    updateRow,
    handleAiUrlRow,
    handleScrapeRow,
    handleUpdateWordPressForRow,
    handleDataForSeoResearch,
    handleOptimizeAllSerpRow,
    handleAiAllMetaRow,
    handleAiTitleRow,
    handleAiMetaRow,
    handleAiKeywordRow,
    handleSetDateToday,
    commitRowDateModifier,
    handleAiFaqRowAll,
    handleAiFaqQuestion,
    handleAiFaqAnswer,
    handleAiHeadersRow,
    handleAiLinksRow,
    handleAiWikipediaLinkRow,
    handleAiAnswerRow,
    handleAiOverviewRow,
    handleAiScenarioRow,
    handleAiInContentImageRow,
    placeholder,
    accordionBody,
    isSelected,
    onToggleSelect,
    onCollapse,
    shellOnly,
    isElementorRow,
    elementorFullPageReady,
    elementorRunError,
    faqEntries,
    faqPairCount,
    bodyHtmlForUi,
    elementorHeaders,
    headerList,
    overviewReady,
    answerReady,
    scenarioReady,
    overviewSectionHtml,
    answerSectionHtml,
    scenarioSectionHtml,
    commitElementorSectionField,
    headersOpen,
    setHeadersOpen,
    headersPlanOpen,
    setHeadersPlanOpen,
    linksOpen,
    setLinksOpen,
    linksPlanOpen,
    setLinksPlanOpen,
    wikiLinksOpen,
    setWikiLinksOpen,
    answerOpen,
    setAnswerOpen,
    overviewOpen,
    setOverviewOpen,
    scenarioOpen,
    setScenarioOpen,
    inContentImageOpen,
    setInContentImageOpen,
    inContentImageReady,
    elementorLinkCount,
    rawLinkList,
    linkList,
    wikiLinkList,
    wikiLinksInBody,
    wikiLinkCount,
    briefJsonCharCount,
    faqEditorOpen,
    setFaqEditorOpen,
    suggestedFullUrl,
    rowPathname,
    keywordUrlOutcome,
    keywordUrlAlreadyOptimized,
    titleReadOnly,
    redirectRow,
  };
}

export type MetaRowDetailsCtx = ReturnType<typeof useMetaRowDetailsState>;
