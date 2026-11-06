import { useRef } from "react";
import { logger } from "@/lib/logger";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_BLUEPRINT_DELETED_SUCCESSFULLY, NOTIFY_BLUEPRINT_DOWNLOADED, NOTIFY_BLUEPRINT_LOADED_KB_FILES_MATCHED_FOR_RA, NOTIFY_FAILED_TO_PARSE_JSON_FILE, NOTIFY_INVALID_BLUEPRINT_FLOW_V2_JSON_REQUIRED_, NOTIFY_PLEASE_SELECT_A_VALID_JSON_FILE, NOTIFY_THIS_BLUEPRINT_USES_A_RETIRED_FORMAT_CRE, notifyBlueprintXSavedSuccessfully, notifyXAttachedFileSMissingUploadViaKb } from "@/lib/notify-messages";
import { StoredFile } from "@/components/KnowledgeBaseTab";
import type { KeywordData } from "@/lib/keyword-types";
import type { FlowFreeformSectionPlan } from "@/lib/flow-freeform/flow-freeform-types";
import { FLOW_BLUEPRINT_VERSION } from "@/lib/flow-freeform/flow-freeform-types";

export interface KnowledgeFileRef {
  name: string;
  size: number;
  starred: boolean;
  timestamp: number;
}

export interface BlueprintData {
  title: string;
  purpose: string;
  knowledgeFiles: KnowledgeFileRef[];
  timestamp: string;
  blueprintVersion: typeof FLOW_BLUEPRINT_VERSION;
  flowFreeform: {
    userPrompt: string;
    clarificationAnswers: Record<string, string>;
    sections: FlowFreeformSectionPlan[];
  };
  primaryKeywords?: KeywordData[];
  targetKeyword?: string;
  keywordDifficulty?: number;
  searchIntent?: "informational" | "commercial" | "transactional" | "navigational";
  semanticKeywords?: string[];
}

export interface StoredBlueprint extends BlueprintData {
  id: string;
  nodeCount: number;
}

const BLUEPRINT_STORAGE_KEY = "stored-blueprints";

export function getStoredBlueprints(): StoredBlueprint[] {
  try {
    const stored = localStorage.getItem(BLUEPRINT_STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored) as StoredBlueprint[];
    }
  } catch (e) {
    logger.error("Failed to load blueprints from local storage:", e);
  }
  return [];
}

export function saveBlueprints(blueprints: StoredBlueprint[]): void {
  try {
    localStorage.setItem(BLUEPRINT_STORAGE_KEY, JSON.stringify(blueprints));
  } catch (e) {
    logger.error("Failed to save blueprints to local storage:", e);
  }
}

export function saveCurrentBlueprint(blueprint: BlueprintData, nodeCount: number): void {
  const allBlueprints = getStoredBlueprints();
  const newBlueprint: StoredBlueprint = {
    id: `bp-${Date.now()}`,
    nodeCount,
    ...blueprint,
  };
  saveBlueprints([newBlueprint, ...allBlueprints]);
  notify.success(notifyBlueprintXSavedSuccessfully(blueprint.title));
}

export function deleteBlueprint(id: string): void {
  const allBlueprints = getStoredBlueprints();
  const updatedBlueprints = allBlueprints.filter((bp) => bp.id !== id);
  saveBlueprints(updatedBlueprints);
  notify.success(NOTIFY_BLUEPRINT_DELETED_SUCCESSFULLY);
}

export function importAndSaveBlueprintFromFile(file: File): void {
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const jsonContent = e.target?.result as string;
      const blueprint = JSON.parse(jsonContent);

      if (
        !blueprint ||
        !blueprint.title ||
        blueprint.purpose == null ||
        blueprint.blueprintVersion !== FLOW_BLUEPRINT_VERSION ||
        !blueprint.flowFreeform ||
        !Array.isArray(blueprint.flowFreeform.sections)
      ) {
        notify.error(NOTIFY_INVALID_BLUEPRINT_FLOW_V2_JSON_REQUIRED_);
        return;
      }

      const nodeCount = blueprint.flowFreeform.sections.length;
      const knowledgeFileRefs = blueprint.knowledgeFiles || [];
      const blueprintData: BlueprintData = {
        ...blueprint,
        knowledgeFiles: knowledgeFileRefs,
        timestamp: new Date().toISOString(),
      };

      saveCurrentBlueprint(blueprintData, nodeCount);
    } catch (error) {
      notify.error(NOTIFY_FAILED_TO_PARSE_JSON_FILE);
      logger.error("Import error:", error);
    }
  };
  reader.readAsText(file);
}

type SetState<T> = React.Dispatch<React.SetStateAction<T>>;

