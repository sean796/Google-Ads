import { CircleHelp, Sparkles, Wand2 } from "lucide-react";
import { OverviewSectionProseEditor } from "@/components/overview/OverviewSectionProseEditor";
import {
  CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
  CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { cn } from "@/lib/utils";
import { Button, Field, TextareaField } from "@/ui";
import type { OverviewDocSectionBlocksProps } from "./overview-doc-section-block-types";
import type { useOverviewDocSectionBlocks } from "./use-overview-doc-section-blocks";

type OverviewDocSectionState = ReturnType<typeof useOverviewDocSectionBlocks>;

export type OverviewDocPassageSectionsProps = Pick<
  OverviewDocSectionBlocksProps,
  "busy" | "siteUrl" | "isElementorRow"
> &
  Pick<
    OverviewDocSectionState,
    | "elementorSections"
    | "parsedPassageDoc"
    | "coreArticleBodyHtml"
    | "commitElementorSection"
    | "commitPassageSectionPatch"
    | "commitCoreArticleBodyHtml"
    | "handleRewriteBlogPassage"
    | "handleRewriteElementorPassage"
    | "passageProseEditorKey"
    | "anyBusy"
    | "activeStepTitleKey"
    | "rewritingPassageKey"
  >;

export function OverviewDocPassageSections({
  busy,
  siteUrl,
  isElementorRow,
  elementorSections,
  parsedPassageDoc,
  coreArticleBodyHtml,
  commitElementorSection,
  commitPassageSectionPatch,
  commitCoreArticleBodyHtml,
  handleRewriteBlogPassage,
  handleRewriteElementorPassage,
  passageProseEditorKey,
  anyBusy,
  activeStepTitleKey,
  rewritingPassageKey,
}: OverviewDocPassageSectionsProps) {
  return (
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
                    "animate-meta-opt-breathe border-semantic-data/40 bg-ui-field/35 px-3 py-3",
                )}
              >
                <div className="flex items-center gap-2">
                  <Field
                    value={sec.title}
                    onChange={(e) => commitElementorSection(sec.id, { title: e.target.value })}
                    placeholder={`Section ${secIdx + 1} heading`}
                    aria-label={`Section ${secIdx + 1} heading`}
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="quiet"
                      type="button"
                      disabled={anyBusy}
                      onClick={() => void handleRewriteElementorPassage(secIdx, "header")}
                      title="Rewrite H2 heading"
                    >
                      <Wand2 className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
                      H2
                    </Button>
                    <Button
                      variant="quiet"
                      type="button"
                      disabled={anyBusy}
                      onClick={() => void handleRewriteElementorPassage(secIdx, "copy")}
                      title="Rewrite passage copy"
                    >
                      <Wand2 className="mr-1 h-3.5 w-3.5 text-semantic-analysis-foreground" aria-hidden />
                      Copy
                    </Button>
                    <Button
                      variant="quiet"
                      type="button"
                      disabled={anyBusy}
                      onClick={() => void handleRewriteElementorPassage(secIdx, "both")}
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
                    "animate-meta-opt-breathe border-semantic-data/40 bg-ui-field/35 px-3 py-3",
                )}
              >
                <div className="flex items-center gap-2">
                  <Field
                    value={sec.title}
                    onChange={(e) => commitPassageSectionPatch(secIdx, { title: e.target.value })}
                    placeholder={`H2 Section ${secIdx + 1} heading`}
                    aria-label={`H2 Section ${secIdx + 1} heading`}
                  />
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      variant="quiet"
                      type="button"
                      disabled={anyBusy}
                      onClick={() => void handleRewriteBlogPassage(secIdx, "header")}
                      title="Rewrite this H2 heading"
                    >
                      <Wand2 className="mr-1 h-3.5 w-3.5 text-primary" aria-hidden />
                      H2
                    </Button>
                    <Button
                      variant="quiet"
                      type="button"
                      disabled={anyBusy}
                      onClick={() => void handleRewriteBlogPassage(secIdx, "copy")}
                      title="Optimize this passage's copy in place"
                    >
                      <Wand2 className="mr-1 h-3.5 w-3.5 text-semantic-analysis-foreground" aria-hidden />
                      Copy
                    </Button>
                    <Button
                      variant="quiet"
                      type="button"
                      disabled={anyBusy}
                      onClick={() => void handleRewriteBlogPassage(secIdx, "both")}
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
  );
}

export type OverviewDocFaqSectionProps = Pick<
  OverviewDocSectionBlocksProps,
  "row" | "rowIndex" | "onAiFaqAll" | "onAiFaqQuestion" | "onAiFaqAnswer"
> &
  Pick<OverviewDocSectionState, "faqEntries" | "commitFaqEntry" | "anyBusy">;

export function OverviewDocFaqSection({
  row,
  rowIndex,
  onAiFaqAll,
  onAiFaqQuestion,
  onAiFaqAnswer,
  faqEntries,
  commitFaqEntry,
  anyBusy,
}: OverviewDocFaqSectionProps) {
  return (
    <>
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
              <CircleHelp className="h-4 w-4 text-semantic-analysis-foreground" aria-hidden />
              <span>Frequently Asked Questions ({faqEntries.length})</span>
            </div>
            <Button
              variant="quiet"
              type="button"
              disabled={anyBusy}
              onClick={() => void onAiFaqAll(rowIndex)}
            >
              <Wand2 className="mr-1.5 h-3.5 w-3.5 text-primary" aria-hidden />
              Regenerate FAQs
            </Button>
          </div>

          <div className="flex flex-col gap-2.5">
            {faqEntries.map((item, faqIdx) => (
              <div key={faqIdx} className="group flex flex-col gap-1.5 bg-ui-field/50 p-3">
                <div className="flex items-center gap-1.5">
                  <span className="w-7 shrink-0 tabular-nums text-semantic-analysis-foreground">
                    Q{faqIdx + 1}
                  </span>
                  <Field
                    value={item.question}
                    onChange={(e) => commitFaqEntry(faqIdx, { question: e.target.value })}
                    placeholder="FAQ question"
                    aria-label={`FAQ ${faqIdx + 1} question`}
                  />
                  <Button
                    size="icon" icon={Wand2} aria-label="Rewrite FAQ question"
                    variant="quiet"
                    type="button"
                    disabled={anyBusy}
                    onClick={() => void onAiFaqQuestion(rowIndex, faqIdx)}
                    title="Rewrite FAQ question"
                  ></Button>
                </div>

                <div className="flex items-start gap-1.5">
                  <span className="w-7 shrink-0 pt-1.5 tabular-nums text-muted-foreground">
                    A{faqIdx + 1}
                  </span>
                  <TextareaField
                    value={item.answer}
                    onChange={(e) => commitFaqEntry(faqIdx, { answer: e.target.value })}
                    rows={2}
                    placeholder="FAQ answer"
                    aria-label={`FAQ ${faqIdx + 1} answer`}
                  />
                  <Button
                    size="icon" icon={Wand2} aria-label="Rewrite FAQ answer"
                    variant="quiet"
                    type="button"
                    disabled={anyBusy}
                    onClick={() => void onAiFaqAnswer(rowIndex, faqIdx)}
                    title="Rewrite FAQ answer"
                  ></Button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
