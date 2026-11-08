import { useState, useEffect } from "react";
import { loadApiKey, saveApiKey } from "../lib/api";
import { hydrateRuntimeApiKeysFromCloud } from "@/components/integrations/storage";
import { ManagerWorkspace } from "@/components/manager/ManagerWorkspace";
import { NeoPulseAppBrand } from "@/components/manager/NeoPulseAppBrand";
import { ManagerAppFooter } from "@/components/manager/ManagerAppFooter";
import { useTeam } from "@/contexts/TeamContext";
import { managerTabFromPathname } from "@/lib/manager-tab-routes";
import { registerAppNavigate } from "@/lib/app-navigation";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import type { GeneratorFreeFlowBindings } from "@/components/generator/generator-free-flow-bindings";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { useAgentRunOptimizerScope } from "@/contexts/agent-run-optimizer-scope-context";
import { DraftRecoveryDialog } from "../components/DraftRecoveryDialog";
import { GenerationProgress } from "../components/GenerationProgress";
import "@/lib/knowledge-graph-auto-trigger";
import { useIndexManagerNavigation } from "./use-index-manager-navigation";
import { useIndexFlowWorkspace } from "./use-index-flow-workspace";

const Index = () => {
  const { activeTeam } = useTeam();
  const teamId = activeTeam?.id;
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { sites } = useWordPressSites();
  const { activeWordPressSiteId, setActiveWordPressSiteId } = useActiveWordPressSite();
  const { hydrateScopeFromRun, clearAgentRunOptimizerScope, scope: agentRunOptimizerScope } =
    useAgentRunOptimizerScope();
  const [apiKey, setApiKey] = useState<string>(loadApiKey());
  // const [showApiDialog, setShowApiDialog] = useState(false); // Removed
  // const [showKnowledgeBase, setShowKnowledgeBase] = useState(false); // Removed
  const managerTab = managerTabFromPathname(location.pathname);

  useEffect(() => {
    registerAppNavigate(navigate);
    return () => registerAppNavigate(null);
  }, [navigate]);

  useEffect(() => {
    let live = true;
    void hydrateRuntimeApiKeysFromCloud(teamId).then(() => {
      if (live) setApiKey(loadApiKey());
    });
    return () => {
      live = false;
    };
  }, [teamId]);

  const {
    managerDashboardCluster,
    handleManagerDashboardClusterChange,
    handleManagerTabChange,
    handleNavigateToSapGenerator,
    handleAssistNavigate,
    navigateToGeneratorSection,
  } = useIndexManagerNavigation({
    navigate,
    location,
    queryClient,
    sites,
    activeWordPressSiteId,
    setActiveWordPressSiteId,
    teamId,
    hydrateScopeFromRun,
    clearAgentRunOptimizerScope,
    agentRunOptimizerScope,
  });

  const {
    knowledgeFiles,
    setKnowledgeFiles,
    setManualKnowledgeText,
    activeKnowledgeBaseText,
    flowTitle,
    setFlowTitle,
    flowFreeformUserPrompt,
    setFlowFreeformUserPrompt,
    flowFreeformClarificationAnswers,
    setFlowFreeformClarificationAnswers,
    flowFreeformSections,
    setFlowFreeformSections,
    flowFreeformClarifyQuestions,
    agentsForOutput,
    showDraftRecovery,
    draftToRecover,
    generationResult,
    setGenerationResult,
    isGenerating,
    handleResetBlueprint,
    handleResetWorkspace,
    flowFreeformGen,
    progressMetrics,
    handleRecoverDraft,
    handleDiscardDraft,
    agentResearchModel,
    setAgentResearchModel,
    agentImageModel,
    setAgentImageModel,
    agentMetaModel,
    setAgentMetaModel,
    agentReportModel,
    setAgentReportModel,
    agentAdsModel,
    setAgentAdsModel,
    selectedModel,
    setSelectedModel,
    temperature,
    setTemperature,
    maxTokens,
    setMaxTokens,
    topP,
    setTopP,
  } = useIndexFlowWorkspace({
    apiKey,
    setApiKey,
    navigateToGeneratorSection,
  });

  // This useEffect is now redundant and removed since KnowledgeBaseManager handles combination
  // and processImportedBlueprint (in use-blueprint-management.ts) sets activeKnowledgeBaseText directly.
    return (
      <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-background">
      {/* Draft Recovery Dialog */}
      <DraftRecoveryDialog
        open={showDraftRecovery}
        draft={draftToRecover}
        onRecover={handleRecoverDraft}
        onDiscard={handleDiscardDraft}
      />

      <ManagerWorkspace
        variant="embedded"
        embeddedTopBarStart={
          <NeoPulseAppBrand
            variant="default"
            showVersion
            onClick={() => {
              handleManagerDashboardClusterChange("properties");
              handleManagerTabChange("dashboard");
            }}
          />
        }
        embeddedFooter={
          <ManagerAppFooter
            currentTab={managerTab}
            onTabChange={handleManagerTabChange}
            onDashboardBrandClick={() => {
              handleManagerDashboardClusterChange("properties");
              handleManagerTabChange("dashboard");
            }}
          />
        }
        embeddedTopBarProgress={
          isGenerating && !flowFreeformGen.isClarifying ? (
            <GenerationProgress progress={progressMetrics} compact />
          ) : undefined
        }
        onResetBlueprint={handleResetBlueprint}
        onResetWorkspace={handleResetWorkspace}
        managerTab={managerTab}
        onManagerTabChange={handleManagerTabChange}
        onNavigateToSapGenerator={handleNavigateToSapGenerator}
        managerDashboardCluster={managerDashboardCluster}
        onManagerDashboardClusterChange={handleManagerDashboardClusterChange}
        onAssistNavigate={handleAssistNavigate}
        onGeneratorSectionChange={navigateToGeneratorSection}
        currentKBFiles={knowledgeFiles}
        onFilesUpdate={setKnowledgeFiles}
        onManualContentUpdate={setManualKnowledgeText}
        apiKey={apiKey}
        setApiKey={setApiKey}
        saveApiKey={saveApiKey}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        agentResearchModel={agentResearchModel}
        setAgentResearchModel={setAgentResearchModel}
        agentImageModel={agentImageModel}
        setAgentImageModel={setAgentImageModel}
        agentMetaModel={agentMetaModel}
        setAgentMetaModel={setAgentMetaModel}
        agentReportModel={agentReportModel}
        setAgentReportModel={setAgentReportModel}
        agentAdsModel={agentAdsModel}
        setAgentAdsModel={setAgentAdsModel}
        temperature={temperature}
        setTemperature={setTemperature}
        maxTokens={maxTokens}
        setMaxTokens={setMaxTokens}
        topP={topP}
        setTopP={setTopP}
        flowPurpose=""
        freeFlowBindings={{
          flowTitle,
          setFlowTitle,
          apiKey,
          agents: agentsForOutput,
          selectedModel,
          temperature,
          maxTokens,
          topP,
          activeKnowledgeBaseText,
          userGoalPrompt: flowFreeformUserPrompt,
          onUserGoalPromptChange: setFlowFreeformUserPrompt,
          clarificationQuestions: flowFreeformClarifyQuestions,
          clarificationAnswers: flowFreeformClarificationAnswers,
          onClarificationAnswersChange: setFlowFreeformClarificationAnswers,
          flowSections: flowFreeformSections,
          setFlowSections: setFlowFreeformSections,
          isGenerating: isGenerating || flowFreeformGen.isClarifying,
          generationResult,
          onAbort: flowFreeformGen.handleAbort,
          onRunClarify: () => void flowFreeformGen.runClarifyOnly(),
          onEnhancePromptAuto: () => flowFreeformGen.runEnhanceGoalPrompt({ silent: true }),
          onRunOutline: () => void flowFreeformGen.runOutlineOnly(),
          onRunFullReport: () => void flowFreeformGen.runFullPipeline(),
          onRunAllSections: () => void flowFreeformGen.runAllSections(flowFreeformSections),
          onRebuildSection: (plan) => void flowFreeformGen.rebuildOneSection(plan, flowFreeformSections),
          onRebuildAll: () => void flowFreeformGen.rebuildAllSections(flowFreeformSections),
          setGenerationResult,
        } satisfies GeneratorFreeFlowBindings}
      />
      </div>
    );
};

export default Index;
