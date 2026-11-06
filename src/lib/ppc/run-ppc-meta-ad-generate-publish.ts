import {
  patchMetaGenerateGranularStep,
  type MetaGenerateGranularStepId,
  type MetaGenerateProgressState,
  type MetaGenerateStepId,
} from "@/lib/ppc/meta-ads-progress-types";
import { syncMetaMergedResearchSections } from "@/lib/ppc/meta-ad-research-sections";
import type { MetaAdContextSource, MetaAdResearchSection } from "@/lib/ppc/meta-ads-types";
import type { MetaAdGeneratePartialUpdate } from "@/lib/ppc/run-ppc-meta-ad-generate-types";


export function patchStep(
  progress: MetaGenerateProgressState,
  stepId: MetaGenerateGranularStepId,
  status: "running" | "done" | "error",
  statusMessage?: string,
): MetaGenerateProgressState {
  return patchMetaGenerateGranularStep(progress, stepId, status, statusMessage);
}

export function patchPhase(
  progress: MetaGenerateProgressState,
  stepId: MetaGenerateStepId,
  status: "running" | "done" | "error",
  statusMessage?: string,
): MetaGenerateProgressState {
  const steps = progress.steps.map((step) =>
    step.id === stepId ? { ...step, status } : step,
  );
  const completed = steps.filter((step) => step.status === "done").length;
  const active = steps.find((step) => step.status === "running");
  return {
    ...progress,
    steps,
    activeStepId: status === "running" ? stepId : progress.activeStepId,
    completed,
    label: active?.label ?? progress.label,
    statusMessage,
  };
}

export function publishMergedResearchSections(
  sections: MetaAdResearchSection[],
  onResearchSections?: (sections: MetaAdResearchSection[]) => void,
  onPartialUpdate?: (patch: MetaAdGeneratePartialUpdate) => void,
) {
  const merged = syncMetaMergedResearchSections(sections);
  publishResearchSections(merged, onResearchSections, onPartialUpdate);
  return merged;
}

export function resolveContextSource(source: MetaAdContextSource | undefined): MetaAdContextSource {
  return source === "neo-pulse_app" ? "neo-pulse_app" : "custom";
}

export function publishPartialUpdate(
  patch: MetaAdGeneratePartialUpdate,
  onPartialUpdate?: (patch: MetaAdGeneratePartialUpdate) => void,
) {
  onPartialUpdate?.(patch);
}

export function publishResearchSections(
  sections: MetaAdResearchSection[],
  onResearchSections?: (sections: MetaAdResearchSection[]) => void,
  onPartialUpdate?: (patch: MetaAdGeneratePartialUpdate) => void,
) {
  onResearchSections?.(sections);
  publishPartialUpdate({ researchSections: sections }, onPartialUpdate);
}
