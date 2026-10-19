import React from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ContentOptimizationControls } from "@/components/integrations/wordpress/ContentOptimizationControls";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewBinding } from "@/hooks/overview/use-overview-wordpress-binding";
import type { WordPressOptimizationContextValue } from "@/contexts/wordpress-optimization-context";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { patchRowForNewFocusKeyword } from "@/components/overview/overview-meta-row-patches";
import {
  fullDestinationUrl,
  normalizeFocusKeywordPhrase,
  suggestedPathFromFocusKeywordForMetaOptimizer,
} from "@/lib/rank-math-redirect-csv";
import { BACKEND_API_BASE } from "@/lib/wordpress-api/connection";
import { resolveMcpToolUrl } from "@/lib/mcp-tools";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { NOTIFY_URL_COPIED_TO_CLIPBOARD } from "@/lib/notify-messages";
import {
  Loader2,
  Wand2,
  RefreshCw,
  Upload as UploadIcon,
  FileDown,
  Search,
  Copy,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Sparkles,
  CircleHelp,
  Heading2,
  Link2,
  ListTree,
  ImageIcon,
  MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { parseFaqEntries, serializeFaqEntriesPlain } from "@/lib/faq-entries";
import { extractH2TextsFromHtml } from "@/lib/overview/overview-blog-headers-extract";
import { normalizeSectionProseHtml, prosePlainText } from "@/lib/elementor-page-content/extract-text-editor-prose";
import { elementorSectionHeadersFromCachedRow } from "@/lib/elementor-page-content/elementor-section-headers-from-cache";
import { OverviewSectionProseEditor } from "@/components/overview/OverviewSectionProseEditor";
import { patchElementorSectionKeyword } from "@/lib/elementor-page-content/elementor-section-focus-keyword";
import {
  patchElementorSectionInJson,
  sectionOutlineFromJson,
} from "@/lib/elementor-page-content/apply-elementor-section-copy";
import { buildElementorPageHtml } from "@/lib/elementor-page-content/elementor-page-html";
import { extractAllSectionLinkRowsFromHtml, extractInternalLinksFromHtml } from "@/lib/overview/overview-blog-links-extract";
import {
  appendInternalLinkToHtml,
  patchSectionLinkAtIndex,
} from "@/lib/overview/overview-blog-links-apply-local";
import { isWikipediaHref, extractWikipediaLinksWithContext, wikipediaTitleFromHref } from "@/lib/overview/overview-blog-wikipedia-link-insert";
import { extractOverviewSectionHtml, extractAnswerSectionHtml } from "@/lib/overview/overview-blog-overview-prepend";
import { extractIllustrativeSectionHtml } from "@/lib/overview/overview-blog-scenario-section";
import { overviewRowUrlPathLabel, overviewTitlePrimarySegment } from "@/lib/overview/overview-tab-display";
import { overviewBindingForRow, overviewDateModifierTodayIso } from "@/lib/overview/overview-bulk-seo-payload";
import { subtypeToEndpoint } from "@/hooks/content-optimization/optimization-helpers";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import { overviewTitleOptimizationExcluded } from "@/lib/overview/overview-page-bucket";
import { DASHBOARD_LIST_CHECKBOX_CLASS } from "@/components/shared/workspace-checkbox-styles";
import {
  buildOverviewRedirectRow,
  downloadOverviewRedirectCsv,
  overviewRedirectCsvFilename,
} from "@/lib/overview/overview-redirect-row";

const META_OPT_OUTLINE =
  "rounded-none border-0 bg-zinc-900 text-foreground shadow-none hover:bg-zinc-800 [&_svg]:text-muted-foreground hover:[&_svg]:text-foreground disabled:opacity-50 focus-visible:ring-2 focus-visible:ring-primary/35 focus-visible:ring-offset-0";

const META_FAQ_TOOL_ICON = cn("h-8 w-8 shrink-0 p-0", META_OPT_OUTLINE);
const META_FAQ_TOOL_ACTION = cn(
  "h-8 shrink-0 px-2.5 text-base font-medium inline-flex items-center justify-center gap-1.5",
  META_OPT_OUTLINE,
);
const META_FAQ_TOOL_CHIP = cn(
  "h-8 min-w-[2.75rem] shrink-0 px-2 text-base font-semibold tabular-nums tracking-wide inline-flex items-center justify-center",
  META_OPT_OUTLINE,
);

const META_FAQ_PAIR_TILE = "space-y-2 rounded-none bg-zinc-950 py-1.5";
/** Light elevated fields: white value text, neon cyan placeholders, readable on dark UI */
const META_INPUT_SURFACE =
  "rounded-none border-0 bg-zinc-900 text-white shadow-inner shadow-black/40 placeholder:text-cyan-400 placeholder:opacity-95 focus-visible:ring-2 focus-visible:ring-cyan-400/30 focus-visible:ring-offset-0 selection:bg-cyan-500/20";

export const META_TRIGGER_FLAT =
  "flex w-full items-center gap-2 rounded-none border-0 bg-transparent px-0 py-1.5 text-left text-base font-medium text-white";

/** Character counts in end rails — blue */
export const META_FIELD_COUNT = "text-base font-medium tabular-nums text-sky-400";
/** WordPress-style post bar: horizontal cells, dividers, right stack */
export const META_FIELD_END_RAIL =
  "flex h-7 shrink-0 items-stretch divide-x divide-white/25 rounded-none border-0 bg-zinc-950/90 sm:h-8";
export const META_FIELD_END_RAIL_CELL = "flex min-w-[2rem] items-center justify-center px-2";
export const META_FIELD_END_RAIL_BTN =
  "inline-flex h-full min-h-0 min-w-[2rem] shrink-0 items-center justify-center rounded-none border-0 bg-transparent px-0 shadow-none hover:bg-white/10 focus-visible:ring-1 focus-visible:ring-cyan-400/35 focus-visible:ring-offset-0 disabled:opacity-45 [&_svg]:text-emerald-400";

const META_EDITABLE_LIST_ITEM = "flex min-w-0 items-start gap-2";
const META_EDITABLE_LIST_TEXTAREA = cn(
  "min-h-9 min-w-0 flex-1 resize-y py-2 px-3 text-left text-base leading-snug",
  META_INPUT_SURFACE,
);
const META_EDITABLE_LIST_INPUT = cn(
  "min-h-9 min-w-0 w-full py-2 px-3 text-left text-base",
  META_INPUT_SURFACE,
);

function isVisualElementorSection(section: {
  hasHeadingWidget?: boolean;
  headingInBodyHtml?: boolean;
  title: string;
  bodyText?: string;
  bodyHtml?: string;
}): boolean {
  return (
    !section.hasHeadingWidget &&
    !section.headingInBodyHtml &&
    !section.title?.trim() &&
    !section.bodyText?.trim() &&
    !section.bodyHtml?.trim()
  );
}

function MetaEditableListTextarea({
  index,
  value,
  onChange,
  readOnly,
  ariaLabel,
}: {
  index: number;
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
  ariaLabel: string;
}) {
  return (
    <div className={META_EDITABLE_LIST_ITEM}>
      <span className="w-6 shrink-0 pt-2 tabular-nums text-muted-foreground">{index + 1}</span>
      <Textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        readOnly={readOnly}
        disabled={readOnly}
        rows={2}
        className={META_EDITABLE_LIST_TEXTAREA}
        aria-label={ariaLabel}
      />
    </div>
  );
}

function MetaEditableLinkRow({
  anchor,
  href,
  readOnly,
  onAnchorChange,
  onHrefChange,
  showAddButton,
  onAdd,
  linkLabel,
  onAiLink,
  aiLinkLoading,
}: {
  anchor: string;
  href: string;
  readOnly?: boolean;
  onAnchorChange: (value: string) => void;
  onHrefChange: (value: string) => void;
  showAddButton?: boolean;
  onAdd?: () => void;
  linkLabel?: string;
  onAiLink?: () => void | Promise<void>;
  aiLinkLoading?: boolean;
}) {
  const label = linkLabel ?? "Link";
  return (
    <div className="flex min-w-0 items-center gap-2">
      <Input
        value={anchor}
        onChange={(e) => onAnchorChange(e.target.value)}
        readOnly={readOnly}
        disabled={readOnly}
        className={cn(META_EDITABLE_LIST_INPUT, "min-w-0 max-w-[40%] flex-[2]")}
        placeholder="Anchor"
        aria-label={`${label} anchor`}
      />
      <div className="relative min-w-0 flex-1">
        <Input
          value={href}
          onChange={(e) => onHrefChange(e.target.value)}
          readOnly={readOnly}
          disabled={readOnly}
          className={cn(META_EDITABLE_LIST_INPUT, "min-w-0 w-full", onAiLink && "pr-[2.75rem]")}
          placeholder="URL"
          aria-label={`${label} URL`}
        />
        {onAiLink ? (
          <MetaFieldEndRail align="top">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className={META_FIELD_END_RAIL_BTN}
              disabled={readOnly || aiLinkLoading}
              title="Find an appropriate internal link for this section"
              onClick={() => void onAiLink()}
            >
              {aiLinkLoading ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
              ) : (
                <Wand2 className="h-4 w-4 shrink-0 text-emerald-400" />
              )}
            </Button>
          </MetaFieldEndRail>
        ) : null}
      </div>
      {showAddButton ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          className={META_FAQ_TOOL_ICON}
          disabled={readOnly}
          title="Add link to this section"
          onClick={onAdd}
        >
          <span className="text-base font-medium leading-none">+</span>
        </Button>
      ) : null}
    </div>
  );
}

