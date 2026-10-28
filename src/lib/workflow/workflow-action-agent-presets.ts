import { ensureContentGapCheckPayload } from "@/lib/content-gap/resolve-content-gap-count";
import type { TaskExecutionKind, TaskExecutionPayload } from "@/lib/tasks-types";

export type WorkflowActionAgentPreset = {
  id: string;
  label: string;
  description: string;
  executionKind: TaskExecutionKind;
  buildPayload?: () => TaskExecutionPayload;
};

export const WORKFLOW_ACTION_AGENT_PRESETS: WorkflowActionAgentPreset[] = [
  {
    id: "residential-browser-automation",
    label: "Residential browser automation",
    description: "Browse a URL via Oxylabs residential proxy with live preview",
    executionKind: "browser_automation",
    buildPayload: () => ({
      saveLocalArchive: true,
      saveToDisk: true,
      targetUrl: "",
      browserInstructionsHtml: "",
    }),
  },
  {
    id: "content-gap-check",
    label: "Content gap check",
    description: "Count posts or SAP against a target before creating content",
    executionKind: "content_gap_check",
    buildPayload: () =>
      ensureContentGapCheckPayload({
        contentGapUseEditorialPackage: true,
        contentGapSitemapSource: "posts",
      }),
  },
];

export function workflowActionAgentPresetById(presetId: string): WorkflowActionAgentPreset | undefined {
  return WORKFLOW_ACTION_AGENT_PRESETS.find((preset) => preset.id === presetId);
}
