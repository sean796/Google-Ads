import { parseAssistantJsonObject } from "@/lib/competitor-research/competitor-report-json-parse";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { getCompetitorReportMaxOutputTokens } from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import {
  MAX_SEMANTIC_CLUSTERS,
  normalizePhraseKey,
  type RawSemanticCluster,
} from "@/lib/competitor-research/competitor-keyword-cluster-repair";
import type {
  CompetitorKeywordRow,
  GscSiteQueryRow,
} from "@/lib/competitor-research/types";

const CLUSTER_SYSTEM_BASE = `You group organic search keywords into semantic clusters (same topic / intent). Return JSON only, no markdown, no code fences.

RULES:
- At most ${MAX_SEMANTIC_CLUSTERS} clusters per list (seed list, or each competitor domain list).
- Each INPUT phrase must appear in exactly ONE cluster as a member string. Match INPUT phrases closely (same words; minor spacing or casing differences are OK).
- For each cluster output: "label" (short readable name, e.g. "Invisalign Edmonton") and "members" (array of those phrases from INPUT).
- Do not invent wholly new phrases that are not in INPUT. Do not output volume, traffic, or position (metrics are computed separately).

OUTPUT SHAPE (exact top-level keys):
{"seed":[{"label":"string","members":["phrase1",...]}],"competitors":{"example.com":[{"label":"...","members":[...]}]}}
Use empty array for seed if seed input was empty. Use competitor domain keys exactly as in INPUT_JSON.`;

export const MAX_CLUSTER_EXCLUDE_PHRASES = 100;

export function buildClusterExcludePhrases(
  gscSiteQueries: GscSiteQueryRow[],
  seedPhrasesForExclude: string[],
): string[] {
  const fromGsc = [...gscSiteQueries]
    .sort((a, b) => (b.impressions || 0) - (a.impressions || 0))
    .slice(0, 80)
    .map((q) => q.query.trim())
    .filter(Boolean);
  const fromSeed = seedPhrasesForExclude.slice(0, 20).map((p) => p.trim()).filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [...fromGsc, ...fromSeed]) {
    const k = normalizePhraseKey(p);
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(p);
    if (out.length >= MAX_CLUSTER_EXCLUDE_PHRASES) break;
  }
  return out;
}

export function buildClusterSystem(excludePhrases: string[]): string {
  if (excludePhrases.length === 0) return CLUSTER_SYSTEM_BASE;
  const ex = JSON.stringify(excludePhrases.slice(0, MAX_CLUSTER_EXCLUDE_PHRASES));
  return `${CLUSTER_SYSTEM_BASE}

COVERAGE_TO_AVOID (GSC queries plus seed phrases the site already earns; JSON string array):
${ex}
When non-empty, prefer cluster labels that emphasize net-new intent vs these strings (members must still correspond to INPUT phrases).`;
}

export function normalizeCompetitorsInput(
  competitors: Record<string, CompetitorKeywordRow[]>,
): Record<string, CompetitorKeywordRow[]> {
  const out: Record<string, CompetitorKeywordRow[]> = {};
  for (const [d, rows] of Object.entries(competitors)) {
    out[normalizeCompetitorDomainKey(d)] = rows;
  }
  return out;
}

export type ParsedClusterResponse = {
  seed?: RawSemanticCluster[];
  competitors?: Record<string, RawSemanticCluster[]>;
};

async function fetchClusterKeywordCompletion(
  apiKey: string,
  model: string,
  system: string,
  userPayload: { seed: CompetitorKeywordRow[]; competitors: Record<string, CompetitorKeywordRow[]> },
  signal: AbortSignal | undefined,
): Promise<{
  content: string;
  finishReason?: string;
  nativeFinishReason?: string;
}> {
  const userStr = `INPUT_JSON:\n${JSON.stringify(userPayload)}`;
  const maxTok = getCompetitorReportMaxOutputTokens(model);
  return callOpenRouterChatCompletion({
    apiKey,
    model,
    system,
    user: userStr,
    maxTokens: maxTok,
    signal,
  });
}

export async function callClusterModelRaw(
  apiKey: string,
  model: string,
  system: string,
  userPayload: { seed: CompetitorKeywordRow[]; competitors: Record<string, CompetitorKeywordRow[]> },
  signal: AbortSignal | undefined,
): Promise<ParsedClusterResponse> {
  const { content } = await fetchClusterKeywordCompletion(apiKey, model, system, userPayload, signal);
  try {
    return parseAssistantJsonObject(content) as ParsedClusterResponse;
  } catch (e1) {
    const msg = e1 instanceof Error ? e1.message : String(e1);
    const { content: content2 } = await fetchClusterKeywordCompletion(
      apiKey,
      model,
      `${system}\n\nCRITICAL: Your previous output was not valid JSON. Return one JSON object only: no markdown fences, no trailing commas, and a comma between every array element (including in "members"). Use only double-quoted strings.`,
      userPayload,
      signal,
    );
    try {
      return parseAssistantJsonObject(content2) as ParsedClusterResponse;
    } catch {
      throw new Error(`Keyword clustering: failed to parse JSON from model. ${msg}`);
    }
  }
}

export function parseClustersOrThrow(parsed: ParsedClusterResponse, label: string): RawSemanticCluster[] {
  const arr = parsed.seed ?? parsed.competitors?.[label];
  if (!Array.isArray(arr)) {
    throw new Error(`Keyword clustering (${label}): missing cluster array in model response.`);
  }
  return arr as RawSemanticCluster[];
}
