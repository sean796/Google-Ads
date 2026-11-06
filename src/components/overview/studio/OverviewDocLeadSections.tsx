import {
  ChevronDown,
  Globe,
  Heading2,
  ImageIcon,
  Link2,
  ListTree,
  Plus,
  Wand2,
} from "lucide-react";
import {
  CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { cn } from "@/lib/utils";
import { Button } from "@/ui";
import type { OverviewDocSectionBlocksProps } from "./overview-doc-section-block-types";
import type { useOverviewDocSectionBlocks } from "./use-overview-doc-section-blocks";

type OverviewDocSectionState = ReturnType<typeof useOverviewDocSectionBlocks>;

export type OverviewDocSectionToolbarProps = Pick<
  OverviewDocSectionBlocksProps,
  | "row"
  | "rowIndex"
  | "onAiAnswer"
  | "onAiOverview"
  | "onAiHeaders"
  | "onAiLinks"
  | "onAiWikipediaLink"
  | "onAiScenario"
  | "onAiInContentImage"
  | "onAiFaqAll"
> &
  Pick<
    OverviewDocSectionState,
    | "isPagesSource"
    | "isSapSource"
    | "answerHtml"
    | "overviewHtml"
    | "scenarioHtml"
    | "faqEntries"
    | "extractedLinks"
    | "internalLinks"
    | "wikiLinks"
    | "linksExpanded"
    | "setLinksExpanded"
    | "anyBusy"
  >;

export function OverviewDocSectionToolbar({
  row,
  rowIndex,
  onAiAnswer,
  onAiOverview,
  onAiHeaders,
  onAiLinks,
  onAiWikipediaLink,
  onAiScenario,
  onAiInContentImage,
  onAiFaqAll,
  isPagesSource,
  isSapSource,
  answerHtml,
  overviewHtml,
  scenarioHtml,
  faqEntries,
  extractedLinks,
  internalLinks,
  wikiLinks,
  linksExpanded,
  setLinksExpanded,
  anyBusy,
}: OverviewDocSectionToolbarProps) {
  return (
    <>
      {/* Quiet Single-Line Pulse Engine Document Toolbar (Sitemap-Relative: Pages vs Posts vs SAP) */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {!isPagesSource && !answerHtml ? (
            <Button
              variant="quiet"
              type="button"
              disabled={anyBusy}
              onClick={() => void onAiAnswer(rowIndex)}
            >
              <Plus className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
              Answer
            </Button>
          ) : null}

          {!isPagesSource && !overviewHtml ? (
            <Button
              variant="quiet"
              type="button"
              disabled={anyBusy}
              onClick={() => void onAiOverview(rowIndex)}
            >
              <Plus className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
              Overview
            </Button>
          ) : null}

          {!isPagesSource && !scenarioHtml ? (
            <Button
              variant="quiet"
              type="button"
              disabled={anyBusy}
              onClick={() => void onAiScenario(rowIndex)}
            >
              <Plus className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
              Scenario
            </Button>
          ) : null}

          {faqEntries.length === 0 ? (
            <Button
              variant="quiet"
              type="button"
              disabled={anyBusy}
              onClick={() => void onAiFaqAll(rowIndex)}
            >
              <Plus className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
              FAQs
            </Button>
          ) : null}

          <Button
            variant="quiet"
            type="button"
            disabled={anyBusy}
            onClick={() => void onAiHeaders(rowIndex)}
            title={
              isPagesSource
                ? "Optimize Elementor section headings"
                : "Rewrite all H2 headings across the article"
            }
          >
            <Heading2 className="mr-1.5 h-3.5 w-3.5 text-primary" aria-hidden />
            {isPagesSource ? "Headers" : "Headings"}
          </Button>

          <Button
            variant="quiet"
            type="button"
            disabled={anyBusy}
            onClick={() => void onAiLinks(rowIndex)}
            title="Weave contextual internal links"
          >
            <Link2 className="mr-1.5 h-3.5 w-3.5 text-semantic-analysis-foreground" aria-hidden />
            Internal Links
          </Button>

          {!isPagesSource ? (
            <Button
              variant="quiet"
              type="button"
              disabled={anyBusy}
              onClick={() => void onAiWikipediaLink(rowIndex)}
              title="Insert Wikipedia entity citation"
            >
              <Globe className="mr-1.5 h-3.5 w-3.5 text-primary" aria-hidden />
              Wikipedia
            </Button>
          ) : null}

          {!isPagesSource ? (
            <Button
              variant="quiet"
              type="button"
              disabled={anyBusy}
              onClick={() => void onAiInContentImage(rowIndex)}
              title={
                isSapSource
                  ? "Generate local or in-content section image"
                  : "Generate in-content section image"
              }
            >
              <ImageIcon className="mr-1.5 h-3.5 w-3.5 text-semantic-analysis-foreground" aria-hidden />
              Section Image
            </Button>
          ) : null}
        </div>

        {/* Quiet Collapsible Links Summary Pill */}
        {extractedLinks.length > 0 ? (
          <Button
            variant="quiet"
            onClick={() => setLinksExpanded((prev) => !prev)}
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
          </Button>
        ) : null}
      </div>

      {/* Expandable Citation Drawer */}
      {linksExpanded && extractedLinks.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 bg-ui-field/60 p-3">
          {extractedLinks.map((lnk, idx) => (
            <a
              key={`${lnk.href}-${idx}`}
              href={lnk.href}
              target="_blank"
              rel="noreferrer"
              className="inline-flex max-w-[18rem] items-center gap-1.5 break-words bg-black px-2.5 py-1 text-base text-semantic-analysis-foreground hover:text-white"
              title={lnk.href}
            >
              <Link2 className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="break-words">{lnk.anchor || lnk.href}</span>
            </a>
          ))}
        </div>
      ) : null}

      {/* Staged In-Content Image Preview */}
      {row.blogInContentImageUrl?.trim() ? (
        <div className="flex items-center gap-3 bg-ui-field/60 p-3">
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
            <span className="break-words text-base text-muted-foreground">
              {row.blogInContentImageAlt || "Auto-generated SEO alt text"}
            </span>
          </div>
        </div>
      ) : null}
    </>
  );
}

export type OverviewDocAnswerSectionProps = Pick<
  OverviewDocSectionBlocksProps,
  "row" | "rowIndex" | "busy" | "onAiAnswer"
> &
  Pick<OverviewDocSectionState, "answerHtml" | "activeStepTitleKey" | "anyBusy">;

export function OverviewDocAnswerSection({
  row,
  rowIndex,
  busy,
  onAiAnswer,
  answerHtml,
  activeStepTitleKey,
  anyBusy,
}: OverviewDocAnswerSectionProps) {
  return (
    <>
      {/* 1. Direct Answer Section (Always stacked above Overview) */}
      {answerHtml ? (
        <section
          id="studio-sec-answer"
          className={cn(
            "group relative flex scroll-mt-6 flex-col gap-2 border-b border-white/10 pb-5",
            (row.status === "ai-answer" ||
              (busy && activeStepTitleKey === "answer")) &&
              "animate-meta-opt-breathe border-semantic-data/40 bg-ui-field/35 px-3 py-3",
          )}
          aria-label="Direct Answer Block"
        >
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "text-base font-semibold",
                row.status === "ai-answer" ||
                  (busy && activeStepTitleKey === "answer")
                  ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS
                  : "text-primary",
              )}
            >
              Answer
            </span>
            <Button
              variant="quiet"
              type="button"
              disabled={anyBusy}
              onClick={() => void onAiAnswer(rowIndex)}
            >
              <Wand2 className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
              Rewrite Answer
            </Button>
          </div>
          <div
            className="text-base leading-relaxed text-foreground [&_a]:text-semantic-analysis-foreground [&_a]:underline [&_h2]:hidden [&_p]:my-1"
            dangerouslySetInnerHTML={{ __html: answerHtml }}
          />
        </section>
      ) : null}
    </>
  );
}

