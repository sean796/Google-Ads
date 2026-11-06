import { logger } from "@/lib/logger";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { getMuteOptimizationToasts } from "./optimization-toast-mute";
import { loadApiKey } from "@/lib/api";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { type WordPressSite } from "@/components/integrations/types";
import { selectBestKeywordForEntityPage } from "@/lib/content-optimization-helpers";
import type {
  MapSetter,
  ProgressSetter,
} from "./optimization-helpers-a";
import type { OptimizationProgressState } from "./use-optimization-state";

function escapeCsvField(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function buildGscCsvContent(
  gscResult: { queries?: ReadonlyArray<{ query?: unknown }> | null } | null | undefined,
  _pageUrl: string,
  _note?: string,
): string {
  const lines: string[] = ["query"];
  const queries = Array.isArray(gscResult?.queries) ? gscResult.queries : [];
  for (const q of queries) {
    const kw = typeof q?.query === "string" ? q.query.trim() : "";
    if (kw) lines.push(escapeCsvField(kw));
  }
  return lines.join("\n");
}

export function savePostData(
  fileManager: OptimizationFileManager,
  post: { fullData?: unknown } & Record<string, unknown>,
  postId: string | number
): void {
  const postDataForJson = post.fullData || post;
  const postDownloadFileName = OptimizationFileManager.generateFilename(
    "wordpress-post-download",
    postId.toString(),
    "json"
  );
  fileManager.addFile(postDownloadFileName, JSON.stringify(postDataForJson, null, 2), "application/json");
}

export function saveGSCData(
  fileManager: OptimizationFileManager,
  gscResult: { queries?: ReadonlyArray<{ query?: unknown }> | null } | null | undefined,
  url: string,
  note?: string
): void {
  const sanitized = OptimizationFileManager.sanitizeFilename(url);
  const ts = Date.now();
  const base = `gsc-data-${sanitized}-${ts}`;
  fileManager.addFile(`${base}.csv`, buildGscCsvContent(gscResult, url, note), "text/csv");
}

export function saveKeywordResearch(
  fileManager: OptimizationFileManager,
  keyword: string,
  data: {
    primaryKeyword: string;
    gscMetrics: unknown;
    keywordData: unknown;
    aiAnalysis: unknown;
    peopleAlsoAsk: unknown[];
    relatedGSCKeywords: string[];
    selectedKeywords: string[];
    selectedH2Sections: string[];
    selectedPeopleAlsoAsk?: unknown[];
    selectedResearchLinks?: unknown[];
  }
): void {
  const keywordResearchFileName = OptimizationFileManager.generateFilename("keyword-research", keyword, "json");
  fileManager.addFile(keywordResearchFileName, JSON.stringify(data, null, 2), "application/json");
}

export function saveSelectedKeyword(
  fileManager: OptimizationFileManager,
  keyword: string,
  selectedKeyword: unknown
): void {
  const selectedKeywordFileName = OptimizationFileManager.generateFilename("selected-keyword", keyword, "json");
  fileManager.addFile(selectedKeywordFileName, JSON.stringify(selectedKeyword, null, 2), "application/json");
}

export function buildSeoResearchArtifactDownloadable(
  primaryKeyword: string,
  rawSeoResearch: string,
): { name: string; content: string; mimeType: string } {
  const fileName = OptimizationFileManager.generateFilename("acf-seo-research", primaryKeyword, "json");
  const trimmed = String(rawSeoResearch ?? "").trim();
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    parsed = undefined;
  }
  const payload = {
    source: "acf_seo_research" as const,
    note:
      "Scraped from WordPress ACF field seo_research. No live keyword-research pipeline or DataForSEO/Semrush/GSC merge was run for this artifact.",
    primaryKeyword: String(primaryKeyword ?? "").trim(),
    scrapedAt: new Date().toISOString(),
    ...(parsed !== undefined ? { data: parsed } : { raw: trimmed }),
  };
  return {
    name: fileName,
    content: JSON.stringify(payload, null, 2),
    mimeType: "application/json;charset=utf-8",
  };
}

