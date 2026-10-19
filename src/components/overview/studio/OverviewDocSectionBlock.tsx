import React, { useMemo, useState } from "react";
import {
  ChevronDown,
  CircleHelp,
  Globe,
  Heading2,
  ImageIcon,
  Link2,
  ListTree,
  Plus,
  Sparkles,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import {
  CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
  CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { OverviewSectionProseEditor } from "@/components/overview/OverviewSectionProseEditor";
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
import {
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
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { cn } from "@/lib/utils";

export interface OverviewDocSectionBlocksProps {
  row: OverviewRow;
  rowIndex: number;
  sitemapSource: OverviewSitemapSource;
  siteId?: string | null;
  siteUrl?: string;
  businessName?: string;
  isElementorRow: boolean;
  bodyHtml: string;
  busy: boolean;
  onUpdateRow: (index: number, patch: Partial<OverviewRow>) => void;
  onAiAnswer: (index: number) => void | Promise<void>;
  onAiOverview: (index: number) => void | Promise<void>;
  onAiHeaders: (index: number) => void | Promise<void>;
  onAiLinks: (index: number) => void | Promise<void>;
  onAiWikipediaLink: (index: number) => void | Promise<void>;
  onAiScenario: (index: number) => void | Promise<void>;
  onAiInContentImage: (index: number) => void | Promise<void>;
  onAiFaqAll: (index: number) => void | Promise<void>;
  onAiFaqQuestion: (index: number, faqIndex: number) => void | Promise<void>;
  onAiFaqAnswer: (index: number, faqIndex: number) => void | Promise<void>;
  onAiElementorSection?: (index: number, sectionId: string) => void | Promise<void>;
  onAiElementorSectionHeader?: (index: number, sectionId: string) => void | Promise<void>;
  onAiElementorSectionContent?: (index: number, sectionId: string) => void | Promise<void>;
  onPassageStatusChange?: (status: { label: string; current: number; total: number } | null) => void;
  /** Auto SEO batch/single: highlight the H2 section matching the current harness step title. */
  activeOptimizingSectionTitle?: string | null;
}

const QUIET_PILL_BTN =
  "h-8 shrink-0 rounded-none border-0 bg-zinc-900 px-2.5 text-base font-normal text-muted-foreground hover:bg-zinc-800 hover:text-white disabled:opacity-45";

export function OverviewDocSectionBlocks({
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
      elementorSectionHeadersFromCachedRow(row).filter((sec) => {
        const key = (sec.title ?? "").trim().toLowerCase();
        return key !== "faq" && key !== "frequently asked questions";
      }),
    [row],
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
    const nextSections = parsedPassageDoc.sections.map((sec, idx) =>
      idx === sectionIdx
        ? {
            ...sec,
            title: patch.title ?? sec.title,
            bodyHtml:
              patch.bodyHtml != null
                ? normalizeSectionProseHtml(patch.bodyHtml)
                : sec.bodyHtml,
          }
        : sec,
    );
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

  return (
    <div className="flex w-full flex-col gap-6 text-base text-white">
      {/* Quiet Single-Line Mastra Document Toolbar (Sitemap-Relative: Pages vs Posts vs SAP) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {!isPagesSource && !answerHtml ? (
            <Button
              type="button"
              variant="ghost"
              disabled={anyBusy}
              onClick={() => void onAiAnswer(rowIndex)}
              className={cn(
                QUIET_PILL_BTN,
                row.status === "ai-answer" && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
              )}
            >
              <Plus className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
              Answer
            </Button>
          ) : null}

          {!isPagesSource && !overviewHtml ? (
            <Button
              type="button"
              variant="ghost"
              disabled={anyBusy}
              onClick={() => void onAiOverview(rowIndex)}
              className={cn(
                QUIET_PILL_BTN,
                row.status === "ai-overview" && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
              )}
            >
              <Plus className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
              Overview
            </Button>
          ) : null}

          {!isPagesSource && !scenarioHtml ? (
            <Button
              type="button"
              variant="ghost"
              disabled={anyBusy}
              onClick={() => void onAiScenario(rowIndex)}
              className={cn(
                QUIET_PILL_BTN,
                row.status === "ai-scenario" && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
              )}
            >
              <Plus className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
              Scenario
            </Button>
          ) : null}

          {faqEntries.length === 0 ? (
            <Button
              type="button"
              variant="ghost"
              disabled={anyBusy}
              onClick={() => void onAiFaqAll(rowIndex)}
              className={cn(
                QUIET_PILL_BTN,
                row.status === "ai-faq" && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
              )}
            >
              <Plus className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
              FAQs
            </Button>
          ) : null}

          <Button
            type="button"
            variant="ghost"
            disabled={anyBusy}
            onClick={() => void onAiHeaders(rowIndex)}
            className={cn(
              QUIET_PILL_BTN,
              row.status === "ai-headers" && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
            )}
            title={
              isPagesSource
                ? "Optimize Elementor section headings"
                : "Rewrite all H2 headings across the article"
            }
          >
            <Heading2 className="mr-1.5 h-3.5 w-3.5 text-primary" aria-hidden />
            {isPagesSource ? "All Headers" : "All H2s"}
          </Button>

          <Button
            type="button"
            variant="ghost"
            disabled={anyBusy}
            onClick={() => void onAiLinks(rowIndex)}
            className={cn(
              QUIET_PILL_BTN,
              row.status === "ai-links" && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
            )}
            title="Weave contextual internal links"
          >
            <Link2 className="mr-1.5 h-3.5 w-3.5 text-cyan-400" aria-hidden />
            Weave Links
          </Button>

          {!isPagesSource ? (
            <Button
              type="button"
              variant="ghost"
              disabled={anyBusy}
              onClick={() => void onAiWikipediaLink(rowIndex)}
              className={cn(
                QUIET_PILL_BTN,
                row.status === "ai-wikipedia-link" && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
              )}
              title="Insert Wikipedia entity citation"
            >
              <Globe className="mr-1.5 h-3.5 w-3.5 text-primary" aria-hidden />
              Wikipedia
            </Button>
          ) : null}

          {!isPagesSource ? (
            <Button
              type="button"
              variant="ghost"
              disabled={anyBusy}
              onClick={() => void onAiInContentImage(rowIndex)}
              className={cn(
                QUIET_PILL_BTN,
                row.status === "ai-in-content-image" && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
              )}
              title={
                isSapSource
                  ? "Generate local or in-content section image"
                  : "Generate in-content section image"
              }
            >
              <ImageIcon className="mr-1.5 h-3.5 w-3.5 text-cyan-400" aria-hidden />
              {isSapSource ? "Local / Section Image" : "Section Image"}
            </Button>
          ) : null}
        </div>

        {/* Quiet Collapsible Links Summary Pill */}
        {extractedLinks.length > 0 ? (
          <button
            type="button"
            onClick={() => setLinksExpanded((prev) => !prev)}
            className="inline-flex h-8 items-center gap-1.5 bg-zinc-900 px-2.5 text-base tabular-nums text-sky-400 hover:bg-zinc-800"
          >
            <Link2 className="h-3.5 w-3.5" aria-hidden />
            <span>
              {isPagesSource
                ? `${internalLinks.length} Internal Links`
                : `${internalLinks.length} Links · ${wikiLinks.length} Wiki`}
            </span>
            <ChevronDown
              className={cn("h-3.5 w-3.5 transition-transform", linksExpanded && "rotate-180")}
              aria-hidden
            />
          </button>
        ) : null}
      </div>

      {/* Expandable Citation Drawer */}
      {linksExpanded && extractedLinks.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 bg-zinc-900/60 p-3">
          {extractedLinks.map((lnk, idx) => (
            <a
              key={`${lnk.href}-${idx}`}
              href={lnk.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-[18rem] items-center gap-1.5 truncate bg-black px-2.5 py-1 text-base text-cyan-400 hover:text-white"
              title={lnk.href}
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{lnk.anchor || lnk.href}</span>
            </a>
          ))}
        </div>
      ) : null}

      {/* Staged In-Content Image Preview */}
      {row.blogInContentImageUrl?.trim() ? (
        <div className="flex items-center gap-3 bg-zinc-900/60 p-3">
          <div className="relative aspect-video w-40 shrink-0 overflow-hidden bg-black">
            <img
              src={row.blogInContentImageUrl}
              alt={row.blogInContentImageAlt || "Staged in-content image"}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="font-semibold text-white">
              Staged Section Image{" "}
              {row.blogInContentImageSection ? `(${row.blogInContentImageSection})` : ""}
            </span>
            <span className="truncate text-base text-muted-foreground">
              {row.blogInContentImageAlt || "Auto-generated SEO alt text"}
            </span>
          </div>
        </div>
      ) : null}

      {/* 1. Direct Answer Section (Always stacked above Overview) */}
      {answerHtml ? (
        <section
          id="studio-sec-answer"
          className={cn(
            "group relative flex scroll-mt-6 flex-col gap-2 border-b border-white/10 pb-5",
            row.status === "ai-answer" && CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
          )}
          aria-label="Direct Answer Block"
        >
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "text-base font-semibold",
                row.status === "ai-answer"
                  ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS
                  : "text-primary",
              )}
            >
              Answer
            </span>
            <Button
              type="button"
              variant="ghost"
              disabled={anyBusy}
              onClick={() => void onAiAnswer(rowIndex)}
              className="h-7 rounded-none border-0 bg-zinc-900 px-2 text-base text-white hover:bg-zinc-800"
            >
              <Wand2 className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
              Rewrite Answer
            </Button>
          </div>
          <div
            className="text-base leading-relaxed text-zinc-100 [&_a]:text-cyan-400 [&_a]:underline [&_h2]:hidden [&_p]:my-1"
            dangerouslySetInnerHTML={{ __html: answerHtml }}
          />
        </section>
      ) : null}

      {/* 2. Overview & Jump Citations Section (Stacked below Answer) */}
      {overviewHtml ? (
        <section
          id="studio-sec-overview"
          className={cn(
            "group relative flex scroll-mt-6 flex-col gap-2 border-b border-white/10 pb-5",
            row.status === "ai-overview" && CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
          )}
          aria-label="Overview and Citations Block"
        >
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "flex items-center gap-1.5 text-base font-semibold",
                row.status === "ai-overview"
                  ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS
                  : "text-primary",
              )}
            >
              <ListTree className="h-4 w-4 text-cyan-400" aria-hidden />
              Overview
            </span>
            <Button
              type="button"
              variant="ghost"
              disabled={anyBusy}
              onClick={() => void onAiOverview(rowIndex)}
              className="h-7 rounded-none border-0 bg-zinc-900 px-2 text-base text-white hover:bg-zinc-800"
            >
              <Wand2 className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
              Rewrite Overview
            </Button>
          </div>
          <div
            className="text-base leading-relaxed text-zinc-100 [&_a]:text-cyan-400 [&_a]:underline [&_h2]:hidden [&_li]:my-1.5 [&_p]:my-1.5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: overviewHtml }}
          />
        </section>
      ) : null}

      {/* 3. Passage-Level H2 Sections (Every H2 is its own clean section for passage rewrites) */}
      <section className="flex flex-col gap-6" aria-label="Passage-Level Sections">
        {isElementorRow && elementorSections.length > 0 ? (
          elementorSections.map((sec, secIdx) => {
            const isHeaderRunning = rewritingPassageKey === `${sec.id}:header`;
            const isCopyRunning = rewritingPassageKey === `${sec.id}:copy`;
            const isBothRunning = rewritingPassageKey === `${sec.id}:both`;
            const isPassageActive =
              isHeaderRunning ||
              isCopyRunning ||
              isBothRunning ||
              (busy &&
                activeStepTitleKey.length > 0 &&
                sec.title.trim().toLowerCase() === activeStepTitleKey);

            return (
              <div
                key={sec.id || secIdx}
                id={`studio-sec-h2-${secIdx}`}
                className={cn(
                  "group flex scroll-mt-6 flex-col gap-2 border-b border-white/10 pb-6 last:border-b-0",
                  isPassageActive &&
                    "animate-meta-opt-breathe border-semantic-data/40 bg-zinc-900/35 px-3 py-3",
                )}
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={sec.title}
                    onChange={(e) => commitElementorSection(sec.id, { title: e.target.value })}
                    placeholder={`Section ${secIdx + 1} heading`}
                    aria-label={`Section ${secIdx + 1} heading`}
                    className={cn(
                      "h-9 flex-1 rounded-none border-0 bg-transparent px-0 text-lg font-semibold focus-visible:bg-zinc-900 focus-visible:px-2.5 focus-visible:ring-1 focus-visible:ring-primary",
                      isPassageActive ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-white",
                    )}
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={anyBusy}
                      onClick={() => void handleRewriteElementorPassage(secIdx, "header")}
                      className={cn(
                        "h-7 rounded-none border-0 bg-zinc-900 px-2 text-base text-white hover:bg-zinc-800",
                        isHeaderRunning && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
                      )}
                      title="Rewrite H2 heading"
                    >
                      <Wand2 className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
                      H2
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={anyBusy}
                      onClick={() => void handleRewriteElementorPassage(secIdx, "copy")}
                      className={cn(
                        "h-7 rounded-none border-0 bg-zinc-900 px-2 text-base text-white hover:bg-zinc-800",
                        isCopyRunning && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
                      )}
                      title="Rewrite passage copy"
                    >
                      <Wand2 className="mr-1 h-3.5 w-3.5 text-cyan-400" aria-hidden />
                      Copy
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={anyBusy}
                      onClick={() => void handleRewriteElementorPassage(secIdx, "both")}
                      className={cn(
                        "h-7 rounded-none border-0 bg-zinc-900 px-2 text-base text-white hover:bg-zinc-800",
                        isBothRunning && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
                      )}
                      title="Rewrite both H2 and passage copy"
                    >
                      <Sparkles className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
                      Both
                    </Button>
                  </div>
                </div>
                <OverviewSectionProseEditor
                  key={passageProseEditorKey({
                    id: sec.id || `el-${secIdx}`,
                    bodyHtml: sec.bodyHtml || sec.bodyText || "",
                  })}
                  value={sec.bodyHtml || sec.bodyText || ""}
                  readOnly={anyBusy}
                  siteUrl={siteUrl}
                  placeholder="Write section copy..."
                  className="bg-transparent shadow-none"
                  onChange={(nextHtml) => commitElementorSection(sec.id, { bodyHtml: nextHtml })}
                />
              </div>
            );
          })
        ) : parsedPassageDoc.sections.length > 0 ? (
          parsedPassageDoc.sections.map((sec, secIdx) => {
            const isHeaderRunning = rewritingPassageKey === `${sec.id}:header`;
            const isCopyRunning = rewritingPassageKey === `${sec.id}:copy`;
            const isBothRunning = rewritingPassageKey === `${sec.id}:both`;
            const isPassageActive =
              isHeaderRunning ||
              isCopyRunning ||
              isBothRunning ||
              (busy &&
                activeStepTitleKey.length > 0 &&
                sec.title.trim().toLowerCase() === activeStepTitleKey);

            return (
              <div
                key={sec.id || secIdx}
                id={`studio-sec-h2-${secIdx}`}
                className={cn(
                  "group flex scroll-mt-6 flex-col gap-2 border-b border-white/10 pb-6 last:border-b-0",
                  isPassageActive &&
                    "animate-meta-opt-breathe border-semantic-data/40 bg-zinc-900/35 px-3 py-3",
                )}
              >
                <div className="flex items-center gap-2">
                  <Input
                    value={sec.title}
                    onChange={(e) => commitPassageSectionPatch(secIdx, { title: e.target.value })}
                    placeholder={`H2 Section ${secIdx + 1} heading`}
                    aria-label={`H2 Section ${secIdx + 1} heading`}
                    className={cn(
                      "h-9 flex-1 rounded-none border-0 bg-transparent px-0 text-lg font-semibold focus-visible:bg-zinc-900 focus-visible:px-2.5 focus-visible:ring-1 focus-visible:ring-primary",
                      isPassageActive ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-white",
                    )}
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={anyBusy}
                      onClick={() => void handleRewriteBlogPassage(secIdx, "header")}
                      className={cn(
                        "h-7 rounded-none border-0 bg-zinc-900 px-2 text-base text-white hover:bg-zinc-800",
                        isHeaderRunning && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
                      )}
                      title="Rewrite this H2 heading"
                    >
                      <Wand2 className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
                      H2
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={anyBusy}
                      onClick={() => void handleRewriteBlogPassage(secIdx, "copy")}
                      className={cn(
                        "h-7 rounded-none border-0 bg-zinc-900 px-2 text-base text-white hover:bg-zinc-800",
                        isCopyRunning && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
                      )}
                      title="Optimize this passage's copy in place"
                    >
                      <Wand2 className="mr-1 h-3.5 w-3.5 text-cyan-400" aria-hidden />
                      Copy
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      disabled={anyBusy}
                      onClick={() => void handleRewriteBlogPassage(secIdx, "both")}
                      className={cn(
                        "h-7 rounded-none border-0 bg-zinc-900 px-2 text-base text-white hover:bg-zinc-800",
                        isBothRunning && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
                      )}
                      title="Optimize both H2 heading and passage copy"
                    >
                      <Sparkles className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
                      Both
                    </Button>
                  </div>
                </div>

                <OverviewSectionProseEditor
                  key={passageProseEditorKey(sec)}
                  value={sec.bodyHtml}
                  readOnly={anyBusy}
                  siteUrl={siteUrl}
                  placeholder="Write passage copy..."
                  className="bg-transparent shadow-none"
                  onChange={(nextHtml) =>
                    commitPassageSectionPatch(secIdx, { bodyHtml: nextHtml })
                  }
                />
              </div>
            );
          })
        ) : (
          <OverviewSectionProseEditor
            value={coreArticleBodyHtml}
            readOnly={anyBusy}
            siteUrl={siteUrl}
            placeholder="Write article body..."
            className="min-h-[24rem] bg-transparent shadow-none"
            onChange={(nextCoreHtml) => commitCoreArticleBodyHtml(nextCoreHtml)}
          />
        )}
      </section>

      {/* 4. Bottom FAQ Schema Section (Only rendered when FAQs exist) */}
      {faqEntries.length > 0 ? (
        <section
          id="studio-sec-faq"
          className={cn(
            "flex scroll-mt-6 flex-col gap-3 border-t border-white/10 pt-5",
            row.status === "ai-faq" && CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
          )}
          aria-label="FAQ Schema Block"
        >
          <div className="flex items-center justify-between gap-2">
            <div
              className={cn(
                "flex items-center gap-2 font-semibold",
                row.status === "ai-faq"
                  ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS
                  : "text-white",
              )}
            >
              <CircleHelp className="h-4 w-4 text-cyan-400" aria-hidden />
              <span>Frequently Asked Questions ({faqEntries.length})</span>
            </div>
            <Button
              type="button"
              variant="ghost"
              disabled={anyBusy}
              onClick={() => void onAiFaqAll(rowIndex)}
              className={cn(
                QUIET_PILL_BTN,
                row.status === "ai-faq" && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
              )}
            >
              <Wand2 className="mr-1.5 h-3.5 w-3.5 text-primary" aria-hidden />
              Regenerate FAQs
            </Button>
          </div>

          <div className="flex flex-col gap-2.5">
            {faqEntries.map((item, faqIdx) => (
              <div key={faqIdx} className="group flex flex-col gap-1.5 bg-zinc-900/50 p-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-7 shrink-0 tabular-nums text-sky-400">
                    Q{faqIdx + 1}
                  </span>
                  <Input
                    value={item.question}
                    onChange={(e) => commitFaqEntry(faqIdx, { question: e.target.value })}
                    placeholder="FAQ question"
                    aria-label={`FAQ ${faqIdx + 1} question`}
                    className="h-8 flex-1 rounded-none border-0 bg-zinc-900 px-3 text-base font-medium text-white"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={anyBusy}
                    onClick={() => void onAiFaqQuestion(rowIndex, faqIdx)}
                    className="h-8 w-8 shrink-0 rounded-none border-0 bg-zinc-900 text-muted-foreground hover:bg-zinc-800 hover:text-primary"
                    title="Rewrite FAQ question"
                  >
                    <Wand2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>

                <div className="flex items-start gap-1.5">
                  <span className="w-7 shrink-0 pt-1.5 tabular-nums text-muted-foreground">
                    A{faqIdx + 1}
                  </span>
                  <Textarea
                    value={item.answer}
                    onChange={(e) => commitFaqEntry(faqIdx, { answer: e.target.value })}
                    rows={2}
                    placeholder="FAQ answer"
                    aria-label={`FAQ ${faqIdx + 1} answer`}
                    className="min-h-[3.5rem] flex-1 resize-y rounded-none border-0 bg-zinc-900 px-3 py-1.5 text-base text-zinc-200"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={anyBusy}
                    onClick={() => void onAiFaqAnswer(rowIndex, faqIdx)}
                    className="h-8 w-8 shrink-0 rounded-none border-0 bg-zinc-900 text-muted-foreground hover:bg-zinc-800 hover:text-cyan-400"
                    title="Rewrite FAQ answer"
                  >
                    <Wand2 className="h-3.5 w-3.5" aria-hidden />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
