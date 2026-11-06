import { workspaceDetailsCanOpen } from "@/lib/workspace/workspace-details-can-open";

export function knowledgeBaseDetailsCanOpen(
  hasProfile: boolean,
  isUploading: boolean,
  isScraping: boolean,
  hasLog: boolean,
): boolean {
  return workspaceDetailsCanOpen(hasProfile, isUploading, isScraping, hasLog);
}
