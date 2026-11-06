import { useState, useCallback, useRef, useEffect, type Dispatch, type SetStateAction } from "react";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_BLUEPRINT_RESET_SUCCESSFUL_READY_FOR_A_N, NOTIFY_DRAFT_IS_INVALID_OR_USES_A_RETIRED_FORMA, NOTIFY_DRAFT_RECOVERED_SUCCESSFULLY, NOTIFY_WORKSPACE_RESET_SUCCESSFUL_ALL_CACHE_CLE, notifyXAttachedFileSMissingUploadViaKb } from "@/lib/notify-messages";
import { loadApiKey, type GenerationResult } from "../lib/api";
import { useBlueprintManagement, type BlueprintData } from "../hooks/use-blueprint-management";
import { useFlowFreeformGeneration } from "../hooks/use-flow-freeform-generation";
import { flowFreeformSectionsToAgents } from "@/lib/flow-freeform/flow-freeform-types";
import type { FlowFreeformClarifyQuestion, FlowFreeformSectionPlan } from "@/lib/flow-freeform/flow-freeform-types";
import type { BlogGeneratorSectionId } from "@/components/blog-generator/blog-generator-sections";
import { reassembleChunkedFiles } from "../lib/utils";
import { DEFAULT_THEME_PRIMARY_HEX } from "../lib/theme-defaults";
import type { StoredFile } from "../components/KnowledgeBaseTab";
import { useAutosave, loadDraft, clearDraft, hasDraft } from "../hooks/use-autosave";
import { applyPrimaryHexToDocument, initPrimaryColorFromStorage } from "../hooks/use-persisted-color";
import { useGenerationProgress } from "../hooks/use-generation-progress";
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
import {
  DEFAULT_BLOG_MODEL,
  DEFAULT_MAX_TOKENS,
  DEFAULT_TEMPERATURE,
  DEFAULT_TOP_P,
  INITIAL_GENERATION_RESULT,
} from "./index-page-constants";

type UseIndexFlowWorkspaceArgs = {
  apiKey: string;
  setApiKey: Dispatch<SetStateAction<string>>;
  navigateToGeneratorSection: (section: BlogGeneratorSectionId, options?: { keepAgentScope?: boolean }) => void;
};

export function useIndexFlowWorkspace({
  apiKey,
  setApiKey,
  navigateToGeneratorSection,
}: UseIndexFlowWorkspaceArgs) {
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
        logger.error('Error loading knowledge base files:', error);
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
          logger.error('Error parsing files from storage event:', error);
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

  return {
    knowledgeFiles,
    setKnowledgeFiles,
    manualKnowledgeText,
    setManualKnowledgeText,
    activeKnowledgeBaseText,
    setActiveKnowledgeBaseText,
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
  };
}