export type OverviewDocOverviewSectionProps = Pick<
  OverviewDocSectionBlocksProps,
  "row" | "rowIndex" | "busy" | "onAiOverview"
> &
  Pick<OverviewDocSectionState, "overviewHtml" | "activeStepTitleKey" | "anyBusy">;

export function OverviewDocOverviewSection({
  row,
  rowIndex,
  busy,
  onAiOverview,
  overviewHtml,
  activeStepTitleKey,
  anyBusy,
}: OverviewDocOverviewSectionProps) {
  return (
    <>
      {/* 2. Overview & Jump Citations Section (Stacked below Answer) */}
      {overviewHtml ? (
        <section
          id="studio-sec-overview"
          className={cn(
            "group relative flex scroll-mt-6 flex-col gap-2 border-b border-white/10 pb-5",
            (row.status === "ai-overview" ||
              (busy && activeStepTitleKey === "overview")) &&
              "animate-meta-opt-breathe border-semantic-data/40 bg-ui-field/35 px-3 py-3",
          )}
          aria-label="Overview and Citations Block"
        >
          <div className="flex items-center justify-between">
            <span
              className={cn(
                "flex items-center gap-1.5 text-base font-semibold",
                row.status === "ai-overview" ||
                  (busy && activeStepTitleKey === "overview")
                  ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS
                  : "text-primary",
              )}
            >
              <ListTree className="h-4 w-4 text-semantic-analysis-foreground" aria-hidden />
              Overview
            </span>
            <Button
              variant="quiet"
              type="button"
              disabled={anyBusy}
              onClick={() => void onAiOverview(rowIndex)}
            >
              <Wand2 className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
              Rewrite Overview
            </Button>
          </div>
          <div
            className="text-base leading-relaxed text-foreground [&_a]:text-semantic-analysis-foreground [&_a]:underline [&_h2]:hidden [&_li]:my-1.5 [&_p]:my-1.5 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-5"
            dangerouslySetInnerHTML={{ __html: overviewHtml }}
          />
        </section>
      ) : null}
    </>
  );
}