interface BlueprintManagementProps {
  flowTitle: string;
  knowledgeFiles: StoredFile[];
  activeKnowledgeBaseText: string;
  flowFreeformUserPrompt: string;
  flowFreeformClarificationAnswers: Record<string, string>;
  flowFreeformSections: FlowFreeformSectionPlan[];
  setFlowTitle: SetState<string>;
  setKnowledgeFiles: SetState<StoredFile[]>;
  setActiveKnowledgeBaseText: SetState<string>;
  setFlowFreeformUserPrompt: SetState<string>;
  setFlowFreeformClarificationAnswers: SetState<Record<string, string>>;
  setFlowFreeformSections: SetState<FlowFreeformSectionPlan[]>;
}

export function useBlueprintManagement({
  flowTitle,
  knowledgeFiles,
  activeKnowledgeBaseText,
  flowFreeformUserPrompt,
  flowFreeformClarificationAnswers,
  flowFreeformSections,
  setFlowTitle,
  setKnowledgeFiles,
  setActiveKnowledgeBaseText,
  setFlowFreeformUserPrompt,
  setFlowFreeformClarificationAnswers,
  setFlowFreeformSections,
}: BlueprintManagementProps) {
  const blueprintFileInputRef = useRef<HTMLInputElement>(null);

  const generateBlueprint = (): BlueprintData => {
    const currentBlueprint = getStoredBlueprints().find((bp) => bp.title === flowTitle);

    return {
      title: flowTitle,
      purpose: "",
      blueprintVersion: FLOW_BLUEPRINT_VERSION,
      flowFreeform: {
        userPrompt: flowFreeformUserPrompt,
        clarificationAnswers: flowFreeformClarificationAnswers,
        sections: flowFreeformSections,
      },
      knowledgeFiles: knowledgeFiles.map((f) => ({
        name: f.name,
        size: f.size,
        starred: f.starred,
        timestamp: f.timestamp,
      })),
      timestamp: new Date().toISOString(),
      primaryKeywords: currentBlueprint?.primaryKeywords,
      targetKeyword: currentBlueprint?.targetKeyword,
      keywordDifficulty: currentBlueprint?.keywordDifficulty,
      searchIntent: currentBlueprint?.searchIntent,
      semanticKeywords: currentBlueprint?.semanticKeywords,
    };
  };

  const loadBlueprint = (blueprint: StoredBlueprint) => {
    processImportedBlueprint(blueprint);
  };

  const handleSaveBlueprint = (customFlowTitle?: string) => {
    const blueprintData = generateBlueprint();
    const nodeCount = flowFreeformSections.length;

    if (customFlowTitle) {
      blueprintData.title = customFlowTitle.trim();
    }

    saveCurrentBlueprint(blueprintData, nodeCount);
  };

  const downloadBlueprint = () => {
    const blueprint = generateBlueprint();
    const blob = new Blob([JSON.stringify(blueprint, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `blueprint-${Date.now()}.json`;
    a.click();
    notify.success(NOTIFY_BLUEPRINT_DOWNLOADED);
  };

  const processImportedBlueprint = (blueprint: unknown) => {
    const b = blueprint as Record<string, unknown>;
    if (
      !b ||
      typeof b.title !== "string" ||
      b.purpose == null ||
      b.blueprintVersion !== FLOW_BLUEPRINT_VERSION ||
      !b.flowFreeform ||
      typeof b.flowFreeform !== "object"
    ) {
      notify.error(NOTIFY_THIS_BLUEPRINT_USES_A_RETIRED_FORMAT_CRE);
      return;
    }

    const ff = b.flowFreeform as {
      userPrompt?: string;
      clarificationAnswers?: Record<string, string>;
      sections?: FlowFreeformSectionPlan[];
    };

    const storedFilesString = localStorage.getItem("kb_files") || "[]";
    const storedFiles = JSON.parse(storedFilesString) as StoredFile[];
    const blueprintRefs = (b.knowledgeFiles as KnowledgeFileRef[]) || [];
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

    setFlowTitle(String(b.title));

    setFlowFreeformUserPrompt(ff.userPrompt ?? "");
    setFlowFreeformClarificationAnswers(ff.clarificationAnswers ?? {});
    setFlowFreeformSections(Array.isArray(ff.sections) ? ff.sections : []);

    notify.success(NOTIFY_BLUEPRINT_LOADED_KB_FILES_MATCHED_FOR_RA);
  };

  const handleImportBlueprint = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== "application/json") {
      notify.error(NOTIFY_PLEASE_SELECT_A_VALID_JSON_FILE);
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const jsonContent = e.target?.result as string;
        const blueprint = JSON.parse(jsonContent);
        processImportedBlueprint(blueprint);
      } catch (error) {
        notify.error(NOTIFY_FAILED_TO_PARSE_JSON_FILE);
        logger.error("Import error:", error);
      }
    };
    reader.readAsText(file);

    if (blueprintFileInputRef.current) {
      blueprintFileInputRef.current.value = "";
    }
  };

  return {
    blueprintFileInputRef,
    generateBlueprint,
    downloadBlueprint,
    handleImportBlueprint,
    handleSaveBlueprint,
    loadBlueprint,
  };
}
