import { workspaceDetailsCanOpen } from "@/lib/workspace/workspace-details-can-open";

export function bulkGeneratorDetailsCanOpen(
  hasRows: boolean,
  isProcessing: boolean,
  hasFile: boolean,
  hasDraft: boolean,
): boolean {
  return workspaceDetailsCanOpen(hasRows, isProcessing, hasFile, hasDraft);
}
