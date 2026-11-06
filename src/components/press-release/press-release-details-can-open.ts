import { workspaceDetailsCanOpen } from "@/lib/workspace/workspace-details-can-open";

export function pressReleaseDetailsCanOpen(
  busy: boolean,
  hasKeyword: boolean,
  hasTitle: boolean,
  hasInventory: boolean,
): boolean {
  return workspaceDetailsCanOpen(busy, hasKeyword, hasTitle, hasInventory);
}
