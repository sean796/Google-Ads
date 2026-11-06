import { fetchOnPageContentParsing } from "@/lib/backlink-research/fetch-on-page-content-parsing";
import {
  extractPageTitleFromOnPageDfsResponse,
  extractPlainTextFromOnPageDfsResponse,
} from "@/lib/backlink-research/on-page-dfs-extract-text";
import type { CompetitorPageMeta } from "@/lib/competitor-research/types";

function metaDescriptionFromOnPage(root: unknown): string {
  const r = root as {
    tasks?: Array<{
      result?: unknown[];
    }>;
  };
  const blocks = r.tasks?.[0]?.result;
  if (!Array.isArray(blocks)) return "";
  for (const block of blocks) {
    if (!block || typeof block !== "object") continue;
    const items = (block as { items?: unknown[] }).items;
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      if (it.type !== "content_parsing_element" || !it.page_content || typeof it.page_content !== "object") {
        continue;
      }
      const pc = it.page_content as Record<string, unknown>;
      const meta = pc.meta;
      if (meta && typeof meta === "object") {
        const m = meta as Record<string, unknown>;
        if (typeof m.description === "string" && m.description.trim()) {
          return m.description.trim().slice(0, 500);
        }
      }
    }
  }
  return "";
}

export async function scanCompetitorPageMeta(url: string, signal?: AbortSignal): Promise<CompetitorPageMeta> {
  const parsed = await fetchOnPageContentParsing({ url, signal });
  const title = extractPageTitleFromOnPageDfsResponse(parsed);
  const metaDescription = metaDescriptionFromOnPage(parsed);
  const bodySnippet = extractPlainTextFromOnPageDfsResponse(parsed, 4000);
  return {
    url,
    title: title || url,
    metaDescription,
    bodySnippet,
  };
}

export async function scanCompetitorPagesParallel(
  urls: string[],
  concurrency = 4,
  signal?: AbortSignal,
): Promise<CompetitorPageMeta[]> {
  const out: CompetitorPageMeta[] = [];
  let idx = 0;

  async function worker(): Promise<void> {
    while (idx < urls.length) {
      if (signal?.aborted) return;
      const i = idx++;
      const url = urls[i]!;
      try {
        out.push(await scanCompetitorPageMeta(url, signal));
      } catch {
        out.push({ url, title: url, metaDescription: "", bodySnippet: "" });
      }
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, urls.length) }, () => worker());
  await Promise.all(workers);
  return out.sort((a, b) => urls.indexOf(a.url) - urls.indexOf(b.url));
}
