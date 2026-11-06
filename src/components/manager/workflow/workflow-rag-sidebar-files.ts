import { fetchAgentRunArtifacts } from "@/lib/agent-runs-api";
import { getAgentRunHostedFiles } from "@/lib/agent-runs/agent-run-hosted-files";
import {
  clientDeliverableOutputs,
  groupWorkflowOutputsByClient,
} from "@/lib/workflow/workflow-rag-client";
import { durableWorkflowOutputFileRefs, resolveStepOutputFileRefs } from "@/lib/workflow/workflow-step-file-refs";
import {
  dedupeWorkflowRagFilesByName,
  downloadableCsvFromStepOutput,
  type WorkflowRagDownloadableFile,
} from "@/lib/workflow/workflow-rag-run-files";
import type { WorkflowNode, WorkflowRun, WorkflowStepOutput } from "@/lib/workflow/workflow-types";
import { formatDistanceToNow } from "date-fns";

export type WorkflowRagSidebarProps = {
  teamId: number;
  workflowId: number;
  nodes: WorkflowNode[];
  activeRunId: number | null;
};

export type RagClientSection = {
  siteId: string;
  label: string;
  outputs: WorkflowStepOutput[];
  files: DownloadableFile[];
};

export async function buildClientSections(
  teamId: number,
  outputs: WorkflowStepOutput[],
  nodes: WorkflowNode[],
  clientSiteIds: string[],
  siteNameById: Map<string, string>,
): Promise<RagClientSection[]> {
  const grouped = groupWorkflowOutputsByClient(outputs, clientSiteIds);
  const sections: RagClientSection[] = [];
  for (const siteId of clientSiteIds) {
    const clientOutputs = clientDeliverableOutputs(outputs, nodes, siteId, clientSiteIds);
    const groupedOutputs = grouped.get(siteId) ?? clientOutputs;
    const mergedOutputs = clientOutputs.length > 0 ? clientOutputs : groupedOutputs;
    const fileLists = await Promise.all(mergedOutputs.map((output) => resolveOutputFiles(teamId, output)));
    sections.push({
      siteId,
      label: siteNameById.get(siteId) ?? siteId,
      outputs: mergedOutputs,
      files: dedupeWorkflowRagFilesByName(fileLists.flat()),
    });
  }
  return sections.filter((section) => section.outputs.length > 0 || section.files.length > 0);
}

export type DownloadableFile = WorkflowRagDownloadableFile;

export function formatRunWhen(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return formatDistanceToNow(parsed, { addSuffix: true }).replace(/^about /, "");
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes <= 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function runStatusLabel(status: WorkflowRun["status"]): string {
  return status.replace(/_/g, " ");
}

async function fileHrefSize(href: string): Promise<number | null> {
  if (!href.startsWith("blob:") && !href.startsWith("data:")) return null;
  try {
    const blob = await fetch(href).then((response) => response.blob());
    return blob.size;
  } catch {
    return null;
  }
}

export async function resolveOutputFiles(
  teamId: number,
  output: WorkflowStepOutput,
): Promise<DownloadableFile[]> {
  const outputKey = output.variableKey;
  const label = output.label || output.variableKey;
  const agentRunId = output.agentRunId;

  const durableRefs = durableWorkflowOutputFileRefs(output.fileRefs);
  if (durableRefs.length > 0) {
    return Promise.all(
      durableRefs.map(async (file) => ({
        name: file.name,
        href: file.url!,
        outputKey,
        sizeBytes: await fileHrefSize(file.url!),
      })),
    );
  }

  const fromCsv = downloadableCsvFromStepOutput(output);
  if (fromCsv) {
    return [
      {
        ...fromCsv,
        sizeBytes: (await fileHrefSize(fromCsv.href)) ?? fromCsv.sizeBytes,
      },
    ];
  }

  if (agentRunId) {
    const deliverables = await resolveStepOutputFileRefs(teamId, agentRunId);
    if (deliverables.length > 0) {
      return Promise.all(
        deliverables.map(async (file) => ({
          name: file.name,
          href: file.url,
          outputKey,
          sizeBytes: await fileHrefSize(file.url),
        })),
      );
    }
  }

  const seedRefs = (output.fileRefs ?? []).filter((file) => file.url);
  if (seedRefs.length > 0) {
    return Promise.all(
      seedRefs.map(async (file) => ({
        name: file.name,
        href: file.url!,
        outputKey,
        sizeBytes: await fileHrefSize(file.url!),
      })),
    );
  }

  if (!agentRunId) return [];

  const hosted = getAgentRunHostedFiles(agentRunId);
  if (hosted.length > 0) {
    return Promise.all(
      hosted
        .filter((file) => file.mimeType === "text/csv" || file.name.toLowerCase().endsWith(".csv"))
        .map(async (file) => ({
          name: file.name,
          href: file.href,
          outputKey,
          sizeBytes: await fileHrefSize(file.href),
        })),
    );
  }

  const artifacts = await fetchAgentRunArtifacts(teamId, agentRunId);
  return Promise.all(
    artifacts
      .filter((file) => file.url && /^https?:\/\//i.test(file.url))
      .filter(
        (file) =>
          file.stepKey === "grid_export" ||
          file.stepKey === "grid_csv_input" ||
          file.stepKey === "grid_summary_md" ||
          file.stepKey === "entity_wiki_picks" ||
          file.stepKey === "entity_hydrated_rows" ||
          file.stepKey === "gsc_reporting" ||
          file.mime === "text/csv" ||
          file.mime === "text/markdown" ||
          file.name.toLowerCase().endsWith(".csv") ||
          file.name.toLowerCase().endsWith(".md"),
      )
      .map(async (file) => ({
        name: file.name || label,
        href: file.url,
        outputKey,
        sizeBytes: await fileHrefSize(file.url),
      })),
  );
}
