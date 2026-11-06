import type { WordPressSite } from "@/components/integrations/types";
import type { InterpretedSemTask } from "@/lib/sem-task-interpreter";
import type {
  BooleanMapSetter,
  ClusterAnalysisSetter,
  GscQueriesSetter,
} from "@/hooks/content-optimization/bulk-optimization-params";
import type { ImageType } from "@/lib/image-section-analyzer";
export type SemTaskRow = InterpretedSemTask & {
  status: "pending" | "fixing" | "done" | "error";
  changeSummary?: string;
  error?: string;
  /** Per-row checklist completion (one boolean per checklist item) */
  checklistDone: boolean[];
  /** Tech spec prompt sent to AI (for "View prompt" expandable) */
  promptSent?: { system: string; user: string };
};

/** Full-post optimizer (content optimizer flow) with optional SEM task context. SEM fix path returns optimizationChanges. */
export type OnOptimizeContent = (
  site: WordPressSite,
  url: string,
  updateMode: "update" | "draft",
  setGscQueriesForSelection: GscQueriesSetter,
  setIsKeywordSelectionOpen: BooleanMapSetter,
  setGscClusterAnalysis: ClusterAnalysisSetter,
  setIsAnalyzingClusters: BooleanMapSetter,
  skipOnNoGSC: boolean,
  optimizationOptions?: { optimizeTitle?: boolean; optimizeMeta?: boolean; optimizeExcerpt?: boolean; optimizeContent?: boolean },
  inContentImageRequest?: { imageType: ImageType; userPrompt?: string },
  resolvedPost?: { id: number; subtype: string; link?: string; slug?: string; endpoint?: string },
  testMode?: boolean,
  semTaskContext?: { suggestedAction: string; checklist?: string[]; promptModifier?: string; focusCategories?: string[] }
) => Promise<{ optimizationChanges?: Record<string, unknown> } | void | undefined>;

export interface SEMTaskListDialogProps {
  site: WordPressSite;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOptimizeContent: OnOptimizeContent;
  setGscQueriesForSelection: GscQueriesSetter;
  setIsKeywordSelectionOpen: BooleanMapSetter;
  setGscClusterAnalysis: ClusterAnalysisSetter;
  setIsAnalyzingClusters: BooleanMapSetter;
}

export const STATUS_CLASS: Record<SemTaskRow["status"], string> = {
  pending: "text-muted-foreground",
  fixing: "text-primary",
  done: "text-primary",
  error: "text-ui-danger",
};
export const INTERPRET_STATES = ["Interpret list", "Interpreting"] as const;
export const FIX_STATES = ["Fix it (AI Technical Mechanic)", "Fixing"] as const;
export const CELL = "bg-ui-field p-2 text-left align-top text-base";
