import { Image as ImageIcon } from "lucide-react";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_FAILED_TO_COPY_IMAGE_TO_CLIPBOARD, NOTIFY_FAILED_TO_DOWNLOAD_IMAGE, NOTIFY_IMAGE_COPIED_TO_CLIPBOARD, NOTIFY_IMAGE_DOWNLOADED_SUCCESSFULLY } from "@/lib/notify-messages";
import { ModificationChat } from "../ModificationChat";
import { ImagePreviewPanel } from "../ImagePreviewPanel";
import { downloadImage, copyImageToClipboard } from "../image-utils";
import { FeaturedImageGeneratorState } from "../FeaturedImageGenerator";
import { generateSEOImageFilename } from "@/lib/image-filename-generator";
import type { Dispatch, SetStateAction } from "react";
import type { GenerationResult, Message } from "@/lib/api";
import type { MarkdownSection } from "@/lib/section-parser";

interface ModificationPanelProps {
  activeTab: string;
  imageState: FeaturedImageGeneratorState;
  imageSourceSection: string | null;
  availableSectionsForInsertion: MarkdownSection[];
  finalOutput?: string;
  setGenerationResult?: Dispatch<SetStateAction<GenerationResult>>;
  handleInsertImageIntoSection?: (sectionHeader: string, imageMarkdown: string) => void;
  flowTitle?: string;
  apiKey?: string;
  selectedModel?: string;
  // Plan modification props
  isModifyingPlan: boolean;
  planChatMessages: Message[];
  planUserInput: string;
  setPlanUserInput: (value: string) => void;
  planModificationChecklist: string[];
  isGeneratingPlanChecklist: boolean;
  isUpdatingPlan: boolean;
  planElapsedTime: number;
  hasGeneratedPlanChecklist: boolean;
  planUpdated: boolean;
  onGeneratePlanChecklist: () => void;
  onUpdatePlan: () => void;
  onCancelModifyPlan?: () => void;
  onProceedWithModifiedPlan?: () => void;
  onModifyPlanAgain: () => void;
  onModifyPlanChecklist: () => void;
  planChatEndRef: React.RefObject<HTMLDivElement>;
  // Draft modification props
  isModifyingDraft: boolean;
  draftChatMessages: Message[];
  draftUserInput: string;
  setDraftUserInput: (value: string) => void;
  draftModificationChecklist: string[];
  isGeneratingDraftChecklist: boolean;
  isUpdatingDraft: boolean;
  draftElapsedTime: number;
  hasGeneratedDraftChecklist: boolean;
  draftUpdated: boolean;
  onGenerateDraftChecklist: () => void;
  onUpdateDraft: () => void;
  onCancelModifyDraft?: () => void;
  onProceedWithModifiedDraft?: () => void;
  onModifyDraftAgain: () => void;
  onModifyDraftChecklist: () => void;
  draftChatEndRef: React.RefObject<HTMLDivElement>;
  // Final modification props
  isModifyingFinal: boolean;
  finalChatMessages: Message[];
  finalUserInput: string;
  setFinalUserInput: (value: string) => void;
  finalModificationChecklist: string[];
  isGeneratingFinalChecklist: boolean;
  isUpdatingFinal: boolean;
  finalElapsedTime: number;
  hasGeneratedFinalChecklist: boolean;
  finalUpdated: boolean;
  onGenerateFinalChecklist: () => void;
  onUpdateFinal: () => void;
  onCancelModifyFinal?: () => void;
  onProceedWithModifiedFinal?: () => void;
  onModifyFinalAgain: () => void;
  onModifyFinalChecklist: () => void;
  finalChatEndRef: React.RefObject<HTMLDivElement>;
}

