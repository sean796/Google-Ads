import { fetchAgentRunCsvContent } from "@/lib/agent-runs-api";
import { fetchWorkflowStepOutputs } from "@/lib/workflow/workflow-api";
import type { WorkflowStepOutput, WorkflowStepOutputFileRef } from "@/lib/workflow/workflow-types";

function isEntityCsvFileRef(file: WorkflowStepOutputFileRef): boolean {
  const name = file.name?.trim().toLowerCase() ?? "";
  const mime = file.mime?.trim().toLowerCase() ?? "";
  if (name === "entity-bulk.csv" || name === "entity-hydrated.csv") return true;
  return mime === "text/csv" || name.endsWith(".csv");
}

function pickEntityCsvAgentRunId(
  outputs: WorkflowStepOutput[],
  ragInputKeys?: string[],
): number | undefined {
  const runScoped = outputs.filter((output) => output.scope === "run");

  const tryPick = (list: WorkflowStepOutput[]): number | undefined => {
    for (const output of list) {
      const hasBulk = (output.fileRefs ?? []).some(
        (file) => file.url && file.name?.trim().toLowerCase() === "entity-bulk.csv",
      );
      if (hasBulk && output.agentRunId) return output.agentRunId;
    }
    for (const output of list) {
      const hasCsv = (output.fileRefs ?? []).some((file) => file.url && isEntityCsvFileRef(file));
      if (hasCsv && output.agentRunId) return output.agentRunId;
    }
    return undefined;
  };

  if (ragInputKeys && ragInputKeys.length > 0) {
    const keySet = new Set(ragInputKeys);
    const matched = runScoped.filter((output) => keySet.has(output.variableKey));
    const fromKeys = tryPick(matched);
    if (fromKeys) return fromKeys;
  }

  return tryPick(runScoped);
}

function pickEntityCsvUrlFromOutputs(
  outputs: WorkflowStepOutput[],
  ragInputKeys?: string[],
): string | undefined {
  const runScoped = outputs.filter((output) => output.scope === "run");

  const tryPick = (list: WorkflowStepOutput[]): string | undefined => {
    for (const output of list) {
      const csvRef = (output.fileRefs ?? []).find(
        (file) => file.url && file.name?.trim().toLowerCase() === "entity-bulk.csv",
      );
      if (csvRef?.url) return csvRef.url;
    }
    for (const output of list) {
      const csvRef = (output.fileRefs ?? []).find((file) => file.url && isEntityCsvFileRef(file));
      if (csvRef?.url) return csvRef.url;
    }
    return undefined;
  };

  if (ragInputKeys && ragInputKeys.length > 0) {
    const keySet = new Set(ragInputKeys);
    const matched = runScoped.filter((output) => keySet.has(output.variableKey));
    const fromKeys = tryPick(matched);
    if (fromKeys) return fromKeys;
  }

  return tryPick(runScoped);
}

function pickEntityCsvUrl(outputs: WorkflowStepOutput[], ragInputKeys?: string[]): string {
  const url = pickEntityCsvUrlFromOutputs(outputs, ragInputKeys);
  if (url) return url;
  throw new Error("Upstream Entity Generator did not produce an entity CSV.");
}

export async function resolveUpstreamEntityCsvFromWorkflow(args: {
  teamId?: number;
  workflowId?: number;
  workflowRunId?: number;
  ragInputKeys?: string[];
}): Promise<string> {
  const teamId = args.teamId;
  const workflowId = args.workflowId;
  const workflowRunId = args.workflowRunId;
  if (!teamId || !workflowId || !workflowRunId) {
    throw new Error("Workflow context is required to resolve upstream entity CSV.");
  }

  const outputs = await fetchWorkflowStepOutputs(teamId, workflowId, workflowRunId);
  const agentRunId = pickEntityCsvAgentRunId(outputs, args.ragInputKeys);
  if (!agentRunId) {
    throw new Error("Upstream Entity Generator did not produce an entity CSV.");
  }

  const csvText = await fetchAgentRunCsvContent(teamId, agentRunId);
  if (!csvText) {
    throw new Error("Entity CSV is not available from the upstream agent run.");
  }

  return csvText;
}

export function resolveUpstreamEntityCsvUrlFromOutputs(
  outputs: WorkflowStepOutput[],
  ragInputKeys?: string[],
): string {
  return pickEntityCsvUrl(outputs, ragInputKeys);
}
