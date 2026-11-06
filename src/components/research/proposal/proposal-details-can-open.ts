import { workspaceDetailsCanOpen } from "@/lib/workspace/workspace-details-can-open";

export function proposalDetailsCanOpen(
  busy: boolean,
  hasGrid: boolean,
  hasError: boolean,
): boolean {
  return workspaceDetailsCanOpen(busy, hasGrid, hasError);
}
