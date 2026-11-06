import { z } from "zod";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseModelJson } from "@/lib/model-json";
import { getResearchModel } from "@/lib/optimization-settings-storage";
import { llmAuditGuidanceFromBrief } from "@/lib/llm-audit/llm-audit-dataforseo";
import type { SeoContentBriefV1 } from "@/lib/overview-seo-content-brief";

export type LlmAuditContentSummary = {
  summary: string;
  checklistItems: string[];
  blueprintNotes: string;
};

const LlmAuditSummarySchema = z.object({
  summary: z.string(),
  checklistItems: z.array(z.string()),
  blueprintNotes: z.string(),
});

function normalizeChecklistItems(items: unknown): string[] {
  if (!Array.isArray(items)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (typeof item !== "string") continue;
    const line = item.trim();
    if (!line || seen.has(line.toLowerCase())) continue;
    seen.add(line.toLowerCase());
    out.push(line);
    if (out.length >= 8) break;
  }
  return out;
}

/**
 * Condense multi-platform LLM audit into checklist + blueprint guidance.
 */
export async function summarizeLlmAuditForContentPipeline(args: {
  brief: SeoContentBriefV1;
  apiKey: string;
  model?: string;
  keyword: string;
  entity?: string;
}): Promise<LlmAuditContentSummary | null> {
  const guidance = llmAuditGuidanceFromBrief(args.brief).trim();
  if (!guidance) return null;

  const okCount =
    args.brief.llmAudit?.platforms.filter((p) => p.status === "ok" && p.responseText?.trim()).length ?? 0;
  if (okCount === 0) return null;

  const location = args.brief.llmAudit?.location?.trim() || args.entity?.trim() || "";
  const model = args.model?.trim() || getResearchModel();

  const user = `Focus keyword: ${args.keyword.trim()}
${location ? `Location: ${location}` : ""}

LLM audit platform research (resident-level area facts, no business names):
${guidance}

Return JSON:
{
  "summary": "2-4 sentences: merged resident-level facts and content angles to weave into the article",
  "checklistItems": [],
  "blueprintNotes": "Short paragraph: how to distribute LLM audit facts across the existing 6-7 sections without new H2s or repeating the same bullet in every section"
}`;

  const { content } = await callOpenRouterChatCompletion({
    apiKey: args.apiKey,
    model,
    system:
      "You merge multi-platform local LLM audit research into actionable SEO content guidance. Use only facts present in the input. No business names, no census stats, no URLs in output. JSON only.",
    user,
    maxTokens: 2500,
    temperature: 0.2,
    responseFormat: { type: "json_object" },
  });

  const parsed = parseModelJson(content, LlmAuditSummarySchema, "LLM audit summary");

  const summary = parsed.summary.trim();
  const checklistItems = normalizeChecklistItems(parsed.checklistItems);
  const blueprintNotes = parsed.blueprintNotes.trim();

  if (!summary && checklistItems.length === 0 && !blueprintNotes) return null;

  return {
    summary,
    checklistItems,
    blueprintNotes: blueprintNotes || summary,
  };
}

export function injectLlmAuditIntoChecklist(checklist: string[], items: string[]): string[] {
  // Audit facts are prompt-only (llmAuditSummary / harness block). Never inflate checklist → extra H2s.
  void items;
  return checklist;
}

export function formatLlmAuditSummaryForPrompt(summary: LlmAuditContentSummary | null): string {
  if (!summary) return "";
  const parts: string[] = [];
  if (summary.summary) {
    parts.push(`Summary: ${summary.summary}`);
  }
  if (summary.checklistItems.length) {
    parts.push(`Mandatory checklist angles:\n${summary.checklistItems.map((l) => `- ${l}`).join("\n")}`);
  }
  if (summary.blueprintNotes) {
    parts.push(`Blueprint distribution: ${summary.blueprintNotes}`);
  }
  return parts.join("\n\n");
}