export function saveSerpResearchBrief(
  fileManager: OptimizationFileManager,
  primaryKeyword: string,
  briefJson: string,
): void {
  const trimmed = String(briefJson ?? "").trim();
  if (!trimmed) return;
  const fileName = OptimizationFileManager.generateFilename("serp-research-brief", primaryKeyword, "json");
  fileManager.addFile(fileName, trimmed, "application/json");
}

export function handleOptimizationError(
  error: unknown,
  siteId: string,
  setIsOptimizing: MapSetter<boolean>,
  setProgress: ProgressSetter,
): void {
  const errorMessage = error instanceof Error ? error.message : "Unknown error occurred during optimization";

  try {
    setIsOptimizing((prev) => ({ ...prev, [siteId]: false }));
    setProgress((prev) => {
      const prevEntry: Partial<OptimizationProgressState> = prev[siteId] ?? {};
      return {
        ...prev,
        [siteId]: {
          ...prevEntry,
          error: errorMessage,
          message: errorMessage,
        } as OptimizationProgressState,
      };
    });
  } catch (stateError) {
    logger.error("[Optimization] Error updating error state:", stateError);
  }

  if (!getMuteOptimizationToasts()) {
    notifyHeaderError("Optimization failed", errorMessage, { duration: 5000 });
  }
}


export function subtypeToEndpoint(subtype?: string): string | undefined {
  const map: Record<string, string> = {
    post: "posts",
    page: "pages",
    "service-area": "service-areas",
  };
  return subtype ? map[subtype] : undefined;
}

export function findEndpointFromSitemap(url: string, site: WordPressSite): string | undefined {
  if (!site.sitemaps?.endpoints || !site.sitemaps?.childSitemaps) {
    return undefined;
  }

  const urlPath = new URL(url).pathname.toLowerCase();

  for (const [sitemapUrl, endpoint] of Object.entries(site.sitemaps.endpoints)) {
    const sitemapFilename = sitemapUrl.split("/").pop() || "";
    const sitemapType = sitemapFilename.replace(/[-_]sitemap\.xml$/i, "").toLowerCase();

    if (urlPath.includes(sitemapType.replace(/s$/, "")) || urlPath.includes(sitemapType)) {
      return endpoint;
    }
  }

  if (urlPath.includes("/page/") || urlPath.match(/^\/[^/]+$/)) {
    if (!urlPath.match(/\/\d{4}\/\d{2}\//)) {
      return "pages";
    }
  }

  return undefined;
}

const LISTING_URL_SLUGS = new Set(["blog", "news", "articles", "category", "archive", "topics"]);

export function getPrimaryKeywordIntentForUrl(url: string, siteName?: string | null): string | null {
  try {
    const path = new URL(url).pathname.toLowerCase().replace(/\/$/, "");
    const segments = path.split("/").filter(Boolean);
    const lastSegment = segments[segments.length - 1];
    if (!lastSegment || !LISTING_URL_SLUGS.has(lastSegment)) return null;
    const siteLower = (siteName || "").toLowerCase();
    const isDental = siteLower.includes("dental") || siteLower.includes("dentist");
    if (lastSegment === "blog") return isDental ? "dental blog" : "blog";
    if (lastSegment === "news") return isDental ? "dental news" : "news";
    if (lastSegment === "articles") return "articles";
    if (lastSegment === "category" || lastSegment === "archive" || lastSegment === "topics") {
      return lastSegment === "category" ? "category" : lastSegment === "archive" ? "archive" : "topics";
    }
    return null;
  } catch {
    return null;
  }
}

export async function selectBestKeywordForEntity(
  title: string,
  url: string,
  siteName: string,
  siteId: string,
  validQueries: Array<{ query: string; clicks: number; impressions: number; ctr: number; position: number }>
): Promise<{ query: string; clicks: number; impressions: number; ctr: number; position: number } | null> {
  try {
    const openRouterApiKey = loadApiKey();
    if (!openRouterApiKey || openRouterApiKey.trim().length === 0) {
      return null;
    }

    const researchModel = getResearchModel(siteId);
    const geminiSelectedKeyword = await selectBestKeywordForEntityPage(
      title,
      url,
      siteName,
      validQueries,
      openRouterApiKey,
      researchModel
    );

    return geminiSelectedKeyword;
  } catch (error) {
    logger.warn("[Entity Keyword Selection] Failed to use Gemini selection:", error);
    return null;
  }
}
