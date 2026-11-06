import type { OptimizationFile } from "@/lib/optimization-file-manager";

const ARTIFACT_ORDER = ["checklist", "blueprint", "content"] as const;

export function sortOptimizationArtifacts(files: OptimizationFile[]): OptimizationFile[] {
  const score = (name: string) => {
    const lower = name.toLowerCase();
    for (let i = 0; i < ARTIFACT_ORDER.length; i++) {
      if (lower.startsWith(`${ARTIFACT_ORDER[i]}-`)) return i;
    }
    return ARTIFACT_ORDER.length;
  };
  return [...files].sort((a, b) => score(a.name) - score(b.name));
}
