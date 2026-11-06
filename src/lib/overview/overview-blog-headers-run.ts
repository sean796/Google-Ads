import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { MetaBulkActionKey, BulkProgressSlice } from "@/components/overview/overview-tab-constants";
import type { BlogHeadersCatalogRow } from "@/lib/overview/overview-blog-headers-catalog";
import {
  runBlogHeadersApply,
  runBlogHeadersPlan,
  type BlogHeadersAgentOptions,
} from "@/lib/overview/overview-blog-headers-agent";
import { verifyBlogHeadersApply } from "@/lib/overview/overview-blog-headers-verify";
import { extractH2TextsFromHtml } from "@/lib/overview/overview-blog-headers-extract";
import { stripContentH1Blocks } from "@/lib/overview/overview-content-cleanup";

export const BLOG_HEADERS_CONCURRENCY = 4;

export type BlogHeadersRowPatch = {
  blogH2List: string[];
  blogH2PlanJson: string;
  postContentOptimized: string;
  blogHeadersRanAtIso: string;
};

export type RunBlogHeadersBatchArgs = {
  catalog: BlogHeadersCatalogRow[];
  agentOptions: BlogHeadersAgentOptions;
  onRowComplete?: (index: number, patch: BlogHeadersRowPatch | null, error?: string) => void;
  patchProgress?: (patch: Partial<BulkProgressSlice>) => void;
  signal?: AbortSignal;
};

async function runOneBlogHeadersRow(
  row: BlogHeadersCatalogRow,
  agentOptions: BlogHeadersAgentOptions,
  signal?: AbortSignal,
): Promise<BlogHeadersRowPatch> {
  const plan = await runBlogHeadersPlan(row, { ...agentOptions, signal });
  const apply = await runBlogHeadersApply(row, plan, { ...agentOptions, signal });
  const verified = verifyBlogHeadersApply(row.html, apply, plan);
  if (verified.ok === false) {
    throw new Error(verified.reason);
  }

  const ranAt = new Date().toISOString();
  return {
    blogH2List: verified.finalH2s.length > 0 ? verified.finalH2s : extractH2TextsFromHtml(row.html),
    blogH2PlanJson: JSON.stringify(plan),
    postContentOptimized: stripContentH1Blocks(verified.updatedHtml).html,
    blogHeadersRanAtIso: ranAt,
  };
}

export async function runBlogHeadersBatch(args: RunBlogHeadersBatchArgs): Promise<{
  ok: number;
  fail: number;
  patches: Map<number, BlogHeadersRowPatch>;
}> {
  const { catalog, agentOptions, onRowComplete, patchProgress, signal } = args;
  const patches = new Map<number, BlogHeadersRowPatch>();
  let completed = 0;
  let ok = 0;
  let fail = 0;
  const total = catalog.length;

  const queue = [...catalog];
  const workers = Array.from({ length: Math.min(BLOG_HEADERS_CONCURRENCY, queue.length || 1) }, async () => {
    while (queue.length > 0) {
      if (signal?.aborted) break;
      const row = queue.shift();
      if (!row) break;

      patchProgress?.({
        statusMessage: `Headers: ${row.url}`,
        completed,
        total,
      });

      try {
        const patch = await runOneBlogHeadersRow(row, agentOptions, signal);
        patches.set(row.index, patch);
        ok += 1;
        onRowComplete?.(row.index, patch);
      } catch (err) {
        fail += 1;
        const msg = err instanceof Error ? err.message : String(err);
        onRowComplete?.(row.index, null, msg);
      } finally {
        completed += 1;
        patchProgress?.({ completed, total });
      }
    }
  });

  await Promise.all(workers);
  return { ok, fail, patches };
}

export function blogHeadersPatchToOverviewRow(patch: BlogHeadersRowPatch): Partial<OverviewRow> {
  return {
    blogH2List: patch.blogH2List,
    blogH2PlanJson: patch.blogH2PlanJson,
    postContent: patch.postContentOptimized,
    postContentOptimized: patch.postContentOptimized,
    blogHeadersRanAtIso: patch.blogHeadersRanAtIso,
    status: "idle",
  };
}

export const BLOG_HEADERS_PROGRESS_KEY = "aiHeaders" as MetaBulkActionKey;
