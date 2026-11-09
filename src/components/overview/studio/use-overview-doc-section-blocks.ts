import { useMemo, useState } from "react";
import { notifyHeaderError } from "@/lib/app-notifications";
import { stitchHarnessSections } from "@/lib/bulk/bulk-harness-outline";
import {
  patchElementorSectionInJson,
  sectionOutlineFromJson,
} from "@/lib/elementor-page-content/apply-elementor-section-copy";
import { elementorSectionHeadersFromCachedRow } from "@/lib/elementor-page-content/elementor-section-headers-from-cache";
import { normalizeSectionProseHtml, prosePlainText } from "@/lib/elementor-page-content/extract-text-editor-prose";
import { parseFaqEntries, serializeFaqEntriesPlain } from "@/lib/faq-entries";
import { stripTrailingFaqSection } from "@/lib/overview/overview-blog-faq-append";
import { extractAllSectionLinkRowsFromHtml } from "@/lib/overview/overview-blog-links-extract";
import {
  extractAnswerSectionHtml,
  extractOverviewSectionHtml,
  stripLeadingAnswerSection,
  stripLeadingOverviewSection,
} from "@/lib/overview/overview-blog-overview-prepend";
import { headingTitleToHarnessAnchorId } from "@/lib/bulk/harness-section-anchor-ids";
import {
  buildH2OpenTagForTitle,
  rewriteBlogPassageSection,
  splitHtmlBodyIntoH2PassageSections,
  stitchHtmlBodyFromH2PassageSections,
  type PassageRewriteMode,
} from "@/lib/overview/overview-blog-passage-sections";
import {
  recordOverviewStudioRevision,
  recordOverviewStudioTextRevision,
} from "@/lib/overview/record-overview-studio-revision";
import { extractIllustrativeSectionHtml } from "@/lib/overview/overview-blog-scenario-section";
import { isWikipediaHref } from "@/lib/overview/overview-blog-wikipedia-link-insert";
import { extractFaqFromPostHtml } from "@/lib/overview/overview-row-scrape";
import type { OverviewDocSectionBlocksProps } from "./overview-doc-section-block-types";

