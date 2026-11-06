import type { Dispatch, SetStateAction } from "react";
import { AgentConfig } from "@/types/agent-config";
import type { GenerationResult } from "@/lib/api";
import type { KeywordData } from "@/lib/keyword-types";

export interface OutputManagerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  output: string; // Now refers to the FINAL output
  isGenerating: boolean;
  currentStage: 'idle' | 'planning' | 'drafting' | 'reviewing' | 'complete' | 'error';
  plan: string;
  draft: string;
  onAbort: () => void; // New prop for aborting generation
}

export interface OutputManagerContentProps {
  output: string; // Now refers to the FINAL output
  isGenerating: boolean;
  currentStage: 'idle' | 'planning' | 'plan_approval_pending' | 'drafting' | 'reviewing' | 'complete' | 'error';
  plan: string;
  draft: string;
  onAbort: () => void; // New prop for aborting generation
  planApprovalStatus?: 'pending' | 'approved' | 'rejected' | null;
  onApprovePlan?: () => void;
  onRejectPlan?: () => void;
  onRetryPlan?: () => void;
  // Plan modification props
  isModifyingPlan?: boolean;
  modificationChecklist?: string[];
  isGeneratingChecklist?: boolean;
  isUpdatingPlan?: boolean;
  onModifyPlan?: () => void;
  onCancelModifyPlan?: () => void;
  onProceedWithModifiedPlan?: () => void;
  setModificationChecklist?: (checklist: string[]) => void;
  setIsGeneratingChecklist?: (isGenerating: boolean) => void;
  setIsUpdatingPlan?: (isUpdating: boolean) => void;
  setGenerationResult?: Dispatch<SetStateAction<GenerationResult>>;
  apiKey?: string;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  flowTitle?: string;
  flowPurpose?: string;
  agents?: AgentConfig[];
  activeKnowledgeBaseText?: string;
  // Keyword research props
  primaryKeywords?: KeywordData[];
  // Final report modification props
  isModifyingFinal?: boolean;
  finalModificationChecklist?: string[];
  isGeneratingFinalChecklist?: boolean;
  isUpdatingFinal?: boolean;
  onModifyFinal?: () => void;
  onCancelModifyFinal?: () => void;
  onProceedWithModifiedFinal?: () => void;
  setFinalModificationChecklist?: (checklist: string[]) => void;
  setIsGeneratingFinalChecklist?: (isGenerating: boolean) => void;
  setIsUpdatingFinal?: (isUpdating: boolean) => void;
  // Draft report modification props
  isModifyingDraft?: boolean;
  draftModificationChecklist?: string[];
  isGeneratingDraftChecklist?: boolean;
  isUpdatingDraft?: boolean;
  onModifyDraft?: () => void;
  onCancelModifyDraft?: () => void;
  onProceedWithModifiedDraft?: () => void;
  setDraftModificationChecklist?: (checklist: string[]) => void;
  setIsGeneratingDraftChecklist?: (isGenerating: boolean) => void;
  setIsUpdatingDraft?: (isUpdating: boolean) => void;
  /** When true, Image / Video tabs are omitted (e.g. Free Flow uses separate sections). */
  hideImageVideoTabs?: boolean;
}

export interface FeaturedImageGeneratorProps {
  apiKey?: string;
  flowTitle?: string;
  flowPurpose?: string;
  agents?: AgentConfig[];
  finalOutput?: string;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
  setGenerationResult?: Dispatch<SetStateAction<GenerationResult>>;
  /** When true, skip the in-body title block (unified Generator chrome carries context). */
  hideHeader?: boolean;
}

export interface VideoScriptGeneratorProps {
  apiKey?: string;
  flowTitle?: string;
  flowPurpose?: string;
  agents?: AgentConfig[];
  finalOutput?: string;
  selectedModel?: string;
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

