import { buildRunContextBlock } from "@/lib/workflow/workflow-rag-utils";
import { resolveWorkflowLocalDominatorGridKeyword } from "@/lib/local-dominator/local-dominator-export-keyword";
import { getStoredSites } from "@/components/integrations/storage";
import { wordpressSiteDisplayName } from "@/lib/wordpress-site-display-name";
import type { TaskExecutionPayload } from "@/lib/tasks-types";
import type { WorkflowStepOutput } from "@/lib/workflow/workflow-types";

export function collectWorkflowRunContextBlock(
  outputs: WorkflowStepOutput[],
  ragInputKeys: string[],
  siteId: string,
  clientSiteIds: string[],
): string {
  return buildRunContextBlock(outputs, ragInputKeys, siteId, clientSiteIds);
}

export function applyLocalDominatorWorkflowKeyword(
  payload: TaskExecutionPayload,
  nodePayload: TaskExecutionPayload | undefined,
  siteName: string,
): TaskExecutionPayload {
  const businessName = siteName.trim();
  return {
    ...payload,
    keyword: resolveWorkflowLocalDominatorGridKeyword(
      nodePayload,
      payload.keyword,
      businessName,
    ),
  };
}

export function resolveWorkflowSiteContext(siteId: string | undefined): {
  name: string;
  url?: string;
  site: { name: string; siteUrl: string; productionSiteUrl?: string };
} {
  if (!siteId?.trim()) {
    return { name: "", site: { name: "", siteUrl: "" } };
  }
  const site = getStoredSites().find((item) => item.id === siteId.trim());
  const name = site ? wordpressSiteDisplayName(site) : "";
  const url = site?.siteUrl ?? site?.productionSiteUrl;
  return {
    name,
    url,
    site: {
      name,
      siteUrl: site?.siteUrl ?? "",
      productionSiteUrl: site?.productionSiteUrl,
    },
  };
}
