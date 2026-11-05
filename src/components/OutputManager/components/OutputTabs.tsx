
import { TabsContent } from "@/components/ui/tabs";
import { formatMarkdownContent, formatElapsedTime } from "../utils";
import { FeaturedImageGenerator } from "../FeaturedImageGenerator";
import { VideoScriptGenerator } from "../VideoScriptGenerator";

interface OutputTabsProps {
  plan?: string;
  draft?: string;
  finalOutput?: string;
  isGenerating: boolean;
  currentStage: 'idle' | 'planning' | 'plan_approval_pending' | 'drafting' | 'reviewing' | 'complete' | 'error';
  isUpdatingPlan: boolean;
  isUpdatingDraft: boolean;
  isUpdatingFinal: boolean;
  elapsedTime: number;
  draftElapsedTime: number;
  finalElapsedTime: number;
  apiKey: string;
  flowTitle: string;
  flowPurpose: string;
  agents: any[];
  selectedModel: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  setGenerationResult?: (result: any) => void;
  onImageStateChange?: (state: any) => void;
  hideImageVideoTabs?: boolean;
}

export function OutputTabs({
  plan,
  draft,
  finalOutput,
  isGenerating,
  currentStage,
  isUpdatingPlan,
  isUpdatingDraft,
  isUpdatingFinal,
  elapsedTime,
  draftElapsedTime,
  finalElapsedTime,
  apiKey,
  flowTitle,
  flowPurpose,
  agents,
  selectedModel,
  temperature,
  maxTokens,
  topP,
  setGenerationResult,
  onImageStateChange,
  hideImageVideoTabs = false,
}: OutputTabsProps) {
  return (
    <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto pb-4 md:pb-6">
      <TabsContent value="plan" className="mt-0 w-full px-8 py-6">
        {isUpdatingPlan ? (
          <div className="flex flex-col gap-4">
            {/* Progress indicator at top */}
            <div className="flex items-center justify-center gap-4 p-4 bg-card rounded-lg shadow-sm">
              
              <div className="flex flex-col">
                <h3 className="text-lg font-semibold text-foreground">Processing Plan Update</h3>
                <div className="flex items-center gap-2 text-2xl font-mono font-bold text-primary">
                  <span>{formatElapsedTime(elapsedTime)}</span>
                </div>
                <p className="text-sm text-muted-foreground">Updating plan based on checklist...</p>
              </div>
            </div>
            {/* Show updated content in real-time */}
            <div className="prose dark:prose-invert max-w-none w-full flex flex-col items-center" style={{ color: '#FFFFFF', backgroundColor: 'transparent' }}>
              {plan ? formatMarkdownContent(plan) : <p className="text-center text-muted-foreground p-10 flex items-center justify-center">
                
                Generating updated plan...
              </p>}
            </div>
          </div>
        ) : (
          <div className="prose dark:prose-invert max-w-none w-full flex flex-col items-center" style={{ color: '#FFFFFF', backgroundColor: 'transparent' }}>
            {plan ? formatMarkdownContent(plan) : <p className="text-center text-muted-foreground p-10 flex items-center justify-center">
              {(isGenerating && currentStage === 'planning') && null}
              Waiting for planning stage...
            </p>}
          </div>
        )}
      </TabsContent>
      <TabsContent value="draft" className="mt-0 w-full px-8 py-6">
        {isUpdatingDraft ? (
          <div className="flex flex-col gap-4">
            {/* Progress indicator at top */}
            <div className="flex items-center justify-center gap-4 p-4 bg-card rounded-lg shadow-sm">
              
              <div className="flex flex-col">
                <h3 className="text-lg font-semibold text-foreground">Processing Draft Report Update</h3>
                <div className="flex items-center gap-2 text-2xl font-mono font-bold text-primary">
                  <span>{formatElapsedTime(draftElapsedTime)}</span>
                </div>
                <p className="text-sm text-muted-foreground">Updating draft report based on checklist...</p>
              </div>
            </div>
            {/* Show updated content in real-time */}
            <div className="prose dark:prose-invert max-w-none w-full flex flex-col items-center" style={{ color: '#FFFFFF', backgroundColor: 'transparent' }}>
              {draft ? formatMarkdownContent(draft) : <p className="text-center text-muted-foreground p-10 flex items-center justify-center">
                
                Generating updated draft...
              </p>}
            </div>
          </div>
        ) : (
          <div className="prose dark:prose-invert max-w-none w-full flex flex-col items-center" style={{ color: '#FFFFFF', backgroundColor: 'transparent' }}>
            {draft ? formatMarkdownContent(draft) : <p className="text-center text-muted-foreground p-10 flex items-center justify-center">
              {(isGenerating && currentStage === 'drafting') && null}
              Waiting for drafting stage...
            </p>}
          </div>
        )}
      </TabsContent>
      <TabsContent value="final" className="mt-0 w-full px-8 py-6">
        {isUpdatingFinal ? (
          <div className="flex flex-col gap-4">
            {/* Progress indicator at top */}
            <div className="flex items-center justify-center gap-4 p-4 bg-card rounded-lg shadow-sm">
              
              <div className="flex flex-col">
                <h3 className="text-lg font-semibold text-foreground">Processing Final Report Update</h3>
                <div className="flex items-center gap-2 text-2xl font-mono font-bold text-primary">
                  <span>{formatElapsedTime(finalElapsedTime)}</span>
                </div>
                <p className="text-sm text-muted-foreground">Updating final report based on checklist...</p>
              </div>
            </div>
            {/* Show updated content in real-time */}
            <div className="prose dark:prose-invert max-w-none w-full flex flex-col items-center" style={{ color: '#FFFFFF', backgroundColor: 'transparent' }}>
              {finalOutput ? formatMarkdownContent(finalOutput) : <p className="text-center text-muted-foreground p-10 flex items-center justify-center">
                
                Generating updated final report...
              </p>}
            </div>
          </div>
        ) : (
          <div className="prose dark:prose-invert max-w-none w-full flex flex-col items-center" style={{ color: '#FFFFFF', backgroundColor: 'transparent' }}>
            {finalOutput ? formatMarkdownContent(finalOutput) : <p className="text-center text-muted-foreground p-10 flex items-center justify-center">
              {(isGenerating && currentStage === 'reviewing') && null}
              Waiting for final review...
            </p>}
          </div>
        )}
      </TabsContent>
      {!hideImageVideoTabs ? (
        <>
          <TabsContent value="featured-image" className="mt-0 w-full">
            <FeaturedImageGenerator
              apiKey={apiKey}
              flowTitle={flowTitle}
              flowPurpose={flowPurpose}
              agents={agents}
              finalOutput={finalOutput}
              selectedModel={selectedModel}
              temperature={temperature}
              maxTokens={maxTokens}
              topP={topP}
              setGenerationResult={setGenerationResult}
              onImageStateChange={onImageStateChange}
            />
          </TabsContent>
          <TabsContent value="video-generator" className="mt-0 w-full">
            <VideoScriptGenerator
              apiKey={apiKey}
              flowTitle={flowTitle}
              flowPurpose={flowPurpose}
              agents={agents}
              finalOutput={finalOutput}
              selectedModel={selectedModel}
              temperature={temperature}
              maxTokens={maxTokens}
              topP={topP}
            />
          </TabsContent>
        </>
      ) : null}
    </div>
  );
}

