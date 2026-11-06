import type { AgentRunHarnessContext } from "@/lib/agent-runs/harness-registry";
import type { AgentRun, AgentRunStepArtifact } from "@/lib/agent-runs-types";
import { agentRunBrowserPreviewDataUrl } from "@/lib/agent-runs/agent-run-browser-preview";
import { patchAgentRunInList } from "@/lib/agent-runs/agent-runs-local-patch";
import type { BrowserAutomationJobProgress } from "@/lib/browser-automation-api";
import { fetchWorkflowStepOutputs } from "@/lib/workflow/workflow-api";
import { commitProgressDeliverable } from "@/lib/agent-runs/run-browser-automation-deliverables";

async function patchBrowserPreviewLocally(
  runId: number,
  label: string,
  screenshotBase64: string,
  mime = "image/jpeg",
): Promise<void> {
  const artifact: AgentRunStepArtifact = {
    id: "preview-live",
    name: "browser-preview.jpg",
    url: agentRunBrowserPreviewDataUrl(screenshotBase64, mime),
    mime,
  };
  const at = new Date().toISOString();
  patchAgentRunInList(runId, (run) => {
    const steps = run.steps ?? [];
    const idx = steps.findIndex((step) => step.stepKey === "browser_preview");
    if (idx >= 0) {
      const next = [...steps];
      next[idx] = {
        ...steps[idx]!,
        label,
        status: "running",
        payload: { artifacts: [artifact] },
        updatedAt: at,
      };
      return { steps: next };
    }
    return {
      steps: [
        ...steps,
        {
          id: Date.now(),
          stepIndex: steps.length,
          stepKey: "browser_preview",
          label,
          status: "running",
          payload: { artifacts: [artifact] },
          createdAt: at,
          updatedAt: at,
        },
      ],
    };
  });
}

export async function handleAutomationProgress(
  run: AgentRun,
  ctx: AgentRunHarnessContext,
  progress: BrowserAutomationJobProgress,
  state: {
    lastLabel: string;
    lastScreenshot: string | null;
    lastPreviewLabel: string;
    saveLocalArchive: boolean;
    committedDeliverableSignatures: Set<string>;
    workflowOutputs?: Awaited<ReturnType<typeof fetchWorkflowStepOutputs>>;
  },
): Promise<void> {
  const label = progress.label?.trim();
  if (label && label !== state.lastLabel) {
    state.lastLabel = label;
    await ctx.onStep?.(label, "running");
  }

  const screenshot = progress.screenshotBase64?.trim();
  const previewLabel = label || state.lastLabel || "Browser preview";
  const shouldUpdatePreview =
    Boolean(screenshot) &&
    (screenshot !== state.lastScreenshot || previewLabel !== state.lastPreviewLabel);
  if (shouldUpdatePreview && screenshot) {
    state.lastScreenshot = screenshot;
    state.lastPreviewLabel = previewLabel;
    await patchBrowserPreviewLocally(run.id, previewLabel, screenshot);
  }

  if (progress.deliverable) {
    await commitProgressDeliverable(run, progress.deliverable, state);
  }
}
