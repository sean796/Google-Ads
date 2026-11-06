import type { GscTop10RagPage } from "@/lib/vertical-benchmark/vertical-benchmark-gsc-rag";
import type { SitePostInventoryKbPayload, SitePostInventoryRow } from "@/lib/wordpress-api/types";

export function normalizeInventoryUrl(url: string): string {
  const trimmed = url?.trim() ?? "";
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.origin}${path}`.toLowerCase();
  } catch {
    return trimmed.replace(/\/+$/, "").toLowerCase();
  }
}

function parseInventoryRows(siteInventoryJson: string): SitePostInventoryRow[] {
  if (!siteInventoryJson.trim()) return [];
  try {
    const parsed = JSON.parse(siteInventoryJson) as SitePostInventoryKbPayload;
    return Array.isArray(parsed.posts) ? parsed.posts : [];
  } catch {
    return [];
  }
}

/** Published + scheduled URLs from site inventory. */
export function buildInventoryUrlSet(siteInventoryJson: string): Set<string> {
  const out = new Set<string>();
  for (const row of parseInventoryRows(siteInventoryJson)) {
    const key = normalizeInventoryUrl(row.url ?? "");
    if (key) out.add(key);
  }
  return out;
}

export type GscInventorySwapResult = {
  pages: GscTop10RagPage[];
  /** GSC lines dropped because URL is already published. */
  droppedPublishedUrls: string[];
  /** Replaced with another GSC URL not in inventory. */
  swapped: Array<{ from: string; to: string; gscRank: number }>;
};

/**
 * Before Gemini: never adapt a GSC line whose URL is already live in SITE_INVENTORY.
 * Swap to the next-best GSC page (top 10 + extended pool) whose URL is not published.
 */
export function gscOutputPagesExcludingPublishedInventory(
  outputPages: GscTop10RagPage[],
  gscPool: GscTop10RagPage[],
  siteInventoryJson: string,
): GscInventorySwapResult {
  const inventoryUrls = buildInventoryUrlSet(siteInventoryJson);
  const usedUrls = new Set<string>();
  const droppedPublishedUrls: string[] = [];
  const swapped: GscInventorySwapResult["swapped"] = [];
  const pages: GscTop10RagPage[] = [];

  const replacementCandidates = [...gscPool].sort((a, b) => a.rank - b.rank);

  function takeReplacement(excludeUrl: string): GscTop10RagPage | undefined {
    const excludeKey = normalizeInventoryUrl(excludeUrl);
    for (const candidate of replacementCandidates) {
      const key = normalizeInventoryUrl(candidate.url);
      if (!key || key === excludeKey) continue;
      if (inventoryUrls.has(key)) continue;
      if (usedUrls.has(key)) continue;
      return candidate;
    }
    return undefined;
  }

  for (const page of outputPages) {
    const pageKey = normalizeInventoryUrl(page.url);
    if (pageKey && !inventoryUrls.has(pageKey)) {
      pages.push(page);
      usedUrls.add(pageKey);
      continue;
    }

    if (page.url?.trim()) droppedPublishedUrls.push(page.url.trim());
    const replacement = takeReplacement(page.url ?? "");
    if (replacement) {
      pages.push(replacement);
      usedUrls.add(normalizeInventoryUrl(replacement.url));
      swapped.push({
        from: page.url,
        to: replacement.url,
        gscRank: replacement.rank,
      });
    }
  }

  return { pages, droppedPublishedUrls, swapped };
}

const FORBIDDEN_PROMPT_MAX_ROWS = 300;

/** Explicit forbidden title/keyword list for the prompt (inventory already published). */
export function buildForbiddenInventoryOutputsBlock(siteInventoryJson: string): string {
  const rows = parseInventoryRows(siteInventoryJson);
  const lines: string[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (lines.length >= FORBIDDEN_PROMPT_MAX_ROWS) break;
    const title = row.fields?.title?.trim() ?? "";
    const keyword = row.fields?.keyword?.trim() ?? "";
    if (!title && !keyword) continue;
    const key = `${title}\0${keyword}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(`- title: ${JSON.stringify(title)} | keyword: ${JSON.stringify(keyword)}`);
  }

  if (!lines.length) return "";

  return `
=== FORBIDDEN OUTPUTS (already on site — never use these titles, keywords, or same-intent rephrases) ===
${lines.join("\n")}
=== END FORBIDDEN OUTPUTS ===`;
}
