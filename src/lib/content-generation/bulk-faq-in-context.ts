/**
 * Bulk prompt generator: FAQ Q/A pairs grounded in article + SEO research JSON (same intent as
 * Overview optimizeFaq with includeAnswers: true).
 */

import { logger } from "@/lib/logger";
import type { WordPressSite } from "@/components/integrations/types";
import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { appendUniversalContentRulesToSystemPrompt } from "@/lib/content-word-blocklist";
import {
  bulkFaqPairsResponseFormat,
  type BulkFaqPairsPayload,
} from "@/lib/content-generation/bulk-faq-in-context-schema";
import { getMetaModel } from "@/lib/optimization-settings-storage";
import type { FaqEntry } from "@/lib/faq-entries";
import { FAQ_CONVERSATIONAL_RULE } from "@/lib/content-generation/faq-heading-policy";

const BODY_MAX = 12000;
const BRIEF_MAX = 24000;

/** Compact NAP/locations string for FAQ prompts (mirrors Overview napSummary role). */
export function buildNapSummaryFromSite(site: WordPressSite): string {
  const parts: string[] = [];
  const nap = site.napInfo;
  if (nap?.name) parts.push(`Business: ${nap.name}`);
  if (nap?.address) parts.push(`Address: ${nap.address}`);
  if (nap?.phone) parts.push(`Phone: ${nap.phone}`);
  if (nap?.email) parts.push(`Email: ${nap.email}`);
  const locs = nap?.locations?.length ? nap.locations : site.locations;
  if (locs?.length) {
    const lines = locs.map((l) =>
      [l.name, l.address, l.city, l.state, l.zip, l.phone].filter(Boolean).join(", ")
    );
    parts.push(`Locations:\n${lines.join("\n")}`);
  }
  return parts.join("\n").trim();
}

/** Same shape as wordpress-uploader for buildFAQSchemaScriptFromEntries. */
export function napLocationsFromSite(site: WordPressSite): Array<{ city: string; state: string }> {
  const raw = site.napInfo?.locations?.length ? site.napInfo.locations : site.locations;
  if (!raw?.length) return [];
  return raw
    .map((l) => ({ city: l.city || "", state: l.state || "" }))
    .filter((l) => l.city || l.state);
}

export interface GenerateBulkFaqEntriesInContextParams {
  markdownContent: string;
  postTitle: string;
  pageMeta: string;
  primaryKeyword: string;
  postUrl: string;
  /** Stringified seo_research object (keyword/Semrush/optimized meta) - primary intent signal when non-empty. */
  seoResearchBrief: string;
  site: WordPressSite;
  apiKey: string;
  siteId?: string | null;
  pairCount?: number;
}

/**
 * Returns up to `pairCount` Q/A entries (default 4). Empty array on failure or empty response.
 */
export async function generateBulkFaqEntriesInContext(
  params: GenerateBulkFaqEntriesInContextParams
): Promise<FaqEntry[]> {
  const pairCount = Math.min(8, Math.max(1, params.pairCount ?? 4));
  const briefTrimmed = params.seoResearchBrief.trim();
  const hasBrief = briefTrimmed.length > 0;
  const dfsForPrompt = hasBrief ? "(none - use JSON SEO content brief below)" : "(none)";

  const napSummary = buildNapSummaryFromSite(params.site);
  const body = params.markdownContent
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, BODY_MAX);

  const sharedContext = `
Location & NAP context (use to localize questions and answers, but do NOT restate it verbatim or change its meaning)
${napSummary || "(none)"}

Page intent (derive topic and searcher needs from this; FAQs MUST stay aligned with this intent)
Title: ${params.postTitle || "(none)"}
Meta: ${params.pageMeta || "(none)"}

${
  hasBrief
    ? `JSON SEO content brief (primary - organics, PAA, related, GSC, Semrush; parse intent; do not copy verbatim)
${briefTrimmed.slice(0, BRIEF_MAX)}

`
    : ""
}Supplementary SERP/research slot (if brief above is "(none)", use this; otherwise ignore)
${dfsForPrompt}

Article body (ground answers in this content; reflect its themes, facts, and vocabulary; do not invent unrelated topics)
${body}

URL
${params.postUrl}

Focus keyword (use exactly as shown when relevant)
${params.primaryKeyword.trim() || "(none)"}

Existing FAQ content (if any)
(none)
`;

  const prompt = `Create exactly ${pairCount} FAQ pairs for this page.

Rules for each pair:
- question: one line, conversational, varied openings (what, how, why, can, should, which).
- answer: 2-4 concise sentences of reader-facing copy only. No bullet lists inside answers.
- Each question must be a different angle. Do not start more than one question with the same first 3 words.
- ${FAQ_CONVERSATIONAL_RULE}
- Ground answers in the article body and brief; do not paraphrase the main Answer H2.
- Use NAP/service area only to localize; do not broaden geography beyond the business area.
- Do not mention brand or site name in answers unless the article or brief already does.
${hasBrief ? "- Use the JSON SEO content brief as the primary intent signal. Do not paste JSON into answers.\n" : ""}

Forbidden in question and answer fields:
- Self-review, validation notes, or checklists (for example banned-word checks or "Good." / "Fine.")
- Meta commentary to an editor, instructions, or formatting notes
- Anything that is not the actual FAQ text a visitor should read

${sharedContext}`;

  const systemPrompt = hasBrief
    ? "You write FAQ question-and-answer pairs for published HTML tables. Return JSON matching the schema only. Each answer is final copy for site visitors, not draft notes. Use the SEO content brief as the main signal. Do not invent specs."
    : "You write FAQ question-and-answer pairs for published HTML tables. Return JSON matching the schema only. Each answer is final copy for site visitors, not draft notes. Ground answers in the article body. Do not invent specs.";

  try {
    const { parsed, content } = await callOpenRouterChatCompletion({
      apiKey: params.apiKey,
      model: getMetaModel(params.siteId ?? null),
      system: appendUniversalContentRulesToSystemPrompt(systemPrompt),
      user: prompt,
      temperature: 0.35,
      maxTokens: 2800,
      responseFormat: bulkFaqPairsResponseFormat(pairCount),
    });

    let payload: BulkFaqPairsPayload | null = null;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      payload = parsed as BulkFaqPairsPayload;
    } else if (content.trim()) {
      payload = JSON.parse(content) as BulkFaqPairsPayload;
    }

    const pairs = Array.isArray(payload?.pairs) ? payload!.pairs! : [];
    const cleaned: FaqEntry[] = pairs
      .map((p) => ({
        question: typeof p?.question === "string" ? p.question.trim() : "",
        answer: typeof p?.answer === "string" ? p.answer.trim() : "",
      }))
      .filter((e) => e.question.length > 0 && e.answer.length > 0)
      .slice(0, pairCount);

    return cleaned;
  } catch (e) {
    logger.warn("[Bulk FAQ in-context] OpenRouter failed:", e);
    return [];
  }
}
