import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import type {
  CompetitorResearchSemrushResponse,
  TieredCompetitorsResult,
} from "@/lib/competitor-research/types";
import {
  getCompetitorReportMaxOutputTokens,
  REPORT_PIPELINE_MICRO_TOTAL,
  type CompetitorReportMicroStepPayload,
  type CompetitorReportRequestStats,
  type ReportPipelineMicroStep,
} from "@/lib/competitor-research/competitor-report-openrouter-limits";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseAssistantJsonObject } from "@/lib/competitor-research/competitor-report-json-parse";
import {
  COMPETITOR_REPORT_SUMMARIZE_SYSTEM,
  type CompetitorReportSectionIndex,
} from "@/lib/competitor-research/competitor-report-system-prompt";
import { roundWirePayloadForOpenRouterJson } from "@/lib/competitor-research/competitor-report-openrouter-payload-round";
import { REPORT_WIRE_LEGEND_LINE, type CompetitorReportWirePayload } from "@/lib/competitor-research/competitor-report-wire";
export type StrategistSectionReadyPayload = {
  section: CompetitorReportSectionIndex;
  markdown: string;
  requestStats?: CompetitorReportRequestStats;
};

/** Sort parallel section results into 1→3 order before stitch (exported for tests). */
export function sortStrategistParallelSectionResults<T extends { section: CompetitorReportSectionIndex }>(
  results: T[],
): T[] {
  return [...results].sort((a, b) => a.section - b.section);
}

/** True when the provider stopped because output hit max_tokens (truncated mid-report). */
export function isCompletionTruncatedByTokenLimit(
  finishReason?: string,
  nativeFinishReason?: string,
): boolean {
  for (const r of [finishReason, nativeFinishReason]) {
    if (typeof r !== "string" || !r.trim()) continue;
    const lo = r.trim().toLowerCase().replace(/-/g, "_");
    if (lo === "length" || lo === "max_tokens" || lo === "max_output_tokens") return true;
    if (lo.includes("max_tokens") || lo.includes("length_limit")) return true;
  }
  return false;
}

/** Lets React paint updated micro-step labels before heavy synchronous JSON.parse. */
export function yieldToUiFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

/** GSC queries included in report context JSON (impressions-sorted). */
export const REPORT_GSC_QUERIES_MAX = 200;
export { REPORT_MAX_COMPETITORS } from "@/lib/competitor-research/competitor-top-rows";

export function emitReportMicroStep(
  options: { onMicroStep?: (p: CompetitorReportMicroStepPayload) => void } | undefined,
  step: ReportPipelineMicroStep,
  label: string,
  requestStats?: CompetitorReportRequestStats,
): void {
  options?.onMicroStep?.({ step, total: REPORT_PIPELINE_MICRO_TOTAL, label, requestStats });
}

/** Restrict enrichment to report sr domains; keys normalized so Semrush payloads match reportDomainKeys. */
export function filterEnrichmentToDomains(
  enrichment: CompetitorResearchSemrushResponse["enrichmentByDomain"],
  domainKeys: Set<string>,
): CompetitorResearchSemrushResponse["enrichmentByDomain"] {
  if (!enrichment) return enrichment;
  const out: NonNullable<typeof enrichment> = {};
  for (const [k, v] of Object.entries(enrichment)) {
    const nk = normalizeCompetitorDomainKey(k);
    if (domainKeys.has(nk)) {
      out[nk] = v;
    }
  }
  return out;
}

export function filterTieredCompetitorsToDomains(
  tiers: TieredCompetitorsResult,
  domainKeys: Set<string>,
): TieredCompetitorsResult {
  const nextTiers = tiers.tiers
    .map((g) => ({
      ...g,
      competitors: g.competitors.filter((c) => domainKeys.has(normalizeCompetitorDomainKey(c.domain))),
    }))
    .filter((g) => g.competitors.length > 0);
  return { ...tiers, tiers: nextTiers };
}

export async function summarizeResearchWire(args: {
  apiKey: string;
  model: string;
  wire: CompetitorReportWirePayload;
  signal: AbortSignal;
}): Promise<{ json: unknown; usedFallback: boolean }> {
  const roundedWire = roundWirePayloadForOpenRouterJson(args.wire);
  const baseUser = `L:${REPORT_WIRE_LEGEND_LINE} ${JSON.stringify(roundedWire)} Return one JSON object only. Shorten ta.Sum,Rsn,n,lb if long. Keep all numbers and domains. Keep sk,sr,ekr,dm,gq rows.`;
  for (let attempt = 0; attempt < 2; attempt++) {
    const user = attempt === 0 ? baseUser : `${baseUser} JSON only. No prose. No fences.`;
    try {
      const maxTok = Math.min(32_768, getCompetitorReportMaxOutputTokens(args.model));
      const { content } = await callOpenRouterChatCompletion({
        apiKey: args.apiKey,
        model: args.model,
        system: COMPETITOR_REPORT_SUMMARIZE_SYSTEM,
        user,
        maxTokens: maxTok,
        signal: args.signal,
      });
      const parsed = parseAssistantJsonObject(content);
      return { json: parsed, usedFallback: false };
    } catch {
      /* retry */
    }
  }
  return { json: args.wire, usedFallback: true };
}
