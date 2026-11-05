import {
  getOpenRouterModelsCatalog,
  type OpenRouterModelCatalogEntry,
} from "@/lib/openrouter-app-api";
import { resolveOpenRouterApiKeyForHarness } from "@/lib/openrouter-api-key-resolve";
import type { PipelineAgentKind } from "@/lib/agent-pipeline-cost-estimates";

export type { OpenRouterModelCatalogEntry };

const SESSION_KEY = "neo-pulse-or-models-catalog-v4";
const SESSION_AT_KEY = "neo-pulse-or-models-catalog-v4-at";
const CLIENT_TTL_MS = 23 * 60 * 60 * 1000;

let memoryCache: { models: OpenRouterModelCatalogEntry[]; cachedAt: string } | null = null;

export function formatUsdPerMillion(usdPerToken: number | null | undefined): string | null {
  if (usdPerToken == null || !Number.isFinite(usdPerToken)) return null;
  return `$${(usdPerToken * 1_000_000).toFixed(2)}`;
}

export function formatModelPriceHint(entry: OpenRouterModelCatalogEntry | undefined): string | null {
  if (!entry) return null;
  const pin = formatUsdPerMillion(entry.promptUsdPerToken);
  const pout = formatUsdPerMillion(entry.completionUsdPerToken);
  const pimg = formatUsdPerMillion(entry.imageUsdPerToken);
  if (pin && pout) return `${pin} / ${pout} per 1M in/out`;
  if (pin) return `${pin} per 1M in`;
  if (pout) return `${pout} per 1M out`;
  if (pimg) return `${pimg} per 1M image tokens`;
  return null;
}

const OPENROUTER_API_KEY_STORAGE_KEY = "openrouter-api-key";

export function readStoredOpenRouterApiKey(): string | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const t = localStorage.getItem(OPENROUTER_API_KEY_STORAGE_KEY)?.trim();
    return t || undefined;
  } catch {
    return undefined;
  }
}

function entryMatchesIdOrName(
  entry: { id: string; name: string },
  q: string,
): boolean {
  const id = entry.id.toLowerCase();
  const name = entry.name.toLowerCase();
  const qCompact = q.replace(/\s+/g, "");
  const idCompact = id.replace(/[/:._-]/g, "");
  return (
    id.includes(q) ||
    name.includes(q) ||
    idCompact.includes(qCompact) ||
    name.replace(/\s+/g, "").includes(qCompact)
  );
}

export function modelMatchesOpenRouterQuery(
  entry: { id: string; name: string; local?: boolean },
  query: string,
): boolean {
  if (entry.local) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return entryMatchesIdOrName(entry, q);
}

export function catalogEntryById(
  catalog: OpenRouterModelCatalogEntry[] | null | undefined,
  modelId: string,
): OpenRouterModelCatalogEntry | undefined {
  if (!catalog?.length) return undefined;
  const id = modelId.trim();
  return catalog.find((m) => m.id === id);
}

export function filterCatalogForAgentKind(
  catalog: OpenRouterModelCatalogEntry[],
  kind: PipelineAgentKind,
): OpenRouterModelCatalogEntry[] {
  if (kind === "image") {
    return catalog.filter((entry) => entry.imageOutput === true);
  }
  if (kind === "video") {
    return catalog.filter(
      (entry) =>
        entry.videoOutput === true ||
        entry.id.includes("kling") ||
        entry.id.includes("video") ||
        entry.id.includes("veo") ||
        entry.id.includes("seedance") ||
        entry.id.includes("hailuo") ||
        entry.id.includes("wan-") ||
        entry.id.includes("flux-video"),
    );
  }
  return catalog.filter((entry) => entry.textOutput === true);
}

function readSessionCache(): { models: OpenRouterModelCatalogEntry[]; cachedAt: string } | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const at = sessionStorage.getItem(SESSION_AT_KEY);
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!at || !raw) return null;
    const ts = Date.parse(at);
    if (!Number.isFinite(ts) || Date.now() - ts > CLIENT_TTL_MS) return null;
    const parsed = JSON.parse(raw) as { models?: OpenRouterModelCatalogEntry[]; cachedAt?: string };
    if (!Array.isArray(parsed.models)) return null;
    return { models: parsed.models, cachedAt: parsed.cachedAt ?? at };
  } catch {
    return null;
  }
}

function writeSessionCache(payload: { models: OpenRouterModelCatalogEntry[]; cachedAt: string }): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ models: payload.models }));
    sessionStorage.setItem(SESSION_AT_KEY, payload.cachedAt);
  } catch {
    /* ignore */
  }
}

export function clearOpenRouterModelsCatalogCache(): void {
  memoryCache = null;
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(SESSION_AT_KEY);
  } catch {
    /* ignore */
  }
}

export async function fetchOpenRouterModelsCatalog(apiKey?: string): Promise<{
  models: OpenRouterModelCatalogEntry[];
  cachedAt: string;
  error?: string;
}> {
  let key = apiKey?.trim() || readStoredOpenRouterApiKey();
  if (!key) {
    try {
      key = await resolveOpenRouterApiKeyForHarness();
    } catch {
      /* catalog can still load from server secrets when the client key is unset */
    }
  }

  if (memoryCache?.models.length) {
    return memoryCache;
  }
  const session = readSessionCache();
  if (session?.models.length) {
    memoryCache = session;
    return session;
  }

  try {
    const result = await getOpenRouterModelsCatalog(key);
    const models = result.models.filter((entry) => !entry.local);
    const filtered = { ...result, models };
    if (filtered.models.length > 0) {
      memoryCache = filtered;
      writeSessionCache(filtered);
      return filtered;
    }
    clearOpenRouterModelsCatalogCache();
    return result;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    clearOpenRouterModelsCatalogCache();
    return { models: [], cachedAt: "", error: message };
  }
}

/** Test helper: parse OpenRouter pricing field (USD per token). */
export function parseOpenRouterUsdPerToken(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num) || num < 0) return null;
  return num;
}
