import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/ui";

import { getResearchModel } from "@/lib/optimization-settings-storage";
import { useState, useEffect, useMemo } from "react";
import { OutputManagerContentProps } from "./types";
import { parseMarkdownSections } from "@/lib/section-parser";
import { FeaturedImageGeneratorState } from "./FeaturedImageGenerator";
import { usePlanModification } from "./hooks/usePlanModification";
import { useDraftModification } from "./hooks/useDraftModification";
import { useFinalModification } from "./hooks/useFinalModification";
import { useImageInsertion } from "./hooks/useImageInsertion";
import { OutputToolbar } from "./components/OutputToolbar";
import { OutputTabs } from "./components/OutputTabs";
import { ModificationPanel } from "./components/ModificationPanel";
import { useGenerationProgress } from "@/hooks/use-generation-progress";
import { GenerationProgress } from "@/components/GenerationProgress";
import { KeywordDensityTracker } from "@/components/KeywordDensityTracker";

export const OutputManagerContent = ({ 
  output: finalOutput, 
  isGenerating, 
  currentStage, 
  plan, 
  draft, 
  onAbort,
  planApprovalStatus,
  onApprovePlan,
  onRejectPlan,
  onRetryPlan,
  isModifyingPlan = false,
  modificationChecklist = [],
  isGeneratingChecklist = false,
  isUpdatingPlan = false,
  onModifyPlan,
  onCancelModifyPlan,
  onProceedWithModifiedPlan,
  setModificationChecklist,
  setIsGeneratingChecklist,
  setIsUpdatingPlan,
  setGenerationResult,
  apiKey = "",
  selectedModel = getResearchModel(),
  temperature = 1.57,
  maxTokens = 5000000,
  topP = 0.90,
  flowTitle = "",
  flowPurpose = "",
  agents = [],
  activeKnowledgeBaseText = "",
  primaryKeywords,
  // Final report modification props
  isModifyingFinal = false,
  finalModificationChecklist = [],
  isGeneratingFinalChecklist = false,
  isUpdatingFinal = false,
  onModifyFinal,
  onCancelModifyFinal,
  onProceedWithModifiedFinal,
  setFinalModificationChecklist,
  setIsGeneratingFinalChecklist,
  setIsUpdatingFinal,
  // Draft report modification props
  isModifyingDraft = false,
  draftModificationChecklist = [],
  isGeneratingDraftChecklist = false,
  isUpdatingDraft = false,
  onModifyDraft,
  onCancelModifyDraft,
  onProceedWithModifiedDraft,
  setDraftModificationChecklist,
  setIsGeneratingDraftChecklist,
  setIsUpdatingDraft,
  hideImageVideoTabs = false,
}: OutputManagerContentProps) => {
  // Determine which tab to show by default
  const defaultTab = currentStage === 'complete' || currentStage === 'error' || currentStage === 'idle'
    ? 'final'
    : currentStage === 'reviewing'
      ? 'draft'
      : currentStage === 'drafting'
        ? 'plan'
        : currentStage === 'plan_approval_pending'
          ? 'plan'
          : 'plan';
  
  // Featured image state
  const [activeTab, setActiveTab] = useState<string>(defaultTab);
  const [imageState, setImageState] = useState<FeaturedImageGeneratorState>({
    generatedImageUrl: null,
    generatedImageBase64: null,
    previewImageUrl: null,
  });
  const [imageSourceSection, setImageSourceSection] = useState<string | null>(null);
  
  // Update imageSourceSection when imageState changes
  useEffect(() => {
    if (imageState.selectedSection !== undefined) {
      setImageSourceSection(imageState.selectedSection);
    }
  }, [imageState.selectedSection]);
  
  // Parse sections from finalOutput for image insertion
  const availableSectionsForInsertion = useMemo(() => {
    if (!finalOutput) return [];
    return parseMarkdownSections(finalOutput);
  }, [finalOutput]);
  
  // Image insertion hook
  const { handleInsertImageIntoSection } = useImageInsertion({
    finalOutput,
    setGenerationResult,
  });

  // Plan modification hook
  const planMod = usePlanModification({
    plan,
    isModifyingPlan,
    modificationChecklist,
    isGeneratingChecklist,
    isUpdatingPlan,
    setModificationChecklist,
    setIsGeneratingChecklist,
    setIsUpdatingPlan,
    setGenerationResult,
    apiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    flowTitle,
    flowPurpose,
    agents,
    activeKnowledgeBaseText,
  });

  // Draft modification hook
  const draftMod = useDraftModification({
    draft,
    plan,
    isModifyingDraft,
    draftModificationChecklist,
    isGeneratingDraftChecklist,
    isUpdatingDraft,
    setDraftModificationChecklist,
    setIsGeneratingDraftChecklist,
    setIsUpdatingDraft,
    setGenerationResult,
    apiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    flowTitle,
    flowPurpose,
    agents,
    activeKnowledgeBaseText,
  });

  // Final modification hook
  const finalMod = useFinalModification({
    finalOutput,
    isModifyingFinal,
    finalModificationChecklist,
    isGeneratingFinalChecklist,
    isUpdatingFinal,
    setFinalModificationChecklist,
    setIsGeneratingFinalChecklist,
    setIsUpdatingFinal,
    setGenerationResult,
    apiKey,
    selectedModel,
    temperature,
    maxTokens,
    topP,
    flowTitle,
    flowPurpose,
    agents,
    activeKnowledgeBaseText,
  });

  // Generation progress tracking
  const progressMetrics = useGenerationProgress({
    currentStage: currentStage || 'idle',
    isGenerating: isGenerating || false,
  });

  // Update activeTab when defaultTab changes
  useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  useEffect(() => {
    if (
      hideImageVideoTabs &&
      (activeTab === "featured-image" || activeTab === "video-generator")
    ) {
      setActiveTab(defaultTab);
    }
  }, [hideImageVideoTabs, activeTab, defaultTab]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Progress indicator during generation */}
      {isGenerating && currentStage && currentStage !== 'idle' && currentStage !== 'complete' && currentStage !== 'error' && (
        <div className="px-6 pt-4 pb-2">
          <GenerationProgress progress={progressMetrics} />
        </div>
      )}
      {/* Toolbar - Full Width */}
      <OutputToolbar
        currentStage={currentStage}
        planApprovalStatus={planApprovalStatus}
        plan={plan}
        finalOutput={finalOutput}
        isGenerating={isGenerating}
        onApprovePlan={onApprovePlan}
        onRejectPlan={onRejectPlan}
        onRetryPlan={onRetryPlan}
        onModifyPlan={onModifyPlan}
        onModifyFinal={onModifyFinal}
        onAbort={onAbort}
      />
      
      {/* Tabs Bar - Full Width */}
      <Tabs
        value={activeTab}
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        onValueChange={setActiveTab}
      >
        <TabsList className="flex w-full justify-center gap-3 flex-shrink-0 bg-background/50 border-0 px-2 py-2 shadow-sm">
          <TabsTrigger value="plan" disabled={!plan && currentStage !== 'planning'} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Plan (Chain of Thought)
          </TabsTrigger>
          <TabsTrigger value="draft" disabled={!draft && currentStage !== 'drafting'} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Draft Report
          </TabsTrigger>
          <TabsTrigger value="final" disabled={!finalOutput} className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
            Final Report
          </TabsTrigger>
          {!hideImageVideoTabs ? (
            <>
              <TabsTrigger value="featured-image" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Image Generator
              </TabsTrigger>
              <TabsTrigger value="video-generator" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
                Video Generator
              </TabsTrigger>
            </>
          ) : null}
          {primaryKeywords && primaryKeywords.length > 0 && (
            <TabsTrigger value="keyword-density" className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">
              Keyword Density
            </TabsTrigger>
          )}
        </TabsList>
      
        {/* Main Content Area - Flow Assists beside Output Tabs */}
        <div className="flex min-h-0 flex-1 flex-row gap-6 overflow-hidden">
          {/* Output Tabs Content - Left Side */}
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <OutputTabs
              plan={plan}
              draft={draft}
              finalOutput={finalOutput}
              isGenerating={isGenerating}
              currentStage={currentStage}
              isUpdatingPlan={isUpdatingPlan}
              isUpdatingDraft={isUpdatingDraft}
              isUpdatingFinal={isUpdatingFinal}
              elapsedTime={planMod.elapsedTime}
              draftElapsedTime={draftMod.draftElapsedTime}
              finalElapsedTime={finalMod.finalElapsedTime}
              apiKey={apiKey}
              flowTitle={flowTitle}
              flowPurpose={flowPurpose}
              agents={agents}
              selectedModel={selectedModel}
              temperature={temperature}
              maxTokens={maxTokens}
              topP={topP}
              setGenerationResult={setGenerationResult}
              onImageStateChange={setImageState}
              hideImageVideoTabs={hideImageVideoTabs}
            />
            {primaryKeywords && primaryKeywords.length > 0 && (
              <TabsContent value="keyword-density" className="mt-0 w-full px-8 py-6">
                <KeywordDensityTracker
                  content={finalOutput || draft || plan || ""}
                  keywords={primaryKeywords}
                  enabled={true}
                />
              </TabsContent>
            )}
          </div>
          {/* Flow Assist Modification Chats / Image Preview - Right Side */}
          <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto pb-4 md:pb-6">
            {/* Keyword Density Tracker - Show when keywords are available and content exists */}
            {primaryKeywords && primaryKeywords.length > 0 && finalOutput && activeTab === 'final' && (
              <div className="bg-card rounded-lg p-4 shadow-sm">
                <KeywordDensityTracker
                  content={finalOutput}
                  keywords={primaryKeywords}
                  enabled={currentStage === 'complete'}
                />
              </div>
            )}
            <ModificationPanel
              activeTab={activeTab}
              imageState={imageState}
              imageSourceSection={imageSourceSection}
              availableSectionsForInsertion={availableSectionsForInsertion}
              finalOutput={finalOutput}
              setGenerationResult={setGenerationResult}
              handleInsertImageIntoSection={handleInsertImageIntoSection}
              flowTitle={flowTitle}
              apiKey={apiKey}
              selectedModel={selectedModel}
              // Plan modification props
              isModifyingPlan={isModifyingPlan}
              planChatMessages={planMod.chatMessages}
              planUserInput={planMod.userInput}
              setPlanUserInput={planMod.setUserInput}
              planModificationChecklist={modificationChecklist}
              isGeneratingPlanChecklist={isGeneratingChecklist}
              isUpdatingPlan={isUpdatingPlan}
              planElapsedTime={planMod.elapsedTime}
              hasGeneratedPlanChecklist={planMod.hasGeneratedChecklist}
              planUpdated={planMod.planUpdated}
              onGeneratePlanChecklist={planMod.handleGenerateChecklist}
              onUpdatePlan={planMod.handleUpdatePlan}
              onCancelModifyPlan={onCancelModifyPlan}
              onProceedWithModifiedPlan={onProceedWithModifiedPlan}
              onModifyPlanAgain={() => {
                planMod.setHasGeneratedChecklist(false);
                planMod.setPlanUpdated(false);
                setModificationChecklist?.([]);
                planMod.setChatMessages([]);
                planMod.setUserInput("");
              }}
              onModifyPlanChecklist={() => {
                planMod.setHasGeneratedChecklist(false);
                setModificationChecklist?.([]);
                planMod.setChatMessages([]);
                planMod.setUserInput("");
              }}
              planChatEndRef={planMod.chatEndRef}
              // Draft modification props
              isModifyingDraft={isModifyingDraft}
              draftChatMessages={draftMod.draftChatMessages}
              draftUserInput={draftMod.draftUserInput}
              setDraftUserInput={draftMod.setDraftUserInput}
              draftModificationChecklist={draftModificationChecklist}
              isGeneratingDraftChecklist={isGeneratingDraftChecklist}
              isUpdatingDraft={isUpdatingDraft}
              draftElapsedTime={draftMod.draftElapsedTime}
              hasGeneratedDraftChecklist={draftMod.hasGeneratedDraftChecklist}
              draftUpdated={draftMod.draftUpdated}
              onGenerateDraftChecklist={draftMod.handleGenerateDraftChecklist}
              onUpdateDraft={draftMod.handleUpdateDraft}
              onCancelModifyDraft={onCancelModifyDraft}
              onProceedWithModifiedDraft={onProceedWithModifiedDraft}
              onModifyDraftAgain={() => {
                draftMod.setHasGeneratedDraftChecklist(false);
                draftMod.setDraftUpdated(false);
                setDraftModificationChecklist?.([]);
                draftMod.setDraftChatMessages([]);
                draftMod.setDraftUserInput("");
              }}
              onModifyDraftChecklist={() => {
                draftMod.setHasGeneratedDraftChecklist(false);
                setDraftModificationChecklist?.([]);
                draftMod.setDraftChatMessages([]);
                draftMod.setDraftUserInput("");
              }}
              draftChatEndRef={draftMod.draftChatEndRef}
              // Final modification props
              isModifyingFinal={isModifyingFinal}
              finalChatMessages={finalMod.finalChatMessages}
              finalUserInput={finalMod.finalUserInput}
              setFinalUserInput={finalMod.setFinalUserInput}
              finalModificationChecklist={finalModificationChecklist}
              isGeneratingFinalChecklist={isGeneratingFinalChecklist}
              isUpdatingFinal={isUpdatingFinal}
              finalElapsedTime={finalMod.finalElapsedTime}
              hasGeneratedFinalChecklist={finalMod.hasGeneratedFinalChecklist}
              finalUpdated={finalMod.finalUpdated}
              onGenerateFinalChecklist={finalMod.handleGenerateFinalChecklist}
              onUpdateFinal={finalMod.handleUpdateFinal}
              onCancelModifyFinal={onCancelModifyFinal}
              onProceedWithModifiedFinal={onProceedWithModifiedFinal}
              onModifyFinalAgain={() => {
                finalMod.setHasGeneratedFinalChecklist(false);
                finalMod.setFinalUpdated(false);
                setFinalModificationChecklist?.([]);
                finalMod.setFinalChatMessages([]);
                finalMod.setFinalUserInput("");
              }}
              onModifyFinalChecklist={() => {
                finalMod.setHasGeneratedFinalChecklist(false);
                setFinalModificationChecklist?.([]);
                finalMod.setFinalChatMessages([]);
                finalMod.setFinalUserInput("");
              }}
              finalChatEndRef={finalMod.finalChatEndRef}
            />
          </div>
        </div>
      </Tabs>
    </div>
  );
};
