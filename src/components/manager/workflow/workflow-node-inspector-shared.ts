import type { WordPressSiteOption } from "@/components/manager/tasks/NewProjectDialog";
import type { WorkflowStepTestResult } from "@/lib/workflow/workflow-step-test";
import type { TaskExecutionKind } from "@/lib/tasks-types";
import type {
  WorkflowEdge,
  WorkflowNode,
  WorkflowRagArchiveDeliverableScope,
  WorkflowRagVariable,
} from "@/lib/workflow/workflow-types";

export type WorkflowNodeInspectorProps = {
  node: WorkflowNode | null;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  ragVariables: WorkflowRagVariable[];
  sites: WordPressSiteOption[];
  stepTestResult?: WorkflowStepTestResult | null;
  testingStepId?: string | null;
  onTestStep?: (nodeId: string) => void;
  onChange: (node: WorkflowNode) => void;
  clientsMenuOpen?: boolean;
  onClientsMenuOpenChange?: (open: boolean) => void;
};

export const RAG_ARCHIVE_DELIVERABLE_OPTIONS: Array<{
  value: WorkflowRagArchiveDeliverableScope;
  label: string;
}> = [
  { value: "final", label: "Final deliverable" },
  { value: "all", label: "All files" },
];

export const EXECUTION_KINDS: TaskExecutionKind[] = [
  "content_optimizer_meta",
  "content_optimizer",
  "gsc_reporting",
  "ads_reporting",
  "post_creator",
  "entity_page_creator",
  "entity_generator",
  "sap_generator",
  "local_dominator_export",
  "chatgpt_website_audit",
  "dfs_llm_article_audit",
  "browser_automation",
  "content_gap_check",
];

