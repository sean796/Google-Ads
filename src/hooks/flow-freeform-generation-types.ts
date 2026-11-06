import type { GenerationResult } from "@/lib/api";
import type { FlowFreeformClarifyQuestion, FlowFreeformSectionPlan } from "@/lib/flow-freeform/flow-freeform-types";

export type SetGen = React.Dispatch<React.SetStateAction<GenerationResult>>;

export interface UseFlowFreeformGenerationArgs {
  apiKey: string;
  selectedModel: string;
  flowTitle: string;
  flowPurpose: string;
  activeKnowledgeBaseText: string;
  userGoalPrompt: string;
  clarificationAnswers: Record<string, string>;
  setFlowTitle: (title: string) => void;
  setUserGoalPrompt: (prompt: string) => void;
  setClarificationQuestions: (q: FlowFreeformClarifyQuestion[] | null) => void;
  setSections: React.Dispatch<React.SetStateAction<FlowFreeformSectionPlan[]>>;
  setSectionBodies: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  currentAbortController: React.MutableRefObject<AbortController | null>;
  setIsGenerating: React.Dispatch<React.SetStateAction<boolean>>;
  setGenerationResult: SetGen;
}
