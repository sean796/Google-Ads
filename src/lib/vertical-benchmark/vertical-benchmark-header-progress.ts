import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { BenchmarkPipelineProgress } from "@/lib/vertical-benchmark/vertical-benchmark-pipeline-types";

const GSC_EXPORT_LABEL = "GSC export";
const BULK_CSV_LABEL = "Bulk CSV";

function countDoneSteps(progress: BenchmarkPipelineProgress | null): number {
  if (!progress?.steps?.length) return 0;
  return progress.steps.filter((s) => s.status === "done").length;
}

function activeProgress(args: {
  exporting: boolean;
  generatingBulkTemplate: boolean;
  exportProgress: BenchmarkPipelineProgress | null;
  bulkTemplateProgress: BenchmarkPipelineProgress | null;
}): { progress: BenchmarkPipelineProgress; label: string } | null {
  if (args.bulkTemplateProgress) {
    return { progress: args.bulkTemplateProgress, label: BULK_CSV_LABEL };
  }
  if (args.exportProgress) {
    return { progress: args.exportProgress, label: GSC_EXPORT_LABEL };
  }
  return null;
}

export function buildVerticalBenchmarkMicroSnapshot(args: {
  exporting: boolean;
  generatingBulkTemplate: boolean;
  exportProgress: BenchmarkPipelineProgress | null;
  bulkTemplateProgress: BenchmarkPipelineProgress | null;
}): MetaBulkMicroSnapshot | null {
  const active = activeProgress(args);
  if (!active) return null;

  const { progress, label } = active;
  const total = Math.max(progress.steps.length, 1);
  const completed = countDoneSteps(progress);
  const phase = progress.message.trim();
  const statusMessage =
    phase && phase.toLowerCase() !== label.toLowerCase() ? phase : undefined;
  const progressPct =
    typeof progress.percent === "number" && Number.isFinite(progress.percent)
      ? Math.min(100, Math.max(0, Math.round(progress.percent)))
      : total > 0
        ? Math.round((completed / total) * 100)
        : undefined;

  return {
    label,
    completed,
    total,
    statusMessage,
    progressPct,
  };
}

export function verticalBenchmarkProgressBusy(args: {
  exporting: boolean;
  generatingBulkTemplate: boolean;
}): boolean {
  return args.exporting || args.generatingBulkTemplate;
}
