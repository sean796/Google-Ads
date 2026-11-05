import { useMemo, useState } from "react";
import { BlogGeneratorWorkspaceChrome } from "@/components/blog-generator/BlogGeneratorWorkspaceChrome";
import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import type { GeneratorFreeFlowBindings } from "@/components/generator/generator-free-flow-bindings";
import { FlowFreeformBody } from "@/components/manager/flow-freeform/FlowFreeformBody";
import { FlowFreeformToolbar } from "@/components/manager/flow-freeform/FlowFreeformToolbar";
import { BulkGeneratorDetailsDrawer } from "@/components/keyword-research/bulk/BulkGeneratorDetailsDrawer";
import {
  SEO_WORKSPACE_BODY_SCROLL_CLASS,
  SEO_WORKSPACE_HEADER_CLASS,
  SEO_WORKSPACE_SHELL_CLASS,
} from "@/components/seo/seo-workspace-layout";
import { buildFlowBulkGeneratorDetailsProps } from "@/lib/generator/flow/flow-bulk-details-bindings";
import { cn } from "@/lib/utils";

export type FlowGeneratorSectionProps = {
  activeSection: BlogGeneratorSectionId;
  onSectionChange: (id: BlogGeneratorSectionId) => void;
  bindings: GeneratorFreeFlowBindings;
  onResetBlueprint?: () => void;
};

export function FlowGeneratorSection({
  activeSection,
  onSectionChange,
  bindings,
  onResetBlueprint,
}: FlowGeneratorSectionProps) {
  const pipelineBusy = bindings.isGenerating;

  const canOpenDetails =
    pipelineBusy ||
    bindings.flowSections.length > 0 ||
    bindings.userGoalPrompt.trim().length > 0 ||
    bindings.clarificationQuestions !== null;

  const detailsPanelProps = useMemo(
    () =>
      buildFlowBulkGeneratorDetailsProps({
        workspaceBusy: pipelineBusy,
        flowTitle: bindings.flowTitle,
        sections: bindings.flowSections,
        generationResult: bindings.generationResult,
        isGenerating: pipelineBusy,
      }),
    [
      pipelineBusy,
      bindings.flowTitle,
      bindings.flowSections,
      bindings.generationResult,
    ],
  );

  const progressSnapshot =
    pipelineBusy && bindings.generationResult.currentStage !== "idle"
      ? {
          label: "Flow",
          completed: 0,
          total: Math.max(1, bindings.flowSections.length),
          statusMessage: bindings.generationResult.currentStage,
        }
      : bindings.generationResult.currentStage === "complete"
        ? {
            label: "Flow",
            completed: bindings.flowSections.length,
            total: Math.max(1, bindings.flowSections.length),
            statusMessage: "Complete",
          }
        : null;

  return (
    <div className={SEO_WORKSPACE_SHELL_CLASS}>
      <div className={SEO_WORKSPACE_HEADER_CLASS}>
        <BlogGeneratorWorkspaceChrome
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          sectionSwitchDisabled={pipelineBusy}
          workspaceBusy={pipelineBusy}
          progressBand="full"
          progressSnapshot={progressSnapshot}
          hideIdleProgressTrack
          canOpenDetails={canOpenDetails}
          isProcessing={pipelineBusy}
          detailsPanelId="flow-generator-details"
          toolbar={
            <FlowFreeformToolbar
              flowTitle={bindings.flowTitle}
              finalMarkdown={bindings.generationResult.final}
              hasGoalPrompt={bindings.userGoalPrompt.trim().length > 0}
              sectionsCount={bindings.flowSections.length}
              pipelineBusy={pipelineBusy}
              onRunClarify={bindings.onRunClarify}
              onRunOutline={bindings.onRunOutline}
              onRunFullReport={bindings.onRunFullReport}
              onRunAllSections={bindings.onRunAllSections}
              onAbort={bindings.onAbort}
              onResetBlueprint={onResetBlueprint}
            />
          }
          detailsPanel={
            <BulkGeneratorDetailsDrawer
              variant="csv"
              postDestination="local"
              wpConfig={null}
              prepAccordionTitle="Flow prep"
              {...detailsPanelProps}
            />
          }
        />
      </div>
      <div className={cn(SEO_WORKSPACE_BODY_SCROLL_CLASS, "relative")}>
        <FlowFreeformBody
          flowTitle={bindings.flowTitle}
          setFlowTitle={bindings.setFlowTitle}
          userGoalPrompt={bindings.userGoalPrompt}
          onUserGoalPromptChange={bindings.onUserGoalPromptChange}
          clarificationQuestions={bindings.clarificationQuestions}
          clarificationAnswers={bindings.clarificationAnswers}
          onClarificationAnswersChange={bindings.onClarificationAnswersChange}
          sections={bindings.flowSections}
          onSectionsChange={bindings.setFlowSections}
          activeKnowledgeBaseText={bindings.activeKnowledgeBaseText}
          isGenerating={pipelineBusy}
          onEnhancePromptAuto={bindings.onEnhancePromptAuto}
          onRebuildSection={bindings.onRebuildSection}
          onRebuildAll={bindings.onRebuildAll}
        />
      </div>
    </div>
  );
}
