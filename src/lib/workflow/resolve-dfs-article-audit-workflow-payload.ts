import type { WordPressSite } from "@/components/integrations/types";
import { getSeoResearchFromPostFields } from "@/lib/content-generation/ai-driven-post-fields-reader";
import type { TaskExecutionTargetBucket } from "@/lib/task-execution-bucket";
import { resolveTaskExecutionBucketUrls } from "@/lib/task-execution-resolve-bucket-urls";
import type { TaskExecutionPayload } from "@/lib/tasks-types";
import { clipSeoResearchBriefForAudit } from "@/lib/dfs-article-audit/dfs-article-audit-dataforseo";
import { getPostFieldsForUrl } from "@/lib/wordpress-api/post-fields-discovery";

function normalizeBucket(value: unknown): TaskExecutionTargetBucket {
  const raw = String(value ?? "posts").trim().toLowerCase();
  if (raw === "pages" || raw === "sap") return raw;
  return "posts";
}

type DfsArticleAuditPayload = TaskExecutionPayload & { url?: string };

export async function resolveDfsArticleAuditWorkflowPayload(
  site: WordPressSite,
  payload: TaskExecutionPayload,
): Promise<TaskExecutionPayload> {
  const inputPayload: DfsArticleAuditPayload = payload;
  let targetUrl = String(inputPayload.targetUrl ?? inputPayload.url ?? "").trim();
  if (!targetUrl || targetUrl.toUpperCase() === "ALL") {
    const bucket = normalizeBucket(payload.targetBucket);
    const urls = await resolveTaskExecutionBucketUrls(site, bucket);
    targetUrl = urls[0]?.trim() ?? "";
  }
  if (!targetUrl) {
    throw new Error(
      "Set an article URL on the DFS LLM article audit step, or add posts on the client site to audit.",
    );
  }

  let focusKeyword = String(payload.focusKeyword ?? payload.keyword ?? "").trim();
  let seoResearchBrief = String(payload.seoResearchBrief ?? "").trim();
  if (!focusKeyword || !seoResearchBrief) {
    const acf = await getPostFieldsForUrl(site, targetUrl);
    if (!focusKeyword) {
      focusKeyword = String(acf.fields?.keyword_focus ?? "").trim();
    }
    if (!seoResearchBrief) {
      const seoRaw = getSeoResearchFromPostFields(acf.fields as Record<string, unknown> | undefined);
      if (seoRaw) seoResearchBrief = clipSeoResearchBriefForAudit(seoRaw);
    }
  }

  const resolved: TaskExecutionPayload & { url: string } = {
    ...payload,
    targetBucket: normalizeBucket(payload.targetBucket),
    targetUrl,
    url: targetUrl,
    ...(focusKeyword ? { focusKeyword, keyword: focusKeyword } : {}),
    ...(seoResearchBrief ? { seoResearchBrief } : {}),
  };
  return resolved;
}