export function ModificationPanel({
  activeTab,
  imageState,
  imageSourceSection,
  availableSectionsForInsertion,
  finalOutput,
  setGenerationResult,
  handleInsertImageIntoSection,
  flowTitle = "",
  apiKey = "",
  selectedModel = getResearchModel(),
  // Plan
  isModifyingPlan,
  planChatMessages,
  planUserInput,
  setPlanUserInput,
  planModificationChecklist,
  isGeneratingPlanChecklist,
  isUpdatingPlan,
  planElapsedTime,
  hasGeneratedPlanChecklist,
  planUpdated,
  onGeneratePlanChecklist,
  onUpdatePlan,
  onCancelModifyPlan,
  onProceedWithModifiedPlan,
  onModifyPlanAgain,
  onModifyPlanChecklist,
  planChatEndRef,
  // Draft
  isModifyingDraft,
  draftChatMessages,
  draftUserInput,
  setDraftUserInput,
  draftModificationChecklist,
  isGeneratingDraftChecklist,
  isUpdatingDraft,
  draftElapsedTime,
  hasGeneratedDraftChecklist,
  draftUpdated,
  onGenerateDraftChecklist,
  onUpdateDraft,
  onCancelModifyDraft,
  onProceedWithModifiedDraft,
  onModifyDraftAgain,
  onModifyDraftChecklist,
  draftChatEndRef,
  // Final
  isModifyingFinal,
  finalChatMessages,
  finalUserInput,
  setFinalUserInput,
  finalModificationChecklist,
  isGeneratingFinalChecklist,
  isUpdatingFinal,
  finalElapsedTime,
  hasGeneratedFinalChecklist,
  finalUpdated,
  onGenerateFinalChecklist,
  onUpdateFinal,
  onCancelModifyFinal,
  onProceedWithModifiedFinal,
  onModifyFinalAgain,
  onModifyFinalChecklist,
  finalChatEndRef,
}: ModificationPanelProps) {
  // Show Image Preview when featured-image tab is active
  if (activeTab === 'featured-image') {
    return (
      <div className="flex flex-col border-0 bg-card w-full rounded-lg shadow-sm overflow-hidden h-full" style={{ maxHeight: '80vh', height: '80vh' }}>
        <div className="sticky top-0 z-10 bg-card px-4 py-3 flex-shrink-0">
          <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
            <ImageIcon className="h-4 w-4" />
            Image Preview
          </h3>
        </div>
        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
          <ImagePreviewPanel
            generatedImageUrl={imageState.generatedImageUrl}
            generatedImageBase64={imageState.generatedImageBase64}
            previewImageUrl={imageState.previewImageUrl}
            onDownload={async () => {
              try {
                let filename: string;
                
                // Generate SEO-optimized filename based on source
                if (imageSourceSection) {
                  // Section-based image: generate from section name
                  filename = await generateSEOImageFilename(
                    imageSourceSection,
                    apiKey,
                    selectedModel,
                    'section'
                  );
                } else {
                  // Featured image: generate from blog title
                  const sourceText = flowTitle || 'featured-image';
                  filename = await generateSEOImageFilename(
                    sourceText,
                    apiKey,
                    selectedModel,
                    'featured'
                  );
                }
                
                await downloadImage(imageState.generatedImageUrl || undefined, imageState.generatedImageBase64 || undefined, filename);
                notify.success(NOTIFY_IMAGE_DOWNLOADED_SUCCESSFULLY);
              } catch (err) {
                notify.error(NOTIFY_FAILED_TO_DOWNLOAD_IMAGE);
                console.error("Download error:", err);
              }
            }}
            onCopy={async () => {
              try {
                await copyImageToClipboard(imageState.generatedImageUrl || undefined, imageState.generatedImageBase64 || undefined);
                notify.success(NOTIFY_IMAGE_COPIED_TO_CLIPBOARD);
              } catch (err) {
                notify.error(NOTIFY_FAILED_TO_COPY_IMAGE_TO_CLIPBOARD);
                console.error("Copy error:", err);
              }
            }}
            availableSections={availableSectionsForInsertion}
            defaultSection={imageSourceSection}
            onInsertImage={setGenerationResult ? handleInsertImageIntoSection : undefined}
            finalOutput={finalOutput}
          />
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Plan Modification Chat */}
      <ModificationChat
        isActive={isModifyingPlan}
        title="Flow Assist - Plan Modification"
        chatMessages={planChatMessages}
        userInput={planUserInput}
        onUserInputChange={setPlanUserInput}
        checklist={planModificationChecklist}
        isGeneratingChecklist={isGeneratingPlanChecklist}
        isUpdating={isUpdatingPlan}
        elapsedTime={planElapsedTime}
        hasGeneratedChecklist={hasGeneratedPlanChecklist}
        updated={planUpdated}
        placeholder="Describe how you'd like to modify the plan..."
        emptyStateMessage="Provide instructions on how you'd like to modify the plan."
        emptyStateExample='Example: "Add more focus on SEO optimization" or "Include more technical details in section 2"'
        updateButtonLabel="Update Plan"
        processingTitle="Processing Plan Update"
        updatedMessage="Plan has been updated. Review the updated plan in the Plan tab above."
        proceedButtonLabel="Review & Proceed"
        onGenerateChecklist={onGeneratePlanChecklist}
        onUpdate={onUpdatePlan}
        onCancel={onCancelModifyPlan}
        onProceed={onProceedWithModifiedPlan}
        onModifyAgain={onModifyPlanAgain}
        onModifyChecklist={onModifyPlanChecklist}
        chatEndRef={planChatEndRef}
      />

      {/* Draft Report Modification Chat */}
      <ModificationChat
        isActive={isModifyingDraft}
        title="Flow Assist - Draft Report Modification"
        chatMessages={draftChatMessages}
        userInput={draftUserInput}
        onUserInputChange={setDraftUserInput}
        checklist={draftModificationChecklist}
        isGeneratingChecklist={isGeneratingDraftChecklist}
        isUpdating={isUpdatingDraft}
        elapsedTime={draftElapsedTime}
        hasGeneratedChecklist={hasGeneratedDraftChecklist}
        updated={draftUpdated}
        placeholder="Describe how you'd like to modify the draft report... (e.g., 'Add more detail to section 2' or 'Improve the flow')"
        emptyStateMessage="Provide instructions on how you'd like to modify the draft report."
        emptyStateExample='Example: "Add more detail to section 2" or "Improve the flow between paragraphs"'
        updateButtonLabel="Update Draft Report"
        processingTitle="Processing Draft Report Update"
        updatedMessage="Draft report has been updated. Review the updated draft in the Draft Report tab above."
        proceedButtonLabel="Done"
        onGenerateChecklist={onGenerateDraftChecklist}
        onUpdate={onUpdateDraft}
        onCancel={onCancelModifyDraft}
        onProceed={onProceedWithModifiedDraft}
        onModifyAgain={onModifyDraftAgain}
        onModifyChecklist={onModifyDraftChecklist}
        chatEndRef={draftChatEndRef}
        variant="draft"
      />

      {/* Final Report Modification Chat */}
      <ModificationChat
        isActive={isModifyingFinal}
        title="Flow Assist - Final Report Modification"
        chatMessages={finalChatMessages}
        userInput={finalUserInput}
        onUserInputChange={setFinalUserInput}
        checklist={finalModificationChecklist}
        isGeneratingChecklist={isGeneratingFinalChecklist}
        isUpdating={isUpdatingFinal}
        elapsedTime={finalElapsedTime}
        hasGeneratedChecklist={hasGeneratedFinalChecklist}
        updated={finalUpdated}
        placeholder="Describe how you'd like to modify the final report..."
        emptyStateMessage="Provide instructions on how you'd like to modify the final report."
        emptyStateExample='Example: "Make the tone more professional" or "Add more examples in section 3"'
        updateButtonLabel="Update Final Report"
        processingTitle="Processing Final Report Update"
        updatedMessage="Final report has been updated. Review the updated report in the Final Report tab above."
        proceedButtonLabel="Done"
        onGenerateChecklist={onGenerateFinalChecklist}
        onUpdate={onUpdateFinal}
        onCancel={onCancelModifyFinal}
        onProceed={onProceedWithModifiedFinal}
        onModifyAgain={onModifyFinalAgain}
        onModifyChecklist={onModifyFinalChecklist}
        chatEndRef={finalChatEndRef}
      />
    </>
  );
}