export function useOverviewDocSectionBlocks({
  row,
  rowIndex,
  sitemapSource,
  siteId,
  siteUrl,
  businessName,
  isElementorRow,
  bodyHtml,
  busy,
  onUpdateRow,
  onAiAnswer,
  onAiOverview,
  onAiHeaders,
  onAiLinks,
  onAiWikipediaLink,
  onAiScenario,
  onAiInContentImage,
  onAiFaqAll,
  onAiFaqQuestion,
  onAiFaqAnswer,
  onAiElementorSection,
  onAiElementorSectionHeader,
  onAiElementorSectionContent,
  onPassageStatusChange,
  activeOptimizingSectionTitle,
}: OverviewDocSectionBlocksProps) {
  const activeStepTitleKey = activeOptimizingSectionTitle?.trim().toLowerCase() ?? "";
  const [linksExpanded, setLinksExpanded] = useState(false);
  const [rewritingPassageKey, setRewritingPassageKey] = useState<string | null>(null);

  const isPagesSource = sitemapSource === "pages" || isElementorRow;
  const isSapSource = sitemapSource === "sap";

  const answerHtml = useMemo(() => extractAnswerSectionHtml(bodyHtml), [bodyHtml]);
  const overviewHtml = useMemo(() => extractOverviewSectionHtml(bodyHtml), [bodyHtml]);
  const scenarioHtml = useMemo(() => extractIllustrativeSectionHtml(bodyHtml), [bodyHtml]);
  const coreArticleBodyHtml = useMemo(
    () =>
      stripTrailingFaqSection(
        stripLeadingOverviewSection(stripLeadingAnswerSection(bodyHtml)),
      ),
    [bodyHtml],
  );
  const trailingFaqBlockHtml = useMemo(() => {
    const withoutLead = stripLeadingOverviewSection(stripLeadingAnswerSection(bodyHtml));
    const withoutFaq = stripTrailingFaqSection(withoutLead);
    if (!withoutLead.trim() || withoutFaq.length >= withoutLead.length) return "";
    return withoutLead.slice(withoutFaq.length).trim();
  }, [bodyHtml]);

  const parsedPassageDoc = useMemo(
    () => splitHtmlBodyIntoH2PassageSections(coreArticleBodyHtml),
    [coreArticleBodyHtml],
  );

  const elementorSections = useMemo(
    () =>
      elementorSectionHeadersFromCachedRow({
        ...row,
        postContent: row.postContent?.trim() || bodyHtml || row.postContent,
      }).filter((sec) => {
        const key = (sec.title ?? "").trim().toLowerCase();
        return (
          key !== "faq" &&
          key !== "frequently asked questions" &&
          key !== "answer" &&
          key !== "direct answer" &&
          key !== "overview" &&
          key !== "ai overview"
        );
      }),
    [row, bodyHtml],
  );
  const extractedLinks = useMemo(
    () => extractAllSectionLinkRowsFromHtml(bodyHtml),
    [bodyHtml],
  );
  const internalLinks = useMemo(
    () => extractedLinks.filter((l) => !isWikipediaHref(l.href)),
    [extractedLinks],
  );
  const wikiLinks = useMemo(
    () => extractedLinks.filter((l) => isWikipediaHref(l.href)),
    [extractedLinks],
  );
  const faqEntries = useMemo(() => {
    const fromRow = parseFaqEntries(row.faq);
    if (fromRow.length > 0) return fromRow;
    const fromHtml = extractFaqFromPostHtml(bodyHtml);
    return fromHtml ? parseFaqEntries(fromHtml) : [];
  }, [row.faq, bodyHtml]);

  const commitCoreArticleBodyHtml = (nextCoreHtml: string, nextH2Titles?: string[]) => {
    const stitched = stitchHarnessSections(
      [answerHtml, overviewHtml, nextCoreHtml, trailingFaqBlockHtml].filter((part) =>
        Boolean(part?.trim()),
      ),
    );
    onUpdateRow(rowIndex, {
      postContentOptimized: stitched,
      postContent: stitched,
      ...(nextH2Titles ? { blogH2List: nextH2Titles } : {}),
    });
  };

  const commitPassageSectionPatch = (
    sectionIdx: number,
    patch: { title?: string; bodyHtml?: string },
  ) => {
    const nextSections = parsedPassageDoc.sections.map((sec, idx) => {
      if (idx !== sectionIdx) return sec;
      const nextTitle = patch.title ?? sec.title;
      return {
        ...sec,
        id: patch.title != null ? headingTitleToHarnessAnchorId(nextTitle) : sec.id,
        h2OpenTag: patch.title != null ? buildH2OpenTagForTitle(nextTitle) : sec.h2OpenTag,
        title: nextTitle,
        bodyHtml:
          patch.bodyHtml != null
            ? normalizeSectionProseHtml(patch.bodyHtml)
            : sec.bodyHtml,
      };
    });
    const nextCore = stitchHtmlBodyFromH2PassageSections({
      leadingHtml: parsedPassageDoc.leadingHtml,
      sections: nextSections,
    });
    commitCoreArticleBodyHtml(
      nextCore,
      nextSections.map((s) => s.title).filter(Boolean),
    );
  };

  const passageProseEditorKey = (sec: { id: string; bodyHtml: string }) => {
    const plain = prosePlainText(sec.bodyHtml);
    return `${sec.id}-${plain.length}-${plain.slice(0, 48)}`;
  };

  const handleRewriteBlogPassage = async (
    sectionIdx: number,
    mode: PassageRewriteMode,
  ) => {
    const target = parsedPassageDoc.sections[sectionIdx];
    if (!target) return;
    const beforeBody = target.bodyHtml;
    const beforeTitle = target.title;
    const key = `${target.id}:${mode}`;
    const total = parsedPassageDoc.sections.length;
    setRewritingPassageKey(key);
    onPassageStatusChange?.({
      label: `Harness ${sectionIdx + 1}/${total}: ${target.title || `Section ${sectionIdx + 1}`}`,
      current: sectionIdx + 1,
      total,
    });
    try {
      const siblingTitles = parsedPassageDoc.sections
        .filter((_, idx) => idx !== sectionIdx)
        .map((s) => s.title);
      const res = await rewriteBlogPassageSection({
        mode,
        section: target,
        siblingTitles,
        articleTitle: row.aiTitle?.trim() || row.title || "",
        focusKeyword: row.focusKeyword?.trim() || "",
        seoResearchBrief: row.seoResearch,
        siteId,
        siteUrl,
        pageUrl: row.url,
        businessName,
      });
      const manualStep =
        mode === "header" ? "Manual: H2" : mode === "copy" ? "Manual: Copy" : "Manual: H2 + copy";
      if (mode === "header") {
        recordOverviewStudioTextRevision({
          pageUrl: row.url,
          stepLabel: manualStep,
          sectionTitle: beforeTitle,
          beforeText: beforeTitle,
          afterText: (res.title ?? beforeTitle).trim(),
        });
      } else {
        const afterHtml = normalizeSectionProseHtml(res.bodyHtml ?? beforeBody);
        recordOverviewStudioRevision({
          pageUrl: row.url,
          stepLabel: manualStep,
          sectionTitle: (res.title ?? beforeTitle).trim() || undefined,
          beforeHtml: beforeBody,
          afterHtml,
        });
      }
      commitPassageSectionPatch(sectionIdx, res);
    } catch (err) {
      notifyHeaderError(
        "Passage rewrite failed",
        err instanceof Error ? err.message : "Could not rewrite section.",
      );
    } finally {
      setRewritingPassageKey(null);
      onPassageStatusChange?.(null);
    }
  };

  const commitElementorSection = (
    sectionId: string,
    patch: { title?: string; bodyHtml?: string },
  ) => {
    if (!sectionId) return;
    const raw = row.elementorDataJson?.trim();
    if (raw) {
      const normalizedPatch =
        patch.bodyHtml != null
          ? { ...patch, bodyHtml: normalizeSectionProseHtml(patch.bodyHtml) }
          : patch;
      const nextJson = patchElementorSectionInJson(raw, sectionId, normalizedPatch);
      const headers = sectionOutlineFromJson(nextJson);
      onUpdateRow(rowIndex, {
        elementorDataJson: nextJson,
        elementorSectionHeaders: headers,
        blogH2List: headers.map((s) => s.title).filter((t) => Boolean(t?.trim())),
      });
      return;
    }

    const nextHeaders = elementorSections.map((sec) => {
      if (sec.id !== sectionId) return sec;
      const nextBodyHtml =
        patch.bodyHtml != null ? normalizeSectionProseHtml(patch.bodyHtml) : sec.bodyHtml;
      return {
        ...sec,
        title: patch.title ?? sec.title,
        bodyHtml: nextBodyHtml,
        bodyText: patch.bodyHtml != null ? prosePlainText(nextBodyHtml) : sec.bodyText,
      };
    });
    onUpdateRow(rowIndex, {
      elementorSectionHeaders: nextHeaders,
      blogH2List: nextHeaders.map((s) => s.title).filter((t) => Boolean(t?.trim())),
    });
  };

  const handleRewriteElementorPassage = async (
    sectionIdx: number,
    mode: PassageRewriteMode,
  ) => {
    const target = elementorSections[sectionIdx];
    if (!target) return;
    if (row.elementorDataJson?.trim()) {
      if (mode === "header" && onAiElementorSectionHeader) {
        await onAiElementorSectionHeader(rowIndex, target.id);
        return;
      }
      if (mode === "copy" && onAiElementorSectionContent) {
        await onAiElementorSectionContent(rowIndex, target.id);
        return;
      }
      if (mode === "both" && onAiElementorSection) {
        await onAiElementorSection(rowIndex, target.id);
        return;
      }
    }

    const key = `${target.id}:${mode}`;
    const total = elementorSections.length;
    setRewritingPassageKey(key);
    onPassageStatusChange?.({
      label: `Section ${sectionIdx + 1}/${total}: ${target.title || `Section ${sectionIdx + 1}`}`,
      current: sectionIdx + 1,
      total,
    });
    const elBeforeBody = (target.bodyHtml || target.bodyText || "").trim();
    const elBeforeTitle = target.title;
    try {
      const siblingTitles = elementorSections
        .filter((_, idx) => idx !== sectionIdx)
        .map((s) => s.title);
      const res = await rewriteBlogPassageSection({
        mode,
        section: {
          id: target.id || `el-sec-${sectionIdx}`,
          index: sectionIdx,
          h2OpenTag: "<h2>",
          title: target.title,
          bodyHtml: elBeforeBody,
        },
        siblingTitles,
        articleTitle: row.aiTitle?.trim() || row.title || "",
        focusKeyword: row.focusKeyword?.trim() || "",
        seoResearchBrief: row.seoResearch,
        siteId,
        siteUrl,
        pageUrl: row.url,
        businessName,
      });
      const manualStep =
        mode === "header" ? "Manual: H2" : mode === "copy" ? "Manual: Copy" : "Manual: H2 + copy";
      if (mode === "header") {
        recordOverviewStudioTextRevision({
          pageUrl: row.url,
          stepLabel: manualStep,
          sectionTitle: elBeforeTitle,
          beforeText: elBeforeTitle,
          afterText: (res.title ?? elBeforeTitle).trim(),
        });
      } else {
        const afterHtml = normalizeSectionProseHtml(res.bodyHtml ?? elBeforeBody);
        recordOverviewStudioRevision({
          pageUrl: row.url,
          stepLabel: manualStep,
          sectionTitle: (res.title ?? elBeforeTitle).trim() || undefined,
          beforeHtml: elBeforeBody,
          afterHtml,
        });
      }
      commitElementorSection(target.id, res);
    } catch (err) {
      notifyHeaderError(
        "Section rewrite failed",
        err instanceof Error ? err.message : "Could not rewrite section.",
      );
    } finally {
      setRewritingPassageKey(null);
      onPassageStatusChange?.(null);
    }
  };

  const commitFaqEntry = (faqIdx: number, patch: { question?: string; answer?: string }) => {
    const next = faqEntries.map((item, i) =>
      i === faqIdx
        ? {
            question: patch.question ?? item.question,
            answer: patch.answer ?? item.answer,
          }
        : item,
    );
    onUpdateRow(rowIndex, { faq: serializeFaqEntriesPlain(next) });
  };

  const anyBusy = busy || rewritingPassageKey !== null;
  return {
    activeStepTitleKey, linksExpanded, setLinksExpanded, rewritingPassageKey, isPagesSource, isSapSource,
    answerHtml, overviewHtml, scenarioHtml, coreArticleBodyHtml, trailingFaqBlockHtml, parsedPassageDoc,
    elementorSections, extractedLinks, internalLinks, wikiLinks, faqEntries, commitCoreArticleBodyHtml,
    commitPassageSectionPatch, passageProseEditorKey, handleRewriteBlogPassage, commitElementorSection, handleRewriteElementorPassage,
    commitFaqEntry, anyBusy,
  };
}