function ElementorSectionLinks({
  bodyHtml,
  readOnly,
  onBodyChange,
  onAiLinkRow,
}: {
  bodyHtml: string;
  readOnly?: boolean;
  onBodyChange: (nextHtml: string) => void;
  onAiLinkRow?: (linkIndex: number) => void | Promise<void>;
}) {
  const extracted = React.useMemo(
    () =>
      extractAllSectionLinkRowsFromHtml(bodyHtml).filter((link) => !isWikipediaHref(link.href)),
    [bodyHtml],
  );
  const [pendingRows, setPendingRows] = React.useState<Array<{ anchor: string; href: string }> | null>(null);
  const [aiLinkLoadingIndex, setAiLinkLoadingIndex] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (extracted.length > 0 && !(pendingRows?.length ?? 0)) {
      setPendingRows(null);
    }
  }, [extracted.length, pendingRows?.length]);

  const rows =
    extracted.length > 0
      ? [...extracted, ...(pendingRows ?? [])]
      : (pendingRows ?? [{ anchor: "", href: "" }]);

  const commitRow = (linkIndex: number, patch: { anchor?: string; href?: string }) => {
    const current = rows[linkIndex]!;
    const next = {
      anchor: patch.anchor ?? current.anchor,
      href: patch.href ?? current.href,
    };

    if (linkIndex < extracted.length) {
      onBodyChange(patchSectionLinkAtIndex(bodyHtml, linkIndex, next));
      return;
    }

    const pendingIndex = linkIndex - extracted.length;
    const pending = pendingRows ?? (extracted.length === 0 ? [{ anchor: "", href: "" }] : []);
    const updated = [...pending];
    updated[pendingIndex] = next;
    setPendingRows(updated);

    if (next.anchor.trim() || next.href.trim()) {
      onBodyChange(appendInternalLinkToHtml(bodyHtml, next.anchor, next.href));
      const remaining = updated.filter((_, i) => i !== pendingIndex);
      setPendingRows(remaining.length > 0 ? remaining : null);
    }
  };

  const handleAdd = () => {
    if (extracted.length > 0) {
      onBodyChange(appendInternalLinkToHtml(bodyHtml, "", ""));
      return;
    }
    const base = pendingRows ?? [{ anchor: "", href: "" }];
    setPendingRows([...base, { anchor: "", href: "" }]);
  };

  return (
    <div className="min-w-0 space-y-1.5">
      {rows.map((link, linkIndex) => (
        <MetaEditableLinkRow
          key={`section-link-${linkIndex}`}
          linkLabel={`Section link ${linkIndex + 1}`}
          anchor={link.anchor}
          href={link.href}
          readOnly={readOnly}
          onAnchorChange={(nextAnchor) => commitRow(linkIndex, { anchor: nextAnchor })}
          onHrefChange={(nextHref) => commitRow(linkIndex, { href: nextHref })}
          showAddButton={linkIndex === rows.length - 1}
          onAdd={handleAdd}
          onAiLink={
            onAiLinkRow
              ? async () => {
                  setAiLinkLoadingIndex(linkIndex);
                  try {
                    await onAiLinkRow(linkIndex);
                  } finally {
                    setAiLinkLoadingIndex(null);
                  }
                }
              : undefined
          }
          aiLinkLoading={aiLinkLoadingIndex === linkIndex}
        />
      ))}
    </div>
  );
}

function MetaFieldEndRail({
  align,
  className,
  children,
}: {
  align: "center" | "top";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute right-1 z-10",
        align === "center" && "top-1/2 -translate-y-1/2",
        align === "top" && "top-1.5",
        className,
      )}
    >
      <div className={cn("pointer-events-auto", META_FIELD_END_RAIL)}>{children}</div>
    </div>
  );
}

import { CONTENT_OPTIMIZER_ROW_SHELL_CLASS, contentOptimizerRowStripeClass } from "@/components/overview/overview-tab/overview-tab-content-constants";
const ZONE_BASE = "space-y-2.5 rounded-none";
const zoneTop = ZONE_BASE;
const zoneSerp = cn(ZONE_BASE, "min-h-[12.5rem]");
/** Brief JSON + headers / links / FAQs / content — flush alternating stripes */
export const zoneMetaAccordionStack = "flex flex-col gap-0 rounded-none pt-2.5";

export function MetaAccordionStripeRow({
  stripeIndex,
  children,
}: {
  stripeIndex: number;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(contentOptimizerRowStripeClass(stripeIndex), "w-full min-w-0")}>{children}</div>
  );
}

const META_ACCORDION_TRIGGER_BTN =
  "flex min-w-0 flex-1 items-center gap-2 border-0 bg-transparent p-0 text-left text-base font-semibold text-white";

function MetaAccordionHeaderRow({
  open,
  icon,
  label,
  count,
  countTitle,
  action,
}: {
  open: boolean;
  icon: React.ReactNode;
  label: string;
  count: string;
  countTitle: string;
  action: React.ReactNode;
}) {
  return (
    <div className={cn(META_TRIGGER_FLAT, "w-full font-semibold")}>
      <CollapsibleTrigger asChild>
        <button type="button" className={META_ACCORDION_TRIGGER_BTN}>
          {icon}
          <span className="min-w-0 flex-1 truncate text-left">{label}</span>
          <ChevronDown
            className={cn("h-4 w-4 shrink-0 transition-transform", open && "rotate-180")}
            aria-hidden
          />
        </button>
      </CollapsibleTrigger>
      <div className={cn(META_FIELD_END_RAIL, "shrink-0")}>
        <span
          className={cn(
            META_FIELD_COUNT,
            META_FIELD_END_RAIL_CELL,
            "min-w-[1.75rem] tabular-nums font-semibold",
          )}
          title={countTitle}
        >
          {count}
        </span>
        {action}
      </div>
    </div>
  );
}

export interface MetaOptimizerPageRowDetailsProps {
  row: OverviewRow;
  rowIndex: number;
  site: WordPressSite;
  sitemapSource: OverviewSitemapSource;
  opt: WordPressOptimizationContextValue;
  bindings: Record<string, OverviewBinding>;
  bulkAiFaqSeedCount: number;
  metaOptimizerPipelineBusy: boolean;
  expandedResearchBriefUrl: string | null;
  setExpandedResearchBriefUrl: (url: string | null) => void;
  expandedContentUrl: string | null;
  setExpandedContentUrl: (url: string | null) => void;
  updateRow: (index: number, patch: Partial<OverviewRow>) => void;
  handleAiUrlRow: (index: number) => void | Promise<void>;
  handleScrapeRow: (index: number) => void | Promise<void>;
  handleUpdateWordPressForRow: (
    row: OverviewRow,
    opts: { rowIndex: number },
  ) => void | Promise<void>;
  handleDataForSeoResearch: (index: number) => void | Promise<void>;
  handleOptimizeAllSerpRow: (index: number) => void | Promise<void>;
  handleAiAllMetaRow: (index: number) => void | Promise<void>;
  handleAiTitleRow: (index: number) => void | Promise<void>;
  handleAiMetaRow: (index: number) => void | Promise<void>;
  handleAiKeywordRow: (index: number) => void | Promise<void>;
  handleSetDateToday: (index: number) => void;
  commitRowDateModifier: (index: number) => void;
  handleAiFaqRowAll: (index: number) => void | Promise<void>;
  handleAiFaqQuestion: (index: number, faqIndex: number) => void | Promise<void>;
  handleAiFaqAnswer: (index: number, faqIndex: number) => void | Promise<void>;
  handleAiHeadersRow: (index: number) => void | Promise<void>;
  handleAiLinksRow: (index: number) => void | Promise<void>;
  handleAiWikipediaLinkRow: (index: number) => void | Promise<void>;
  handleAiAnswerRow: (index: number) => void | Promise<void>;
  handleAiOverviewRow: (index: number) => void | Promise<void>;
  handleAiScenarioRow: (index: number) => void | Promise<void>;
  handleAiInContentImageRow: (index: number) => void | Promise<void>;
  handleAiElementorSectionRow?: (index: number, sectionId: string) => void | Promise<void>;
  handleAiElementorSectionHeaderRow?: (index: number, sectionId: string) => void | Promise<void>;
  handleAiElementorSectionContentRow?: (index: number, sectionId: string) => void | Promise<void>;
  handleAiElementorSectionLinkRow?: (index: number, sectionId: string, linkIndex: number) => void | Promise<void>;
  handleAiElementorFullPageRow?: (index: number) => void | Promise<void>;
  /** Shell-only tile: empty fields, actions disabled (no URLs loaded yet). */
  placeholder?: boolean;
  /** Nested inside compact accordion shell: skip outer row border/background. */
  accordionBody?: boolean;
  isSelected?: boolean;
  onToggleSelect?: (shiftKey?: boolean) => void;
  /** Collapse expanded accordion row (chevron shown in URL/actions bar). */
  onCollapse?: () => void;
}

