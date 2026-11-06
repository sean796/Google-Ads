import { parseJsonObjectFromModelText } from "@/lib/openrouter-vision-chat";
import type {
  ImplementationReportReasoning,
  ImplementationReportSectionRationale,
} from "./implementation-report-types";

export const IMPLEMENTATION_REPORT_REASONING_SCHEMA = `{"executiveSummary":"string","whyOptimized":"string","gscAndSemrushStrategy":"string","sectionRationale":[{"h2":"string","status":"added|rewritten|retained","whatChanged":"string","whyChanged":"string","dataSignalsUsed":"string"}],"bossHighlights":["string"]}`;

export function buildImplementationReportSystemPrompt(): string {
  return `You are the SEO Director writing an executive Implementation Report for management explaining what was optimized on a blog post and why.
Output a single JSON object only, no markdown fences.
Schema:
${IMPLEMENTATION_REPORT_REASONING_SCHEMA}
Rules:
- Ground every statement strictly in the provided GSC data, Semrush data, DataForSEO SERP/PAA signals, and deterministic before/after diffs.
- Never invent GSC clicks, impressions, or Semrush keywords when those arrays are empty; if a data source has 0 entries, state explicitly that the source had no prior data for this URL and explain which signals (focus keyword, SERP PAA, or site blueprint) drove the decisions instead.
- Do not use the em dash character in any string.
- sectionRationale MUST contain one entry for each H2 in the optimized post (in order), explaining what changed in that section, why it was added or rewritten, and which specific GSC query, Semrush keyword, PAA question, or internal link target informed it.
- bossHighlights MUST contain 3 to 5 concise, high-impact takeaways a manager or client can scan in 15 seconds.`;
}

export function parseImplementationReportReasoning(raw: string): ImplementationReportReasoning {
  const obj = parseJsonObjectFromModelText(raw);
  const executiveSummary = String(obj.executiveSummary ?? "").trim();
  const whyOptimized = String(obj.whyOptimized ?? "").trim();
  const gscAndSemrushStrategy = String(obj.gscAndSemrushStrategy ?? "").trim();
  const rawSections = Array.isArray(obj.sectionRationale) ? obj.sectionRationale : [];
  const rawHighlights = Array.isArray(obj.bossHighlights) ? obj.bossHighlights : [];

  if (!executiveSummary || !whyOptimized || !gscAndSemrushStrategy) {
    throw new Error("Implementation report reasoning JSON is missing required summary fields.");
  }

  const sectionRationale: ImplementationReportSectionRationale[] = rawSections.map((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    const statusRaw = String(o.status ?? "added").trim().toLowerCase();
    const status: "added" | "rewritten" | "retained" =
      statusRaw === "rewritten" || statusRaw === "retained" ? statusRaw : "added";
    return {
      h2: String(o.h2 ?? "").trim(),
      status,
      whatChanged: String(o.whatChanged ?? "").trim(),
      whyChanged: String(o.whyChanged ?? "").trim(),
      dataSignalsUsed: String(o.dataSignalsUsed ?? "").trim(),
    };
  });

  const bossHighlights = rawHighlights
    .map((h) => String(h ?? "").trim())
    .filter(Boolean);

  return {
    executiveSummary,
    whyOptimized,
    gscAndSemrushStrategy,
    sectionRationale,
    bossHighlights,
  };
}
