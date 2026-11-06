import type { OverviewDocSectionBlocksProps } from "./overview-doc-section-block-types";
import { useOverviewDocSectionBlocks } from "./use-overview-doc-section-blocks";
import {
  OverviewDocAnswerSection,
  OverviewDocOverviewSection,
  OverviewDocSectionToolbar,
} from "./OverviewDocLeadSections";
import { OverviewDocFaqSection, OverviewDocPassageSections } from "./OverviewDocBodySections";

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
  const {
    activeStepTitleKey, linksExpanded, setLinksExpanded, rewritingPassageKey, isPagesSource, isSapSource,
    answerHtml, overviewHtml, scenarioHtml, coreArticleBodyHtml, parsedPassageDoc, elementorSections,
    extractedLinks, internalLinks, wikiLinks, faqEntries, commitCoreArticleBodyHtml, commitPassageSectionPatch,
    passageProseEditorKey, handleRewriteBlogPassage, commitElementorSection, handleRewriteElementorPassage, commitFaqEntry,
    anyBusy,
  } = useOverviewDocSectionBlocks({
    row, rowIndex, sitemapSource, siteId, siteUrl, businessName, isElementorRow, bodyHtml, busy, onUpdateRow,
    onAiAnswer, onAiOverview, onAiHeaders, onAiLinks, onAiWikipediaLink, onAiScenario, onAiInContentImage, onAiFaqAll,
    onAiFaqQuestion, onAiFaqAnswer, onAiElementorSection, onAiElementorSectionHeader, onAiElementorSectionContent,
    onPassageStatusChange, activeOptimizingSectionTitle,
  });

  return (
    <div className="flex w-full flex-col gap-6 text-base text-white">
      <OverviewDocSectionToolbar
        row={row}
        rowIndex={rowIndex}
        onAiAnswer={onAiAnswer}
        onAiOverview={onAiOverview}
        onAiHeaders={onAiHeaders}
        onAiLinks={onAiLinks}
        onAiWikipediaLink={onAiWikipediaLink}
        onAiScenario={onAiScenario}
        onAiInContentImage={onAiInContentImage}
        onAiFaqAll={onAiFaqAll}
        isPagesSource={isPagesSource}
        isSapSource={isSapSource}
        answerHtml={answerHtml}
        overviewHtml={overviewHtml}
        scenarioHtml={scenarioHtml}
        faqEntries={faqEntries}
        extractedLinks={extractedLinks}
        internalLinks={internalLinks}
        wikiLinks={wikiLinks}
        linksExpanded={linksExpanded}
        setLinksExpanded={setLinksExpanded}
        anyBusy={anyBusy}
      />
      <OverviewDocAnswerSection
        row={row}
        rowIndex={rowIndex}
        busy={busy}
        onAiAnswer={onAiAnswer}
        answerHtml={answerHtml}
        activeStepTitleKey={activeStepTitleKey}
        anyBusy={anyBusy}
      />
      <OverviewDocOverviewSection
        row={row}
        rowIndex={rowIndex}
        busy={busy}
        onAiOverview={onAiOverview}
        overviewHtml={overviewHtml}
        activeStepTitleKey={activeStepTitleKey}
        anyBusy={anyBusy}
      />
      <OverviewDocPassageSections
        busy={busy}
        siteUrl={siteUrl}
        isElementorRow={isElementorRow}
        elementorSections={elementorSections}
        parsedPassageDoc={parsedPassageDoc}
        coreArticleBodyHtml={coreArticleBodyHtml}
        commitElementorSection={commitElementorSection}
        commitPassageSectionPatch={commitPassageSectionPatch}
        commitCoreArticleBodyHtml={commitCoreArticleBodyHtml}
        handleRewriteBlogPassage={handleRewriteBlogPassage}
        handleRewriteElementorPassage={handleRewriteElementorPassage}
        passageProseEditorKey={passageProseEditorKey}
        anyBusy={anyBusy}
        activeStepTitleKey={activeStepTitleKey}
        rewritingPassageKey={rewritingPassageKey}
      />
      <OverviewDocFaqSection
        row={row}
        rowIndex={rowIndex}
        onAiFaqAll={onAiFaqAll}
        onAiFaqQuestion={onAiFaqQuestion}
        onAiFaqAnswer={onAiFaqAnswer}
        faqEntries={faqEntries}
        commitFaqEntry={commitFaqEntry}
        anyBusy={anyBusy}
      />
    </div>
  );
}
