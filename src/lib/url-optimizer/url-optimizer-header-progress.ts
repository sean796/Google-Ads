import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import { URL_OPTIMIZER_STEPS, urlOptimizerOverallPct } from "@/lib/url-optimizer/url-optimizer-progress-display";
import type { UrlOptimizerProgress } from "@/lib/url-optimizer/types";

export const URL_OPTIMIZER_LABEL = "URL optimizer";

function stepLabelForPhase(phase: UrlOptimizerProgress["phase"]): string {
  const step = URL_OPTIMIZER_STEPS.find((s) => s.id === phase);
  if (step) return step.label;
  if (phase === "done") return "Complete";
  return URL_OPTIMIZER_LABEL;
}

export function buildUrlOptimizerMicroSnapshot(
  progress: UrlOptimizerProgress | null | undefined,
  running: boolean,
): MetaBulkMicroSnapshot | null {
  if (!running || !progress || progress.phase === "idle") return null;

  const label = URL_OPTIMIZER_LABEL;
  const phaseLabel = stepLabelForPhase(progress.phase);
  const statusMessage =
    progress.message?.trim() ||
    (phaseLabel.toLowerCase() !== label.toLowerCase() ? phaseLabel : undefined);
  const total = Math.max(1, progress.total || URL_OPTIMIZER_STEPS.length);
  const completed = Math.max(0, Math.floor(progress.completed));
  const progressPct = Math.round(urlOptimizerOverallPct(progress));

  return { label, completed, total, statusMessage, progressPct };
}