export const MetaOptimizerPageRowDetails: React.FC<MetaOptimizerPageRowDetailsProps> = ({
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
  handleAiElementorSectionRow,
  handleAiElementorSectionHeaderRow,
  handleAiElementorSectionContentRow,
  handleAiElementorSectionLinkRow,
  handleAiElementorFullPageRow,
  placeholder = false,
  accordionBody = false,
  isSelected = false,
  onToggleSelect,
  onCollapse,
}) => {
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

  return (
    <div
      className={cn(
        "min-w-0 w-full",
        accordionBody ? "space-y-2 px-0 pb-0 pt-0" : "space-y-3",
        !accordionBody && CONTENT_OPTIMIZER_ROW_SHELL_CLASS,
      )}
    >
      <div className={zoneTop} role="region" aria-label="Page URL, focus keyword, and research">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
          <div className="min-w-0 flex-1 space-y-1">
            <div
              className={cn(
                "flex min-w-0 items-center gap-1",
                accordionBody && onCollapse && "cursor-pointer",
              )}
              onClick={(e) => {
                if (!accordionBody || !onCollapse) return;
                if ((e.target as HTMLElement).closest("a, button, [role='checkbox']")) return;
                onCollapse();
              }}
              onKeyDown={(e) => {
                if (!accordionBody || !onCollapse) return;
                if ((e.target as HTMLElement).closest("[role='checkbox']")) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onCollapse();
                }
              }}
              role={accordionBody && onCollapse ? "button" : undefined}
              tabIndex={accordionBody && onCollapse ? 0 : undefined}
              aria-label={accordionBody && onCollapse ? "Collapse row" : undefined}
            >
              {onToggleSelect && !shellOnly ? (
                <Checkbox
                  checked={isSelected}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleSelect(e.shiftKey);
                  }}
                  aria-label="Select row"
                  className={DASHBOARD_LIST_CHECKBOX_CLASS}
                />
              ) : null}
              {keywordUrlAlreadyOptimized && !shellOnly ? (
                <span className="shrink-0" title="URL matches keyword" aria-label="URL matches keyword">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400/90" aria-hidden />
                </span>
              ) : null}
              {shellOnly ? (
                <Input
                  readOnly
                  value=""
                  tabIndex={-1}
                  className={cn(
                    "h-8 min-w-0 flex-1 border-0 bg-transparent py-1 pl-0 text-base shadow-none",
                    META_INPUT_SURFACE,
                  )}
                  placeholder="Page URL"
                  aria-label="Page URL"
                />
              ) : (
                <span className="min-w-0 flex-1 overflow-hidden">
                  <a
                    href={row.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-block max-w-full truncate text-base leading-tight text-zinc-100 hover:text-cyan-300 hover:underline"
                    title={row.url}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {overviewRowUrlPathLabel(row.url, { source: sitemapSource })}
                  </a>
                </span>
              )}
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn("h-7 w-7 shrink-0 sm:h-8 sm:w-8", META_OPT_OUTLINE)}
                disabled={shellOnly}
                onClick={() => void handleAiUrlRow(index)}
                title={
                  keywordUrlAlreadyOptimized
                    ? "Last URL segment matches focus keyword slug - click to clear suggested path"
                    : "Suggested path from focus keyword"
                }
              >
                {row.status === "ai-url" ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Wand2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            {row.aiSuggestedPath ? (
              <div className="space-y-0.5 text-base text-zinc-400">
                <p>
                  <span className="text-cyan-400/90">{row.aiSuggestedPath}</span>
                </p>
                {suggestedFullUrl ? <p className="break-all text-base text-zinc-500">{suggestedFullUrl}</p> : null}
              </div>
            ) : null}
          </div>
          <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className={cn("h-7 w-7 sm:h-8 sm:w-8", META_OPT_OUTLINE)}
              disabled={shellOnly}
              onClick={() => {
                if (shellOnly) return;
                navigator.clipboard.writeText(row.url);
                notify.success(NOTIFY_URL_COPIED_TO_CLIPBOARD);
              }}
              title="Copy URL"
            >
              <Copy className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("h-7 min-w-[4.5rem] px-2 text-base sm:h-8 sm:min-w-[5rem] sm:px-2.5", META_OPT_OUTLINE)}
              disabled={shellOnly || row.status === "uploading"}
              onClick={() => void handleScrapeRow(index)}
            >
              {row.status === "scraping" ? (
                <Loader2 className="mr-1 h-3 w-3 shrink-0 animate-spin sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
              ) : (
                <RefreshCw className="mr-1 h-3 w-3 shrink-0 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
              )}
              Scrape
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("h-7 min-w-[4.5rem] px-2 text-base sm:h-8 sm:min-w-[5rem] sm:px-2.5", META_OPT_OUTLINE)}
              disabled={shellOnly || !redirectRow}
              title="Download Rank Math redirect CSV for this URL change"
              onClick={() => {
                if (!redirectRow) return;
                downloadOverviewRedirectCsv([redirectRow], overviewRedirectCsvFilename(row));
              }}
            >
              <FileDown className="mr-1 h-3 w-3 shrink-0 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
              Redirect
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className={cn("h-7 min-w-[4.5rem] px-2 text-base sm:h-8 sm:min-w-[5rem] sm:px-2.5", META_OPT_OUTLINE)}
              disabled={shellOnly || !site || row.status === "uploading"}
              onClick={() => void handleUpdateWordPressForRow(row, { rowIndex: index })}
            >
              {row.status === "uploading" ? (
                <Loader2 className="mr-1 h-3 w-3 shrink-0 animate-spin sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
              ) : (
                <UploadIcon className="mr-1 h-3 w-3 shrink-0 sm:mr-1.5 sm:h-3.5 sm:w-3.5" />
              )}
              Update WP
            </Button>
            {accordionBody && onCollapse ? (
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={cn("h-7 w-7 sm:h-8 sm:w-8", META_OPT_OUTLINE)}
                onClick={() => onCollapse()}
                title="Collapse row"
                aria-label="Collapse row"
              >
                <ChevronUp className="h-4 w-4 text-zinc-300" />
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex w-full min-w-0 items-center gap-1.5 pt-2">
          <label htmlFor={`meta-focus-kw-${index}`} className="sr-only">
            Focus keyword
          </label>
          <div className="relative min-w-0 flex-1">
            <Input
              id={`meta-focus-kw-${index}`}
              value={row.focusKeyword || ""}
              onChange={(e) => updateRow(index, { focusKeyword: e.target.value })}
              onBlur={(e) => {
                const kw = normalizeFocusKeywordPhrase(e.target.value);
                if (!kw) return;
                const patched = patchRowForNewFocusKeyword(row, kw);
                const patch: Partial<OverviewRow> = {};
                if (patched.focusKeyword !== row.focusKeyword) {
                  patch.focusKeyword = patched.focusKeyword;
                }
                if (!titleReadOnly) {
                  if (patched.title !== row.title) patch.title = patched.title;
                  if (patched.aiTitle !== row.aiTitle) patch.aiTitle = patched.aiTitle;
                }
                if (patched.metaDescription !== row.metaDescription) {
                  patch.metaDescription = patched.metaDescription;
                }
                if (patched.aiMeta !== row.aiMeta) patch.aiMeta = patched.aiMeta;
                if (Object.keys(patch).length > 0) updateRow(index, patch);
              }}
              className={cn(
                "h-8 min-w-0 w-full py-2 pl-3 pr-10 text-left text-base",
                META_INPUT_SURFACE,
              )}
              placeholder="Focus keyword (auto-filled by Research)"
              readOnly={shellOnly}
            />
            {!shellOnly ? (
              <MetaFieldEndRail align="center">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={META_FIELD_END_RAIL_BTN}
                  title="AI focus keyword"
                  onClick={() => void handleAiKeywordRow(index)}
                >
                  {row.status === "ai-focus-kw" ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
                  ) : (
                    <Wand2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  )}
                </Button>
              </MetaFieldEndRail>
            ) : null}
          </div>
        </div>

        <div className={zoneSerp} role="region" aria-label="SERP">
          <div className="flex w-full min-w-0">
            <div className="relative min-w-0 flex-1">
              <Input
                id={`meta-opt-title-${index}`}
                value={overviewTitlePrimarySegment(row.title)}
                readOnly={shellOnly || titleReadOnly}
                onChange={(e) => {
                  if (titleReadOnly) return;
                  updateRow(index, { title: overviewTitlePrimarySegment(e.target.value) });
                }}
                className={cn(
                  "h-9 min-w-0 w-full py-2 pl-3 text-left text-base sm:pr-24",
                  titleReadOnly ? "pr-3 text-muted-foreground" : "pr-[5.75rem] text-base",
                  META_INPUT_SURFACE,
                )}
                placeholder="Page title"
                aria-label={titleReadOnly ? "Page title (read-only)" : "Page title"}
              />
              <MetaFieldEndRail align="center">
                <span
                  className={cn(
                    META_FIELD_COUNT,
                    META_FIELD_END_RAIL_CELL,
                    "min-w-[2.25rem] tabular-nums",
                    titleReadOnly && "text-muted-foreground",
                  )}
                  title="Characters"
                  aria-hidden
                >
                  {overviewTitlePrimarySegment(row.title).length}
                </span>
                {!titleReadOnly && !shellOnly ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={META_FIELD_END_RAIL_BTN}
                    title="AI title"
                    onClick={() => void handleAiTitleRow(index)}
                  >
                    {row.status === "ai-title" ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
                    ) : (
                      <Wand2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    )}
                  </Button>
                ) : null}
              </MetaFieldEndRail>
            </div>
          </div>

          <div className="flex w-full min-w-0">
            <div className="relative min-w-0 flex-1">
              <Textarea
                id={`meta-opt-meta-${index}`}
                value={row.metaDescription ?? ""}
                onChange={(e) => updateRow(index, { metaDescription: e.target.value })}
                rows={3}
                className={cn(
                  "min-h-[4.25rem] min-w-0 w-full resize-none py-2 pl-3 pr-[5.75rem] text-left text-base leading-snug sm:pr-24",
                  META_INPUT_SURFACE,
                )}
                placeholder="Meta description"
                aria-label="Meta description"
                readOnly={shellOnly}
              />
              <MetaFieldEndRail align="top">
                <span
                  className={cn(META_FIELD_COUNT, META_FIELD_END_RAIL_CELL, "min-w-[2.25rem] tabular-nums")}
                  title="Characters"
                  aria-hidden
                >
                  {(row.metaDescription ?? "").length}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={META_FIELD_END_RAIL_BTN}
                  title="AI meta description"
                  disabled={shellOnly}
                  onClick={() => void handleAiMetaRow(index)}
                >
                  {row.status === "ai-meta" ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
                  ) : (
                    <Wand2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  )}
                </Button>
              </MetaFieldEndRail>
            </div>
          </div>

          <div className="flex w-full min-w-0">
            <div className="relative min-w-0 flex-1">
              <Input
                value={row.dateModifier || ""}
                onChange={(e) => updateRow(index, { dateModifier: e.target.value })}
                onBlur={() => commitRowDateModifier(index)}
                className={cn(
                  "h-8 min-w-0 w-full py-2 pl-3 pr-10 text-left text-base",
                  META_INPUT_SURFACE,
                )}
                placeholder="YYYY-MM-DD"
                aria-label="Date modifier"
                readOnly={shellOnly}
              />
              <MetaFieldEndRail align="center" className="right-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={cn(META_FIELD_END_RAIL_BTN, "[&_svg]:text-sky-400/90")}
                  disabled={shellOnly}
                  onClick={() => handleSetDateToday(index)}
                  title="Today"
                >
                  <RefreshCw className="h-3.5 w-3.5 shrink-0" />
                </Button>
              </MetaFieldEndRail>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <Button
            type="button"
            variant="outline"
            className={META_FAQ_TOOL_ACTION}
            disabled={shellOnly || metaOptimizerPipelineBusy}
            onClick={() => void handleDataForSeoResearch(index)}
            title="Research SERP + GSC"
          >
            {row.status === "research-faq" ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
            ) : (
              <Search className="h-4 w-4 shrink-0" />
            )}
            <span>Research</span>
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="h-8 shrink-0 px-3 text-base font-semibold"
            disabled={shellOnly || metaOptimizerPipelineBusy}
            title={
              titleReadOnly
                ? "Research if needed, then AI meta → FAQs (title unchanged on pages)"
                : "Research if needed, then AI title → meta → FAQs"
            }
            onClick={() => void handleOptimizeAllSerpRow(index)}
          >
            {metaOptimizerPipelineBusy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <Sparkles className="mr-1.5 h-3.5 w-3.5 shrink-0" />
            )}
            Optimize all (SERP)
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className={cn("h-8 shrink-0 px-3 text-base font-semibold", META_OPT_OUTLINE)}
            disabled={shellOnly || metaOptimizerPipelineBusy}
            title={
              titleReadOnly
                ? "AI meta and FAQs only (page title unchanged)"
                : "AI title, meta, FAQs (no AI URL)"
            }
            onClick={() => void handleAiAllMetaRow(index)}
          >
            {metaOptimizerPipelineBusy ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <Wand2 className="mr-1.5 h-3.5 w-3.5 shrink-0" />
            )}
            AI All Meta
          </Button>
        </div>

        <MetaAccordionStripeRow stripeIndex={0}>
        <Collapsible
          open={expandedResearchBriefUrl === row.url}
          onOpenChange={(open) => setExpandedResearchBriefUrl(open ? row.url : null)}
        >
          <CollapsibleTrigger asChild>
            <button type="button" className={META_TRIGGER_FLAT}>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform",
                  expandedResearchBriefUrl === row.url && "rotate-180",
                )}
              />
              <span className="min-w-0 flex-1 truncate text-left text-white">Brief JSON</span>
              <div className={cn(META_FIELD_END_RAIL, "pointer-events-none shrink-0")} aria-hidden>
                <span
                  className={cn(META_FIELD_COUNT, META_FIELD_END_RAIL_CELL, "min-w-[2.25rem] tabular-nums font-semibold")}
                  title="Characters in brief JSON"
                >
                  {briefJsonCharCount.toLocaleString()}
                </span>
              </div>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-1.5">
            <div className="relative min-w-0">
              <Textarea
                value={row.seoResearch || ""}
                onChange={(e) => updateRow(index, { seoResearch: e.target.value })}
                className={cn(
                  "min-h-[160px] w-full resize-y py-2 pl-3 pr-[5.25rem] text-base leading-snug sm:pr-28",
                  META_INPUT_SURFACE,
                )}
                placeholder='{"version": 1, …}'
                aria-label="SEO research brief JSON"
              />
              <MetaFieldEndRail align="top" className="right-0.5 top-2">
                <span
                  className={cn(META_FIELD_COUNT, META_FIELD_END_RAIL_CELL, "min-w-[2.5rem] tabular-nums font-semibold")}
                  title="Characters in brief JSON"
                  aria-hidden
                >
                  {briefJsonCharCount.toLocaleString()}
                </span>
              </MetaFieldEndRail>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="flex flex-wrap items-center gap-2 pb-1.5">
          {row.briefFileName && BACKEND_API_BASE ? (
            <Button
              type="button"
              variant="outline"
              className={META_FAQ_TOOL_CHIP}
              title={`Download ${row.briefFileName}`}
              onClick={async () => {
                try {
                  const filename = row.briefFileName as string;
                  const res = await fetch(
                    `${BACKEND_API_BASE}/api/overview/seo-brief/${encodeURIComponent(filename)}`,
                  );
                  if (!res.ok) {
                    const text = await res.text();
                    notify.error(text || "Failed to download SEO brief.");
                    return;
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                } catch (err: unknown) {
                  notifyHeaderError("Brief download failed", err);
                }
              }}
            >
              Brief file
            </Button>
          ) : null}
          {row.researchFileName ? (
            <Button
              type="button"
              variant="outline"
              className={META_FAQ_TOOL_CHIP}
              title={`Download SERP JSON: ${row.researchFileName}`}
              onClick={async () => {
                try {
                  const filename = row.researchFileName as string;
                  const res = await fetch(
                    resolveMcpToolUrl(
                      `DataForSEO_serp_dump_download/${encodeURIComponent(filename)}`,
                    ),
                  );
                  if (!res.ok) {
                    const text = await res.text();
                    notify.error(text || "Failed to download SERP JSON.");
                    return;
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                } catch (err: unknown) {
                  notifyHeaderError("SERP JSON download failed", err);
                }
              }}
            >
              DFS
            </Button>
          ) : null}
          {row.gscQuickWinsCsvFilename && BACKEND_API_BASE ? (
            <Button
              type="button"
              variant="outline"
              className={META_FAQ_TOOL_CHIP}
              title={`Download GSC CSV: ${row.gscQuickWinsCsvFilename}`}
              onClick={async () => {
                try {
                  const filename = row.gscQuickWinsCsvFilename as string;
                  const res = await fetch(
                    `${BACKEND_API_BASE}/api/gsc/quick-wins-csv/${encodeURIComponent(filename)}`,
                  );
                  if (!res.ok) {
                    const text = await res.text();
                    notify.error(text || "Failed to download GSC CSV.");
                    return;
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                } catch (err: unknown) {
                  notifyHeaderError("GSC CSV download failed", err);
                }
              }}
            >
              GSC
            </Button>
          ) : null}
          {row.semrushJsonFilename && BACKEND_API_BASE ? (
            <Button
              type="button"
              variant="outline"
              className={META_FAQ_TOOL_CHIP}
              title={`Download Semrush JSON: ${row.semrushJsonFilename}`}
              onClick={async () => {
                try {
                  const filename = row.semrushJsonFilename as string;
                  const res = await fetch(
                    `${BACKEND_API_BASE}/api/semrush/overview-json/${encodeURIComponent(filename)}`,
                  );
                  if (!res.ok) {
                    const text = await res.text();
                    notify.error(text || "Failed to download Semrush JSON.");
                    return;
                  }
                  const blob = await res.blob();
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename;
                  document.body.appendChild(a);
                  a.click();
                  a.remove();
                  URL.revokeObjectURL(url);
                } catch (err: unknown) {
                  notifyHeaderError("Semrush JSON download failed", err);
                }
              }}
            >
              SEMRUSH
            </Button>
          ) : null}
        </div>
        </MetaAccordionStripeRow>
      </div>

      <div
        className={zoneMetaAccordionStack}
        role="region"
        aria-label="Headers, FAQs and content optimization"
      >
        <MetaAccordionStripeRow stripeIndex={1}>
        <Collapsible open={headersOpen} onOpenChange={setHeadersOpen}>
          <MetaAccordionHeaderRow
            open={headersOpen}
            icon={<Heading2 className="h-4 w-4 shrink-0" aria-hidden />}
            label={isElementorRow ? "Sections" : "Headers"}
            count={headerList.length.toLocaleString()}
            countTitle={
              isElementorRow
                ? `Elementor sections · ${elementorLinkCount.toLocaleString()} internal links`
                : "H2 count"
            }
            action={
              isElementorRow ? (
                <div className="flex shrink-0 items-center">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={META_FIELD_END_RAIL_BTN}
                    disabled={shellOnly}
                    title="AI Links (internal href optimization)"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleAiLinksRow(index);
                    }}
                  >
                    {row.status === "ai-links" ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
                    ) : (
                      <Link2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    )}
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className={META_FIELD_END_RAIL_BTN}
                    disabled={shellOnly}
                    title="AI Headers (all section titles)"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      void handleAiHeadersRow(index);
                    }}
                  >
                    {row.status === "ai-headers" ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
                    ) : (
                      <Wand2 className="h-4 w-4 shrink-0 text-emerald-400" />
                    )}
                  </Button>
                </div>
              ) : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className={META_FIELD_END_RAIL_BTN}
                  disabled={shellOnly}
                  title="AI Headers (all H2s on this post)"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    void handleAiHeadersRow(index);
                  }}
                >
                  {row.status === "ai-headers" ? (
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
                  ) : (
                    <Wand2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  )}
                </Button>
              )
            }
          />
          <CollapsibleContent className="space-y-3 pt-3">
            {isElementorRow && handleAiElementorFullPageRow && elementorHeaders.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                className="h-8 w-full justify-start gap-2 rounded-none border-0 bg-zinc-900 px-3 text-base text-left hover:bg-zinc-800 disabled:opacity-45"
                disabled={shellOnly || !elementorFullPageReady || row.status === "scraping"}
                title={
                  elementorFullPageReady
                    ? "Rewrite all section copy in place from the research brief"
                    : "Run Research on this row first"
                }
                onClick={() => void handleAiElementorFullPageRow(index)}
              >
                {row.status === "scraping" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-400" />
                ) : (
                  <Sparkles className="h-4 w-4 shrink-0 text-sky-400" />
                )}
                Full page optimize
              </Button>
            ) : null}
            {isElementorRow && elementorRunError ? (
              <p className="text-base text-red-400">{elementorRunError}</p>
            ) : null}
            {headerList.length > 0 ? (
              isElementorRow ? (
                <div className="space-y-3 text-base">
                  {elementorHeaders.map((section, i) => {
                    const visualOnly = isVisualElementorSection(section);
                    return (
                    <div key={section.id || `elementor-section-${i}`} className="min-w-0 space-y-2">
                      <div className="flex min-w-0 items-start gap-2">
                        <span className="w-6 shrink-0 pt-1.5 tabular-nums text-muted-foreground">
                          {i + 1}
                        </span>
                        <div className="min-w-0 flex-1 space-y-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <div className="relative min-w-0 flex-1">
                              {visualOnly ? (
                                <div
                                  className={cn(
                                    "flex h-8 min-w-0 items-center px-3 text-left text-base font-medium text-muted-foreground",
                                    META_INPUT_SURFACE,
                                  )}
                                >
                                  {section.title || "Layout or image band"}
                                </div>
                              ) : (
                                <Input
                                  value={section.title}
                                  readOnly={shellOnly}
                                  placeholder="Section heading"
                                  className={cn(
                                    "h-8 min-w-0 w-full pr-[2.75rem] text-base font-medium",
                                    META_INPUT_SURFACE,
                                  )}
                                  aria-label={`Section ${i + 1} title`}
                                  onChange={(event) => {
                                    if (!section.id) return;
                                    if (!section.hasHeadingWidget && !section.headingInBodyHtml) return;
                                    commitElementorSectionField(section.id, {
                                      title: event.target.value,
                                    });
                                  }}
                                />
                              )}
                              {handleAiElementorSectionHeaderRow &&
                              section.id &&
                              !visualOnly &&
                              section.hasHeadingWidget ? (
                                <MetaFieldEndRail align="top">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className={META_FIELD_END_RAIL_BTN}
                                    disabled={shellOnly || row.status === "ai-headers"}
                                    title={`AI header: ${section.title || `Section ${i + 1}`}`}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      void handleAiElementorSectionHeaderRow(index, section.id);
                                    }}
                                  >
                                    {row.status === "ai-headers" ? (
                                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
                                    ) : (
                                      <Wand2 className="h-4 w-4 shrink-0 text-emerald-400" />
                                    )}
                                  </Button>
                                </MetaFieldEndRail>
                              ) : null}
                            </div>
                            {!visualOnly && section.id ? (
                              <Input
                                value={row.elementorSectionKeywords?.[section.id] ?? ""}
                                readOnly={shellOnly}
                                disabled={shellOnly}
                                placeholder="Section keyword"
                                className={cn(
                                  META_EDITABLE_LIST_INPUT,
                                  "h-8 min-w-0 w-[14rem] shrink-0",
                                )}
                                aria-label={`Section ${i + 1} keyword`}
                                onChange={(event) => {
                                  const patch = patchElementorSectionKeyword(
                                    row,
                                    section.id,
                                    event.target.value,
                                  );
                                  if (Object.keys(patch).length > 0) updateRow(index, patch);
                                }}
                              />
                            ) : null}
                          </div>
                          {!visualOnly ? (
                            <div className="relative min-w-0 flex-1">
                              <OverviewSectionProseEditor
                                value={section.bodyHtml?.trim() || ""}
                                readOnly={shellOnly}
                                placeholder="Section copy"
                                siteUrl={site?.siteUrl}
                                className="pr-[2.75rem]"
                                onChange={(nextHtml) => {
                                  if (!section.id) return;
                                  commitElementorSectionField(section.id, { bodyHtml: nextHtml });
                                }}
                              />
                              {handleAiElementorSectionContentRow && section.id ? (
                                <MetaFieldEndRail align="top">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon"
                                    className={META_FIELD_END_RAIL_BTN}
                                    disabled={shellOnly || row.status === "ai-headers"}
                                    title={`AI content: ${section.title?.trim() || `Section ${i + 1}`}`}
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      void handleAiElementorSectionContentRow(index, section.id);
                                    }}
                                  >
                                    {row.status === "ai-headers" ? (
                                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-sky-400" />
                                    ) : (
                                      <Wand2 className="h-4 w-4 shrink-0 text-sky-400" />
                                    )}
                                  </Button>
                                </MetaFieldEndRail>
                              ) : null}
                            </div>
                          ) : (
                            <p className="min-h-12 px-3 py-2 text-base text-muted-foreground">
                              Layout or image band
                            </p>
                          )}
                          {!visualOnly && section.id ? (
                            <ElementorSectionLinks
                              bodyHtml={section.bodyHtml?.trim() || section.bodyText?.trim() || ""}
                              readOnly={shellOnly}
                              onBodyChange={(nextHtml) => {
                                commitElementorSectionField(section.id, { bodyHtml: nextHtml });
                              }}
                              onAiLinkRow={
                                handleAiElementorSectionLinkRow
                                  ? (linkIndex) =>
                                      handleAiElementorSectionLinkRow(index, section.id, linkIndex)
                                  : undefined
                              }
                            />
                          ) : null}
                        </div>
                      </div>
                    </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2 text-base">
                  {headerList.map((h2, i) => (
                    <div key={`header-${i}`} className="flex min-w-0 items-start gap-2">
                      <MetaEditableListTextarea
                        index={i}
                        value={h2}
                        readOnly={shellOnly}
                        ariaLabel={`Header ${i + 1}`}
                        onChange={(nextText) => {
                          const base = row.blogH2List?.length ? [...row.blogH2List] : [...headerList];
                          base[i] = nextText;
                          updateRow(index, { blogH2List: base });
                        }}
                      />
                    </div>
                  ))}
                </div>
              )
            ) : !isElementorRow ? (
              <p className="text-base text-muted-foreground">
                No H2 headings in cached body HTML yet.
              </p>
            ) : (
              <p className="text-base text-muted-foreground">
                No sections in cached body HTML yet.
              </p>
            )}
            {isElementorRow && row.elementorDesignBreakdown?.trim() ? (
              <Collapsible open={headersPlanOpen} onOpenChange={setHeadersPlanOpen}>
                <CollapsibleTrigger asChild>
                  <button type="button" className={cn(META_TRIGGER_FLAT, "text-base")}>
                    <span className="flex-1 text-left">Design breakdown</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        headersPlanOpen && "rotate-180",
                      )}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-none bg-zinc-900/60 p-2 text-base text-zinc-300">
                    {row.elementorDesignBreakdown}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
            {row.blogH2PlanJson?.trim() ? (
              <Collapsible open={headersPlanOpen} onOpenChange={setHeadersPlanOpen}>
                <CollapsibleTrigger asChild>
                  <button type="button" className={cn(META_TRIGGER_FLAT, "text-base")}>
                    <span className="flex-1 text-left">Plan JSON</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        headersPlanOpen && "rotate-180",
                      )}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-none bg-zinc-900/60 p-2 text-base text-zinc-300">
                    {row.blogH2PlanJson}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
        </MetaAccordionStripeRow>

        {!isElementorRow ? (
        <MetaAccordionStripeRow stripeIndex={2}>
        <Collapsible open={linksOpen} onOpenChange={setLinksOpen}>
          <MetaAccordionHeaderRow
            open={linksOpen}
            icon={<Link2 className="h-4 w-4 shrink-0" aria-hidden />}
            label="Links"
            count={linkList.length.toLocaleString()}
            countTitle="Internal link count"
            action={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={META_FIELD_END_RAIL_BTN}
                disabled={shellOnly}
                title="AI Links (internal href optimization)"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleAiLinksRow(index);
                }}
              >
                {row.status === "ai-links" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
                ) : (
                  <Wand2 className="h-4 w-4 shrink-0 text-emerald-400" />
                )}
              </Button>
            }
          />
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center justify-end gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={META_FAQ_TOOL_ICON}
                disabled={shellOnly}
                onClick={() => {
                  updateRow(index, {
                    blogLinkList: [...(row.blogLinkList ?? linkList), { anchor: "", href: "" }],
                  });
                }}
                title="Add link"
              >
                <span className="text-base font-medium leading-none">+</span>
              </Button>
            </div>
            {linkList.length > 0 ? (
              <div className="space-y-1.5 text-base">
                {linkList.map((link, i) => (
                  <MetaEditableLinkRow
                    key={`link-${i}`}
                    linkLabel={`Link ${i + 1}`}
                    anchor={link.anchor}
                    href={link.href}
                    readOnly={shellOnly}
                    onAnchorChange={(nextAnchor) => {
                      const base = row.blogLinkList?.length ? [...row.blogLinkList] : [...linkList];
                      base[i] = { ...base[i], anchor: nextAnchor };
                      updateRow(index, { blogLinkList: base });
                    }}
                    onHrefChange={(nextHref) => {
                      const base = row.blogLinkList?.length ? [...row.blogLinkList] : [...linkList];
                      base[i] = { ...base[i], href: nextHref };
                      updateRow(index, { blogLinkList: base });
                    }}
                  />
                ))}
              </div>
            ) : (
              <p className="text-base text-muted-foreground">No links yet. Add a row or scrape body HTML.</p>
            )}
            {row.blogLinksPlanJson?.trim() ? (
              <Collapsible open={linksPlanOpen} onOpenChange={setLinksPlanOpen}>
                <CollapsibleTrigger asChild>
                  <button type="button" className={cn(META_TRIGGER_FLAT, "text-base")}>
                    <span className="flex-1 text-left">Plan JSON</span>
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 transition-transform",
                        linksPlanOpen && "rotate-180",
                      )}
                    />
                  </button>
                </CollapsibleTrigger>
                <CollapsibleContent className="pt-2">
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all rounded-none bg-zinc-900/60 p-2 text-base text-zinc-300">
                    {row.blogLinksPlanJson}
                  </pre>
                </CollapsibleContent>
              </Collapsible>
            ) : null}
          </CollapsibleContent>
        </Collapsible>
        </MetaAccordionStripeRow>
        ) : null}

        <MetaAccordionStripeRow stripeIndex={3}>
        <Collapsible open={wikiLinksOpen} onOpenChange={setWikiLinksOpen}>
          <MetaAccordionHeaderRow
            open={wikiLinksOpen}
            icon={<MapPin className="h-4 w-4 shrink-0" aria-hidden />}
            label="Wikipedia link"
            count={wikiLinkCount > 0 ? "1" : "0"}
            countTitle="Wikipedia link in body"
            action={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={META_FIELD_END_RAIL_BTN}
                disabled={shellOnly}
                title="Find entity and insert Wikipedia link"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleAiWikipediaLinkRow(index);
                }}
              >
                {row.status === "ai-wikipedia-link" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
                ) : (
                  <MapPin className="h-4 w-4 shrink-0 text-emerald-400" />
                )}
              </Button>
            }
          />
          <CollapsibleContent className="space-y-3 pt-3">
            {wikiLinkCount > 0 ? (
              <div className="space-y-3 text-base">
                {wikiLinksInBody.length > 0
                  ? wikiLinksInBody.map((link, i) => (
                      <div key={`wiki-body-${i}`} className="space-y-1.5 rounded-none bg-zinc-900/60 p-3">
                        <p className="leading-relaxed text-zinc-200">
                          {link.contextBefore ? (
                            <span className="text-muted-foreground">…{link.contextBefore} </span>
                          ) : null}
                          <a
                            href={link.href.replace(/&amp;/g, "&")}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-emerald-400 underline underline-offset-2"
                          >
                            {link.anchor}
                          </a>
                          {link.contextAfter ? (
                            <span className="text-muted-foreground"> {link.contextAfter}…</span>
                          ) : null}
                        </p>
                        <a
                          href={link.href.replace(/&amp;/g, "&")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block break-all text-emerald-400 underline underline-offset-2"
                        >
                          {wikipediaTitleFromHref(link.href)}
                        </a>
                      </div>
                    ))
                  : wikiLinkList.map((link, i) => (
                      <div key={`wiki-staged-${i}`} className="space-y-1.5 rounded-none bg-zinc-900/60 p-3">
                        <p className="text-zinc-200">
                          Staged anchor:{" "}
                          <span className="font-medium text-foreground">{link.anchor || "Wikipedia"}</span>
                        </p>
                        <a
                          href={link.href.replace(/&amp;/g, "&")}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block break-all text-emerald-400 underline underline-offset-2"
                        >
                          {wikipediaTitleFromHref(link.href)}
                        </a>
                      </div>
                    ))}
              </div>
            ) : (
              <p className="text-base text-muted-foreground">
                No Wikipedia link in body yet.
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
        </MetaAccordionStripeRow>

        <MetaAccordionStripeRow stripeIndex={4}>
        <Collapsible open={answerOpen} onOpenChange={setAnswerOpen}>
          <MetaAccordionHeaderRow
            open={answerOpen}
            icon={<ListTree className="h-4 w-4 shrink-0" aria-hidden />}
            label="Answer"
            count={answerReady ? "1" : "0"}
            countTitle="Answer staged"
            action={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={META_FIELD_END_RAIL_BTN}
                disabled={shellOnly}
                title="AI Answer (prepend to post body)"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleAiAnswerRow(index);
                }}
              >
                {row.status === "ai-answer" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
                ) : (
                  <Wand2 className="h-4 w-4 shrink-0 text-emerald-400" />
                )}
              </Button>
            }
          />
          <CollapsibleContent className="space-y-3 pt-3">
            {answerSectionHtml ? (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-none bg-zinc-900/60 p-3 text-base text-zinc-200">
                {answerSectionHtml}
              </pre>
            ) : (
              <p className="text-base text-muted-foreground">
                No Answer staged yet. Run the wand to prepend an Answer block.
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
        </MetaAccordionStripeRow>

        <MetaAccordionStripeRow stripeIndex={5}>
        <Collapsible open={overviewOpen} onOpenChange={setOverviewOpen}>
          <MetaAccordionHeaderRow
            open={overviewOpen}
            icon={<ListTree className="h-4 w-4 shrink-0" aria-hidden />}
            label="Overview"
            count={overviewReady ? "1" : "0"}
            countTitle="Overview staged"
            action={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={META_FIELD_END_RAIL_BTN}
                disabled={shellOnly}
                title="AI Overview (prepend to post body)"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleAiOverviewRow(index);
                }}
              >
                {row.status === "ai-overview" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
                ) : (
                  <Wand2 className="h-4 w-4 shrink-0 text-emerald-400" />
                )}
              </Button>
            }
          />
          <CollapsibleContent className="space-y-3 pt-3">
            {overviewSectionHtml ? (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-none bg-zinc-900/60 p-3 text-base text-zinc-200">
                {overviewSectionHtml}
              </pre>
            ) : (
              <p className="text-base text-muted-foreground">
                No Overview staged yet. Run the wand to prepend an Overview block.
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
        </MetaAccordionStripeRow>

        <MetaAccordionStripeRow stripeIndex={6}>
        <Collapsible open={scenarioOpen} onOpenChange={setScenarioOpen}>
          <MetaAccordionHeaderRow
            open={scenarioOpen}
            icon={<ListTree className="h-4 w-4 shrink-0" aria-hidden />}
            label="Scenario"
            count={scenarioReady ? "1" : "0"}
            countTitle="Illustrative scenario staged"
            action={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={META_FIELD_END_RAIL_BTN}
                disabled={shellOnly}
                title="AI Scenario (regenerate illustrative H2)"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleAiScenarioRow(index);
                }}
              >
                {row.status === "ai-scenario" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
                ) : (
                  <Wand2 className="h-4 w-4 shrink-0 text-emerald-400" />
                )}
              </Button>
            }
          />
          <CollapsibleContent className="space-y-3 pt-3">
            {scenarioSectionHtml ? (
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-none bg-zinc-900/60 p-3 text-base text-zinc-200">
                {scenarioSectionHtml}
              </pre>
            ) : (
              <p className="text-base text-muted-foreground">
                No illustrative section staged yet. Run the wand on a page with the local-example H2.
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
        </MetaAccordionStripeRow>

        <MetaAccordionStripeRow stripeIndex={7}>
        <Collapsible open={inContentImageOpen} onOpenChange={setInContentImageOpen}>
          <MetaAccordionHeaderRow
            open={inContentImageOpen}
            icon={<ImageIcon className="h-4 w-4 shrink-0" aria-hidden />}
            label="Images"
            count={inContentImageReady ? "1" : "0"}
            countTitle="In-content image staged"
            action={
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className={META_FIELD_END_RAIL_BTN}
                disabled={shellOnly}
                title="AI In Content Image"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  void handleAiInContentImageRow(index);
                }}
              >
                {row.status === "ai-in-content-image" ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-emerald-400" />
                ) : (
                  <Wand2 className="h-4 w-4 shrink-0 text-emerald-400" />
                )}
              </Button>
            }
          />
          <CollapsibleContent className="space-y-3 pt-3">
            {sitemapSource === "sap" ? (
              <div className="space-y-2">
                <Label
                  htmlFor={`in-content-image-kind-${index}`}
                  className="text-base font-medium"
                >
                  Image type
                </Label>
                <Select
                  value={row.blogInContentImageKind === "local" ? "local" : "photo"}
                  onValueChange={(value) => {
                    updateRow(index, {
                      blogInContentImageKind: value === "local" ? "local" : "photo",
                    });
                  }}
                  disabled={shellOnly}
                >
                  <SelectTrigger
                    id={`in-content-image-kind-${index}`}
                    className="h-9 w-full text-base font-medium"
                  >
                    <SelectValue placeholder="Photo" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="photo">Photo</SelectItem>
                    <SelectItem value="local">Local Image (generate)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : null}
            <div className="space-y-2">
              <Label htmlFor={`in-content-image-heading-${index}`} className="text-base font-medium">
                Heading
              </Label>
              <Select
                value={row.blogInContentImageTargetHeading?.trim() || "__auto__"}
                onValueChange={(value) => {
                  updateRow(index, {
                    blogInContentImageTargetHeading:
                      value === "__auto__" ? undefined : value,
                  });
                }}
                disabled={shellOnly || headerList.length === 0}
              >
                <SelectTrigger
                  id={`in-content-image-heading-${index}`}
                  className="h-9 w-full text-base font-medium"
                >
                  <SelectValue placeholder="Auto (best heading)" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__auto__">Auto (best heading)</SelectItem>
                  {headerList.map((heading, headingIndex) => (
                    <SelectItem key={`${headingIndex}:${heading}`} value={heading}>
                      {heading}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {headerList.length === 0 ? (
                <p className="text-base text-muted-foreground">
                  No H2 headings yet. Scrape or reload the sitemap to import body HTML.
                </p>
              ) : null}
            </div>
            {inContentImageReady ? (
              <div className="space-y-2">
                <img
                  src={row.blogInContentImageUrl}
                  alt={row.blogInContentImageAlt || "In content image"}
                  className="max-h-64 w-full object-contain bg-zinc-900/60"
                />
                {row.blogInContentImageSection?.trim() ? (
                  <p className="text-base text-zinc-200">
                    Section: {row.blogInContentImageSection}
                  </p>
                ) : null}
                {row.blogInContentImageAlt?.trim() ? (
                  <p className="text-base text-muted-foreground">
                    Alt: {row.blogInContentImageAlt}
                  </p>
                ) : null}
                {row.blogInContentImageReferenceSourceUrl?.trim() ? (
                  <p className="text-base">
                    <a
                      href={row.blogInContentImageReferenceSourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 underline underline-offset-2"
                    >
                      Original source
                    </a>
                  </p>
                ) : null}
                {row.blogInContentImageSharedFromPageUrl?.trim() ? (
                  <p className="text-base">
                    <a
                      href={row.blogInContentImageSharedFromPageUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 underline underline-offset-2"
                    >
                      Shared from{" "}
                      {row.blogInContentImageSharedFromSiteName?.trim() || "peer site"}
                    </a>
                  </p>
                ) : null}
              </div>
            ) : (
              <p className="text-base text-muted-foreground">
                {row.blogInContentImageKind === "local" && sitemapSource === "sap"
                  ? "Local Image generates a new place photo. Use AISEO → Find Local Image to reuse images from other sites."
                  : "Select a heading (or Auto), then run the wand."}
              </p>
            )}
          </CollapsibleContent>
        </Collapsible>
        </MetaAccordionStripeRow>

        <MetaAccordionStripeRow stripeIndex={8}>
        <Collapsible open={faqEditorOpen} onOpenChange={setFaqEditorOpen}>
          <CollapsibleTrigger asChild>
            <button type="button" className={cn(META_TRIGGER_FLAT, "w-full font-semibold")}>
              <CircleHelp className="h-4 w-4 shrink-0" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-left">FAQs</span>
              <div className={cn(META_FIELD_END_RAIL, "pointer-events-none shrink-0")} aria-hidden>
                <span
                  className={cn(META_FIELD_COUNT, META_FIELD_END_RAIL_CELL, "min-w-[1.75rem] tabular-nums font-semibold")}
                  title="FAQ pairs (parsed)"
                >
                  {faqPairCount.toLocaleString()}
                </span>
              </div>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform",
                  faqEditorOpen && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-3 pt-3">
            <div className="flex w-full min-w-0 shrink-0 flex-wrap items-center justify-end gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={META_FAQ_TOOL_ICON}
                onClick={() => {
                  const current = parseFaqEntries(row.faq);
                  const next = [...current, { question: "", answer: "" }];
                  updateRow(index, { faq: serializeFaqEntriesPlain(next) });
                }}
                title="Add FAQ"
              >
                <span className="text-base font-medium leading-none">+</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={META_FAQ_TOOL_ICON}
                onClick={() => {
                  const current = parseFaqEntries(row.faq);
                  if (!current.length) return;
                  const next = current.slice(0, current.length - 1);
                  updateRow(index, { faq: serializeFaqEntriesPlain(next) });
                }}
                title="Remove last FAQ"
              >
                <span className="text-base font-medium leading-none">−</span>
              </Button>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className={META_FAQ_TOOL_ICON}
                onClick={() => void handleAiFaqRowAll(index)}
                title="AI FAQs (4 pairs if empty)"
              >
                {row.status === "ai-faq" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
              </Button>
            </div>
            <div className="space-y-3">
              {faqEntries.map((entry, i) => (
                <div key={i} className={cn("space-y-2 text-base", META_FAQ_PAIR_TILE)}>
                  <div className="flex w-full min-w-0">
                    <div className="relative min-w-0 flex-1">
                      <Input
                        value={entry.question}
                        onChange={(e) => {
                          const current = parseFaqEntries(row.faq);
                          const next = [...(current.length ? current : [{ question: "", answer: "" }])];
                          if (!next[i]) next[i] = { question: "", answer: "" };
                          next[i] = { ...next[i], question: e.target.value };
                          updateRow(index, { faq: serializeFaqEntriesPlain(next) });
                        }}
                        className={cn(
                          "min-h-9 min-w-0 w-full py-2 pl-3 pr-[5.75rem] text-left text-base sm:pr-24",
                          META_INPUT_SURFACE,
                        )}
                        placeholder="Question"
                        aria-label={`FAQ question ${i + 1}`}
                      />
                      <MetaFieldEndRail align="center" className="right-0.5">
                        <span
                          className={cn(META_FIELD_COUNT, META_FIELD_END_RAIL_CELL, "min-w-[2rem] tabular-nums")}
                          title="Characters"
                          aria-hidden
                        >
                          {entry.question.length}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={META_FIELD_END_RAIL_BTN}
                          title="AI question"
                          onClick={() => void handleAiFaqQuestion(index, i)}
                        >
                          {row.status === "ai-faq" ? (
                            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-emerald-400" />
                          ) : (
                            <Wand2 className="h-3 w-3 shrink-0 text-emerald-400" />
                          )}
                        </Button>
                      </MetaFieldEndRail>
                    </div>
                  </div>
                  <div className="flex w-full min-w-0">
                    <div className="relative min-w-0 flex-1">
                      <Textarea
                        value={entry.answer}
                        onChange={(e) => {
                          const current = parseFaqEntries(row.faq);
                          const next = [...(current.length ? current : [{ question: "", answer: "" }])];
                          if (!next[i]) next[i] = { question: "", answer: "" };
                          next[i] = { ...next[i], answer: e.target.value };
                          updateRow(index, { faq: serializeFaqEntriesPlain(next) });
                        }}
                        rows={3}
                        className={cn(
                          "min-h-[4.875rem] min-w-0 w-full resize-none py-2 pl-3 pr-[5.75rem] text-left text-base leading-snug sm:pr-24",
                          META_INPUT_SURFACE,
                        )}
                        placeholder="Answer"
                        aria-label={`FAQ answer ${i + 1}`}
                      />
                      <MetaFieldEndRail align="top" className="right-0.5 top-2">
                        <span
                          className={cn(META_FIELD_COUNT, META_FIELD_END_RAIL_CELL, "min-w-[2rem] tabular-nums")}
                          title="Characters"
                          aria-hidden
                        >
                          {entry.answer.length}
                        </span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className={META_FIELD_END_RAIL_BTN}
                          title="AI answer"
                          onClick={() => void handleAiFaqAnswer(index, i)}
                        >
                          {row.status === "ai-faq" ? (
                            <Loader2 className="h-3 w-3 shrink-0 animate-spin text-emerald-400" />
                          ) : (
                            <Wand2 className="h-3 w-3 shrink-0 text-emerald-400" />
                          )}
                        </Button>
                      </MetaFieldEndRail>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleContent>
        </Collapsible>
        </MetaAccordionStripeRow>

        <MetaAccordionStripeRow stripeIndex={9}>
        <Collapsible
          open={expandedContentUrl === row.url}
          onOpenChange={(next) => setExpandedContentUrl(next ? row.url : null)}
        >
          <CollapsibleTrigger asChild>
            <button type="button" className={cn(META_TRIGGER_FLAT, "w-full font-semibold")}>
              <Sparkles className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1 text-left">Optimize content</span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 transition-transform",
                  expandedContentUrl === row.url && "rotate-180",
                )}
              />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-3">
            {opt.isOptimizingContent[site.id] ? (
              <p className="mb-3 text-base text-muted-foreground">Running — see Details in the header.</p>
            ) : null}
            <ContentOptimizationControls
              site={site}
              panelTitle={null}
              lockedPageUrl={row.url}
              presetResolvedPost={(() => {
                const binding = overviewBindingForRow(row, bindings);
                const sheetBody =
                  row.postContentOptimized?.trim() || row.postContent?.trim() || "";
                const endpoint =
                  subtypeToEndpoint(binding?.subtype) ||
                  (binding?.subtype === "service-area" ? "service-areas" : binding?.subtype) ||
                  undefined;
                return binding?.postId
                  ? {
                      id: binding.postId,
                      subtype: binding.subtype,
                      link: row.url,
                      endpoint,
                      title: row.title || row.aiTitle || undefined,
                      content: sheetBody || undefined,
                      excerpt: row.metaDescription || undefined,
                      focusKeyword: row.focusKeyword?.trim() || undefined,
                      seoResearch: row.seoResearch?.trim() || undefined,
                    }
                  : null;
              })()}
              url={row.url}
              updateMode={opt.optimizeUpdateMode[site.id] || "update"}
              isOptimizing={Boolean(opt.isOptimizingContent[site.id])}
              progress={opt.optimizationProgress[site.id]}
              fileManager={opt.optimizationFileManagers[site.id]}
              onUrlChange={() => {}}
              onUpdateModeChange={(mode) => opt.setOptimizeUpdateMode((p) => ({ ...p, [site.id]: mode }))}
              onOptimize={(postData) => {
                void (async () => {
                  const oldUrl = row.url;
                  updateRow(index, { dateModifier: overviewDateModifierTodayIso() });
                  await opt.handleOptimizeContentClick(
                    site,
                    row.url,
                    opt.optimizeUpdateMode[site.id] || "update",
                    postData ?? null,
                  );
                  const { consumeOverviewOptimizedUpload } = await import(
                    "@/lib/overview/overview-content-opt-html-store"
                  );
                  const payload = consumeOverviewOptimizedUpload(oldUrl);
                  const html = payload?.html;
                  const canon = payload?.link?.trim();
                  if (html?.trim()) {
                    const binding = overviewBindingForRow(row, bindings);
                    const patch: Partial<OverviewRow> = {
                      postContent: html,
                      postContentOptimized: html,
                      ...(binding?.postId
                        ? { postId: binding.postId, postType: binding.subtype }
                        : {}),
                    };
                    if (canon) {
                      patch.url = canon;
                    }
                    updateRow(index, patch);
                  }
                })();
              }}
              optimizationOptions={{
                ...(opt.optimizationOptions[site.id] || {
                  optimizeTitle: true,
                  optimizeMeta: true,
                  optimizeExcerpt: true,
                  optimizeContent: true,
                  optimizeFeaturedImage: false,
                  autoOptimize: true,
                  testMode: false,
                  stagingSite: false,
                  hasEntity: sitemapSource === "sap",
                }),
                optimizeTitle: !titleReadOnly,
                optimizeContent: true,
                optimizeFeaturedImage: false,
                optimizeExtraText: false,
                optimizeExtraImage: false,
                contentOnlyUpload: true,
                autoOptimize: true,
                hasEntity: sitemapSource === "sap",
                useAcfKeyword: false,
                manualKeyword: row.focusKeyword?.trim() || "",
              }}
              onOptimizationOptionsChange={(o) => opt.setOptimizationOptions((p) => ({ ...p, [site.id]: o }))}
              inContentImageType={opt.inContentImageTypes[site.id] || ""}
              inContentImagePrompt={opt.inContentImagePrompts[site.id] || ""}
              onInContentImageTypeChange={(t) => opt.setInContentImageTypes((p) => ({ ...p, [site.id]: t }))}
              onInContentImagePromptChange={(pr) => opt.setInContentImagePrompts((p) => ({ ...p, [site.id]: pr }))}
              cardClassName="mt-0 w-full border-0 bg-transparent shadow-none text-foreground [&_.text-muted-foreground]:text-muted-foreground"
            />
          </CollapsibleContent>
        </Collapsible>
        </MetaAccordionStripeRow>
      </div>
    </div>
  );
};
