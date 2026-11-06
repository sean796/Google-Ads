import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { AdsReportingPipelineProgress } from "@/lib/ads-reporting/ads-reporting-types";

export function buildAdsReportingMicroSnapshot(
  progress: AdsReportingPipelineProgress | null | undefined,
): MetaBulkMicroSnapshot | null {
  if (!progress?.label?.trim()) return null;
  const phase = progress.label.trim();
  return {
    label: "PPC report",
    completed: Math.max(0, Math.floor(progress.step)),
    total: Math.max(1, Math.floor(progress.total)),
    statusMessage: phase,
    progressPct:
      progress.total > 0
        ? Math.min(100, Math.max(0, Math.round((progress.step / progress.total) * 100)))
        : undefined,
  };
}
