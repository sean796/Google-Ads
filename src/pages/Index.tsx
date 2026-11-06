import { useState, useCallback, useRef, useEffect, useLayoutEffect } from "react";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_BLUEPRINT_RESET_SUCCESSFUL_READY_FOR_A_N, NOTIFY_DRAFT_IS_INVALID_OR_USES_A_RETIRED_FORMA, NOTIFY_DRAFT_RECOVERED_SUCCESSFULLY, NOTIFY_WORKSPACE_RESET_SUCCESSFUL_ALL_CACHE_CLE, notifyXAttachedFileSMissingUploadViaKb } from "@/lib/notify-messages";
import {
  loadApiKey,
  saveApiKey,
  GenerationResult,
} from "../lib/api";
import { useBlueprintManagement, BlueprintData } from "../hooks/use-blueprint-management";
import { useFlowFreeformGeneration } from "../hooks/use-flow-freeform-generation";
import { flowFreeformSectionsToAgents } from "@/lib/flow-freeform/flow-freeform-types";
import type { FlowFreeformClarifyQuestion, FlowFreeformSectionPlan } from "@/lib/flow-freeform/flow-freeform-types";
import { ManagerWorkspace } from "@/components/manager/ManagerWorkspace";
import type { WordPressSite } from "@/components/integrations/types";
import type { GeneratorFreeFlowBindings } from "@/components/generator/generator-free-flow-bindings";
import { NeoPulseAppBrand } from "@/components/manager/NeoPulseAppBrand";
import { ManagerAppFooter } from "@/components/manager/ManagerAppFooter";
import {
  readStoredManagerSettingsCluster,
  writeStoredManagerSettingsCluster,
  type ManagerSettingsClusterId,
} from "@/components/manager/manager-settings-cluster";
import { executeAssistNavigation } from "@/lib/pulse-assist/navigation";
import { registerAgentRunOptimizerNavigation, useAgentRunOptimizerScope } from "@/contexts/agent-run-optimizer-scope-context";
import { useTeam } from "@/contexts/TeamContext";
import { fetchAgentRun } from "@/lib/agent-runs-api";
import {
  isAgentRunOptimizerPath,
  parseAgentRunIdFromPath,
  parseGeneratorSectionFromPath,
  writeGeneratorSectionPath,
} from "@/lib/agent-runs/agent-run-optimizer-url";
import { managerTabFromPathname, managerTabPath } from "@/lib/manager-tab-routes";
import { registerAppNavigate } from "@/lib/app-navigation";
import { reassembleChunkedFiles } from "../lib/utils";
import { DEFAULT_THEME_PRIMARY_HEX } from "../lib/theme-defaults";
import { StoredFile } from "../components/KnowledgeBaseTab";
import { useAutosave, loadDraft, clearDraft, hasDraft } from "../hooks/use-autosave";
import { applyPrimaryHexToDocument, initPrimaryColorFromStorage } from "../hooks/use-persisted-color";
import {
  type BlogGeneratorSectionId,
  coerceBlogGeneratorSectionId,
  readStoredBlogGeneratorSection,
  writeStoredBlogGeneratorSection,
} from "@/components/blog-generator/blog-generator-sections";
import { writeStoredStudioEditorMode } from "@/components/keyword-research/bulk/studio-editor-modes";
import { useLocation, useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { prefetchOrganicDashboardBundle } from "@/lib/organic-dashboard/organic-dashboard-prefetch";
import { resolveOrganicDashboardSite } from "@/lib/organic-dashboard/resolve-organic-dashboard-site";
import {
  NEO_PULSE_OPEN_ORGANIC_REPORTING_EVENT,
  ORGANIC_REPORTING_MANAGER_TAB,
  type OpenOrganicReportingDetail,
} from "@/lib/organic-dashboard/organic-reporting-nav";
import { DraftRecoveryDialog } from "../components/DraftRecoveryDialog";
import { useGenerationProgress } from "../hooks/use-generation-progress";
import { GenerationProgress } from "../components/GenerationProgress";
// Import to ensure NAP auto-trigger initializes on page load
import "@/lib/knowledge-graph-auto-trigger";
import {
  NEO_PULSE_LLM_MAX_TOKENS_KEY,
  NEO_PULSE_LLM_TEMPERATURE_KEY,
  NEO_PULSE_LLM_TOP_P_KEY,
  readStoredLlmNumberForIndex,
} from "@/lib/manager-cloud-settings-snapshot";
import { DEFAULT_SETTINGS } from "@/lib/optimization-settings-defaults";
import { DEFAULT_IMAGE_MODEL } from "@/lib/image-model-defaults";
import {
  readGlobalAdsAgentModel,
  readGlobalBlogAgentModel,
  readGlobalImageAgentModel,
  readGlobalMetaAgentModel,
  readGlobalReportAgentModel,
  readGlobalResearchAgentModel,
  writeGlobalAdsAgentModel,
  writeGlobalBlogAgentModel,
  writeGlobalImageAgentModel,
  writeGlobalMetaAgentModel,
  writeGlobalReportAgentModel,
  writeGlobalResearchAgentModel,
} from "@/lib/global-agent-models";
import { NEO_PULSE_OPEN_MASTER_RULES_EVENT } from "@/lib/open-master-rules-settings";
import { isApiTabPath } from "@/lib/api-docs/api-docs-route";
import { isPulseForgePath, parsePulseForgeRoute, setPulseForgeRoute } from "@/lib/pulse-forge/pulse-forge-route";
import { isPulseHostPath } from "@/lib/hosting/pulse-host-route";

const OPENROUTER_API_KEY_STORAGE_KEY = "openrouter-api-key";

const DEFAULT_BLOG_MODEL = DEFAULT_SETTINGS.model;
const DEFAULT_TEMPERATURE = 1.57;
// Keep this comfortably under typical OpenRouter/model context limits
const DEFAULT_MAX_TOKENS = 5000000;
const DEFAULT_TOP_P = 0.90;

const INITIAL_GENERATION_RESULT: GenerationResult = {
  plan: "",
  draft: "",
  final: "",
  currentStage: "idle",
  isGenerating: false,
  planApproved: undefined,
};

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

  const [managerDashboardCluster, setManagerDashboardCluster] = useState<ManagerSettingsClusterId>(() =>
    readStoredManagerSettingsCluster(),
  );

  const handleManagerDashboardClusterChange = useCallback((id: ManagerSettingsClusterId) => {
    setManagerDashboardCluster(id);
    writeStoredManagerSettingsCluster(id);
  }, []);

  useEffect(() => {
    const onOpenMasterRules = () => {
      navigate("/dashboard");
      handleManagerDashboardClusterChange("master-rules");
    };
    window.addEventListener(NEO_PULSE_OPEN_MASTER_RULES_EVENT, onOpenMasterRules as EventListener);
    return () => {
      window.removeEventListener(NEO_PULSE_OPEN_MASTER_RULES_EVENT, onOpenMasterRules as EventListener);
    };
  }, [handleManagerDashboardClusterChange, navigate]);

  const handleManagerTabChange = useCallback(
    (tab: string) => {
      if (tab === "vertical-benchmarks") {
        clearAgentRunOptimizerScope();
        writeStoredStudioEditorMode("vertical-benchmarks");
        writeStoredBlogGeneratorSection("bulk-prompt");
        navigate("/generator/bulk-prompt");
        return;
      }
      if (tab !== "generator") {
        clearAgentRunOptimizerScope();
      }
      if (tab === "generator") {
        navigate(managerTabPath("generator", readStoredBlogGeneratorSection()));
        return;
      }
      if (tab === "api") {
        navigate(isApiTabPath(location.pathname) ? location.pathname : "/api");
        return;
      }
      if (tab === "pulse-forge") {
        navigate(isPulseForgePath(location.pathname) ? location.pathname : "/pulse-forge/forge");
        return;
      }
      if (tab === "pulse-host") {
        navigate(isPulseHostPath(location.pathname) ? location.pathname : "/pulse-host");
        return;
      }
      navigate(managerTabPath(tab));
    },
    [clearAgentRunOptimizerScope, navigate, location.pathname]
  );

  const handleNavigateToSapGenerator = useCallback(
    (site: WordPressSite, _sitemapUrl: string) => {
      if (site?.id) {
        setActiveWordPressSiteId(site.id);
      }
      handleManagerTabChange("local-dominator");
    },
    [setActiveWordPressSiteId, handleManagerTabChange]
  );

  const openOrganicReportingTab = useCallback(
    (siteId: string) => {
      const enabled = sites.filter((s) => s.enabled !== false);
      const site = enabled.find((s) => s.id === siteId);
      if (!site) return;
      prefetchOrganicDashboardBundle(queryClient, site);
      setActiveWordPressSiteId(site.id);
      handleManagerTabChange(ORGANIC_REPORTING_MANAGER_TAB);
    },
    [sites, queryClient, setActiveWordPressSiteId, handleManagerTabChange],
  );

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<OpenOrganicReportingDetail>).detail;
      if (detail?.siteId) openOrganicReportingTab(detail.siteId);
    };
    window.addEventListener(NEO_PULSE_OPEN_ORGANIC_REPORTING_EVENT, onOpen);
    return () => window.removeEventListener(NEO_PULSE_OPEN_ORGANIC_REPORTING_EVENT, onOpen);
  }, [openOrganicReportingTab]);

  const navigateToOrganicReporting = useCallback(() => {
    const enabled = sites.filter((s) => s.enabled !== false);
    const site =
      (activeWordPressSiteId
        ? enabled.find((s) => s.id === activeWordPressSiteId)
        : undefined) ?? enabled[0];
    if (site) {
      openOrganicReportingTab(site.id);
      return;
    }
    handleManagerDashboardClusterChange("properties");
    handleManagerTabChange("dashboard");
  }, [
    sites,
    activeWordPressSiteId,
    openOrganicReportingTab,
    handleManagerDashboardClusterChange,
    handleManagerTabChange,
  ]);

  const navigateToGeneratorSection = useCallback(
    (section: BlogGeneratorSectionId, options?: { keepAgentScope?: boolean }) => {
      const coerced = coerceBlogGeneratorSectionId(section);
      try {
        writeStoredBlogGeneratorSection(coerced);
      } catch {
        /* ignore */
      }
      if (!options?.keepAgentScope) {
        clearAgentRunOptimizerScope();
        writeGeneratorSectionPath(coerced);
      }
    },
    [clearAgentRunOptimizerScope],
  );

  const syncAgentRunScopeFromPath = useCallback(async () => {
    const runId = parseAgentRunIdFromPath(location.pathname);
    if (runId && teamId) {
      const section = parseGeneratorSectionFromPath(location.pathname);
      if (section) {
        const coerced = coerceBlogGeneratorSectionId(section);
        if (readStoredBlogGeneratorSection() !== coerced) {
          try {
            writeStoredBlogGeneratorSection(coerced);
          } catch {
            /* ignore */
          }
        }
      }
      if (agentRunOptimizerScope?.runId === runId) {
        return;
      }
      const run = await fetchAgentRun(teamId, runId);
      if (run) {
        hydrateScopeFromRun(run);
        return;
      }
    }
    if (!isAgentRunOptimizerPath(location.pathname)) {
      clearAgentRunOptimizerScope();
    }
  }, [
    location.pathname,
    teamId,
    hydrateScopeFromRun,
    clearAgentRunOptimizerScope,
    agentRunOptimizerScope?.runId,
  ]);

  useLayoutEffect(() => {
    void syncAgentRunScopeFromPath();
  }, [syncAgentRunScopeFromPath]);

  useEffect(() => {
    registerAgentRunOptimizerNavigation({
      onManagerTabChange: handleManagerTabChange,
      onGeneratorSectionChange: (section, options) =>
        navigateToGeneratorSection(section as BlogGeneratorSectionId, options),
    });
    return () => registerAgentRunOptimizerNavigation(null);
  }, [handleManagerTabChange, navigateToGeneratorSection]);

  const handleAssistNavigate = useCallback(
    (target: Parameters<typeof executeAssistNavigation>[0]) => {
      executeAssistNavigation(target, {
        onManagerTabChange: handleManagerTabChange,
        onGeneratorSectionChange: (section) =>
          navigateToGeneratorSection(section as BlogGeneratorSectionId),
        onDashboardClusterChange: (cluster) =>
          handleManagerDashboardClusterChange(cluster as ManagerSettingsClusterId),
        onPulseForgeHash: (hash) => {
          const body = hash.replace(/^#/, "").replace(/^\//, "");
          setPulseForgeRoute(parsePulseForgeRoute(`/${body}`));
        },
        onOrganicReporting: navigateToOrganicReporting,
      });
    },
    [
      handleManagerTabChange,
      navigateToGeneratorSection,
      handleManagerDashboardClusterChange,
      navigateToOrganicReporting,
    ],
  );

  const [knowledgeFiles, setKnowledgeFiles] = useState<StoredFile[]>([]);
  const [manualKnowledgeText, setManualKnowledgeText] = useState(""); // Manual from KB profiles
  const [activeKnowledgeBaseText, setActiveKnowledgeBaseText] = useState(""); // Combined for RAG
  const [flowTitle, setFlowTitle] = useState("");
  const [flowFreeformUserPrompt, setFlowFreeformUserPrompt] = useState("");
  const [flowFreeformClarificationAnswers, setFlowFreeformClarificationAnswers] = useState<Record<string, string>>({});
  const [flowFreeformSections, setFlowFreeformSections] = useState<FlowFreeformSectionPlan[]>([]);
  const [flowFreeformClarifyQuestions, setFlowFreeformClarifyQuestions] = useState<FlowFreeformClarifyQuestion[] | null>(null);
  const [flowSectionBodies, setFlowSectionBodies] = useState<Record<string, string>>({});
  const [agentResearchModel, setAgentResearchModelState] = useState(() => readGlobalResearchAgentModel());
  const [agentImageModel, setAgentImageModelState] = useState(() => readGlobalImageAgentModel());
  const [agentMetaModel, setAgentMetaModelState] = useState(() => readGlobalMetaAgentModel());
  const [agentReportModel, setAgentReportModelState] = useState(() => readGlobalReportAgentModel());
  const [agentAdsModel, setAgentAdsModelState] = useState(() => readGlobalAdsAgentModel());
  const [selectedModel, setSelectedModelState] = useState(() => readGlobalBlogAgentModel());

  const setAgentResearchModel = useCallback((model: string) => {
    writeGlobalResearchAgentModel(model);
    setAgentResearchModelState(model);
  }, []);
  const setAgentImageModel = useCallback((model: string) => {
    writeGlobalImageAgentModel(model);
    setAgentImageModelState(model);
  }, []);
  const setAgentMetaModel = useCallback((model: string) => {
    writeGlobalMetaAgentModel(model);
    setAgentMetaModelState(model);
  }, []);
  const setAgentReportModel = useCallback((model: string) => {
    writeGlobalReportAgentModel(model);
    setAgentReportModelState(model);
  }, []);
  const setAgentAdsModel = useCallback((model: string) => {
    writeGlobalAdsAgentModel(model);
    setAgentAdsModelState(model);
  }, []);
  const setSelectedModel = useCallback((model: string) => {
    writeGlobalBlogAgentModel(model);
    setSelectedModelState(model);
  }, []);
  const [temperature, setTemperature] = useState(() =>
    readStoredLlmNumberForIndex(NEO_PULSE_LLM_TEMPERATURE_KEY, DEFAULT_TEMPERATURE),
  );
  const [maxTokens, setMaxTokens] = useState(() =>
    readStoredLlmNumberForIndex(NEO_PULSE_LLM_MAX_TOKENS_KEY, DEFAULT_MAX_TOKENS),
  );
  const [topP, setTopP] = useState(() => readStoredLlmNumberForIndex(NEO_PULSE_LLM_TOP_P_KEY, DEFAULT_TOP_P));
  const agentsForOutput = flowFreeformSectionsToAgents(flowFreeformSections);
  const [showDraftRecovery, setShowDraftRecovery] = useState(false);
  const [draftToRecover, setDraftToRecover] = useState<ReturnType<typeof loadDraft>>(null);
  // Removed: const [showInspectBlueprint, setShowInspectBlueprint] = useState(false);

  const [generationResult, setGenerationResult] = useState<GenerationResult>(
    INITIAL_GENERATION_RESULT
  );
  const currentAbortController = useRef<AbortController | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  // Initialize the color state and set the CSS variable globally

  const handleResetBlueprint = () => {
    setFlowTitle("");
    setFlowFreeformUserPrompt("");
    setFlowFreeformClarificationAnswers({});
    setFlowFreeformSections([]);
    setFlowFreeformClarifyQuestions(null);
    setFlowSectionBodies({});

    setGenerationResult(INITIAL_GENERATION_RESULT);
    setIsGenerating(false);

    notify.success(NOTIFY_BLUEPRINT_RESET_SUCCESSFUL_READY_FOR_A_N);
  };

  const handleResetWorkspace = () => {
    // Clear all AI-related cache from localStorage
    localStorage.removeItem("kb_files");
    localStorage.removeItem("kb_profiles");
    localStorage.removeItem("primaryColor");
    
    // Reset core state
    setFlowTitle("");
    setFlowFreeformUserPrompt("");
    setFlowFreeformClarificationAnswers({});
    setFlowFreeformSections([]);
    setFlowFreeformClarifyQuestions(null);
    setFlowSectionBodies({});

    // Reset Knowledge Base state
    setKnowledgeFiles([]);
    setManualKnowledgeText("");
    setActiveKnowledgeBaseText("");

    // Reset LLM parameters to default
    setAgentResearchModel(DEFAULT_SETTINGS.researchModel);
    setAgentImageModel(DEFAULT_IMAGE_MODEL);
    setAgentMetaModel(DEFAULT_SETTINGS.metaModel);
    setAgentReportModel(DEFAULT_SETTINGS.reportModel);
    setAgentAdsModel(DEFAULT_SETTINGS.adsModel);
    setSelectedModel(DEFAULT_BLOG_MODEL);
    writeGlobalResearchAgentModel(DEFAULT_SETTINGS.researchModel);
    writeGlobalImageAgentModel(DEFAULT_IMAGE_MODEL);
    writeGlobalMetaAgentModel(DEFAULT_SETTINGS.metaModel);
    writeGlobalReportAgentModel(DEFAULT_SETTINGS.reportModel);
    writeGlobalAdsAgentModel(DEFAULT_SETTINGS.adsModel);
    writeGlobalBlogAgentModel(DEFAULT_BLOG_MODEL);
    setTemperature(DEFAULT_TEMPERATURE);
    setMaxTokens(DEFAULT_MAX_TOKENS);
    setTopP(DEFAULT_TOP_P);

    // Reset Generation state
    setGenerationResult(INITIAL_GENERATION_RESULT);
    setIsGenerating(false);

    // Reset API key state (keeps loaded key from local storage)
    setApiKey(loadApiKey());

    applyPrimaryHexToDocument(DEFAULT_THEME_PRIMARY_HEX);

    notify.success(NOTIFY_WORKSPACE_RESET_SUCCESSFUL_ALL_CACHE_CLE);
  };

  const {
    generateBlueprint,
  } = useBlueprintManagement({
    flowTitle,
    knowledgeFiles,
    activeKnowledgeBaseText: manualKnowledgeText,
    flowFreeformUserPrompt,
    flowFreeformClarificationAnswers,
    flowFreeformSections,
    setFlowTitle,
    setKnowledgeFiles,
    setActiveKnowledgeBaseText: setManualKnowledgeText,
    setFlowFreeformUserPrompt,
    setFlowFreeformClarificationAnswers,
    setFlowFreeformSections,
  });

  useEffect(() => {
    initPrimaryColorFromStorage();
  }, []);

  useEffect(() => {
    try {
      writeGlobalResearchAgentModel(agentResearchModel);
      writeGlobalBlogAgentModel(selectedModel);
      writeGlobalImageAgentModel(agentImageModel);
      writeGlobalMetaAgentModel(agentMetaModel);
      writeGlobalReportAgentModel(agentReportModel);
      writeGlobalAdsAgentModel(agentAdsModel);
      localStorage.setItem(NEO_PULSE_LLM_TEMPERATURE_KEY, String(temperature));
      localStorage.setItem(NEO_PULSE_LLM_MAX_TOKENS_KEY, String(maxTokens));
      localStorage.setItem(NEO_PULSE_LLM_TOP_P_KEY, String(topP));
    } catch {
      /* ignore */
    }
  }, [
    agentResearchModel,
    selectedModel,
    agentImageModel,
    agentMetaModel,
    agentReportModel,
    agentAdsModel,
    temperature,
    maxTokens,
    topP,
  ]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("workspace") === "freeflow") {
      navigateToGeneratorSection("flow");
    }
  }, [navigateToGeneratorSection]);


  // Load knowledge base files from localStorage on mount and when updated externally
  useEffect(() => {
const loadKBFiles = () => {
      try {
        const storedFilesString = localStorage.getItem('kb_files') || '[]';
        const storedFiles = JSON.parse(storedFilesString) as StoredFile[];
        setKnowledgeFiles(storedFiles);
} catch (error) {
        console.error('Error loading knowledge base files:', error);
}
    };

    // Load on mount
    loadKBFiles();

    // Listen for custom event when files are added from IntegrationsTab or other components
    const handleKBFilesUpdate = (e: CustomEvent) => {
      if (e.detail?.files) {
        setKnowledgeFiles(e.detail.files);
      } else {
        // If no files in event, reload from localStorage
        loadKBFiles();
      }
    };

    // Listen for storage events (from other tabs/windows)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'kb_files' && e.newValue) {
        try {
          const storedFiles = JSON.parse(e.newValue) as StoredFile[];
          setKnowledgeFiles(storedFiles);
        } catch (error) {
          console.error('Error parsing files from storage event:', error);
        }
      }
    };

    window.addEventListener('kb-files-updated', handleKBFilesUpdate as EventListener);
    window.addEventListener('storage', handleStorageChange);

    return () => {
      window.removeEventListener('kb-files-updated', handleKBFilesUpdate as EventListener);
      window.removeEventListener('storage', handleStorageChange);
    };
  }, []);

  useAutosave({
    flowTitle,
    draftStructureKey: flowFreeformSections.length,
    knowledgeFiles,
    activeKnowledgeBaseText: manualKnowledgeText,
    generateBlueprint,
    enabled: !isGenerating,
  });

  useEffect(() => {
    if (hasDraft() && flowFreeformSections.length === 0) {
      const draft = loadDraft();
      if (draft) {
        const secCount = draft.blueprint?.flowFreeform?.sections?.length ?? 0;
        if (secCount > 0 || (draft.blueprint?.flowFreeform?.userPrompt?.trim()?.length ?? 0) > 0) {
          setDraftToRecover(draft);
          setShowDraftRecovery(true);
        } else {
          clearDraft();
        }
      }
    }
  }, [flowFreeformSections.length]);

  // Combine manual + files for full RAG (triggers on load after setKnowledgeFiles + setManualKnowledgeText(''))
  useEffect(() => {
    // Use the reassembly function to correctly group and order file contents before joining
    const fileContents = reassembleChunkedFiles(knowledgeFiles);
    const combined = [manualKnowledgeText, fileContents].filter(Boolean).join('\n\n---\n\n');
    setActiveKnowledgeBaseText(combined); // On load: '' + file contents = files for RAG
  }, [manualKnowledgeText, knowledgeFiles]);

  const flowFreeformGen = useFlowFreeformGeneration({
    apiKey,
    selectedModel,
    flowTitle,
    flowPurpose: "",
    activeKnowledgeBaseText,
    userGoalPrompt: flowFreeformUserPrompt,
    clarificationAnswers: flowFreeformClarificationAnswers,
    setFlowTitle,
    setUserGoalPrompt: setFlowFreeformUserPrompt,
    setClarificationQuestions: setFlowFreeformClarifyQuestions,
    setSections: setFlowFreeformSections,
    setSectionBodies: setFlowSectionBodies,
    currentAbortController,
    setIsGenerating,
    setGenerationResult,
  });

  // Generation progress tracking
  const progressMetrics = useGenerationProgress({
    currentStage: generationResult.currentStage,
    isGenerating,
  });

  const handleRecoverDraft = useCallback(() => {
    if (!draftToRecover) return;

    const { blueprint } = draftToRecover;

    if (!blueprint || blueprint.blueprintVersion !== 2 || !blueprint.flowFreeform) {
      notify.error(NOTIFY_DRAFT_IS_INVALID_OR_USES_A_RETIRED_FORMA);
      clearDraft();
      setShowDraftRecovery(false);
      setDraftToRecover(null);
      return;
    }

    const recoveredBlueprint = blueprint as BlueprintData;

    const storedFilesString = localStorage.getItem("kb_files") || "[]";
    const storedFiles = JSON.parse(storedFilesString) as StoredFile[];
    const blueprintRefs = recoveredBlueprint.knowledgeFiles || [];
    let missingFiles = 0;
    const matchedFiles = blueprintRefs.map((ref) => {
      const stored = storedFiles.find((f) => f.name === ref.name);
      if (!stored) {
        missingFiles++;
        return { ...ref, content: "" };
      }
      return stored;
    });
    setKnowledgeFiles(matchedFiles);

    if (missingFiles > 0) {
      notify.warning(notifyXAttachedFileSMissingUploadViaKb(missingFiles));
    }

    const fileContents = matchedFiles.map((f) => f.content).filter(Boolean).join("\n\n---\n\n");
    setActiveKnowledgeBaseText(fileContents);

    setFlowTitle(recoveredBlueprint.title || "");
    setFlowFreeformUserPrompt(recoveredBlueprint.flowFreeform.userPrompt || "");
    setFlowFreeformClarificationAnswers(recoveredBlueprint.flowFreeform.clarificationAnswers || {});
    setFlowFreeformSections(recoveredBlueprint.flowFreeform.sections || []);

    clearDraft();
    setShowDraftRecovery(false);
    setDraftToRecover(null);
    navigateToGeneratorSection("flow");
    notify.success(NOTIFY_DRAFT_RECOVERED_SUCCESSFULLY);
  }, [draftToRecover, setKnowledgeFiles, setActiveKnowledgeBaseText, setFlowTitle, navigateToGeneratorSection]);

  const handleDiscardDraft = useCallback(() => {
    clearDraft();
    setShowDraftRecovery(false);
    setDraftToRecover(null);
  }, []);

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
              writeStoredManagerSettingsCluster("properties");
              setManagerDashboardCluster("properties");
              handleManagerTabChange("dashboard");
            }}
          />
        }
        embeddedFooter={
          <ManagerAppFooter
            currentTab={managerTab}
            onTabChange={handleManagerTabChange}
            onDashboardBrandClick={() => {
              writeStoredManagerSettingsCluster("properties");
              setManagerDashboardCluster("properties");
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
