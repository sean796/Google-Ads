import type { WorkflowStepOutput } from "@/lib/workflow/workflow-types";

export type WorkflowStartRunResult = {
  ok: boolean;
  run?: { id: number; status: string; result?: Record<string, unknown> };
  error?: string;
};

export type SiteAgentRunResult = {
  ok: boolean;
  error?: string;
  defer?: boolean;
  goalMet?: boolean;
  siteId?: string;
  stepOutput?: WorkflowStepOutput;
  archiveOutput?: WorkflowStepOutput | null;
};
