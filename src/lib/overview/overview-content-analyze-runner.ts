import { z } from "zod";
import { splitHtmlForOverviewAudit } from "@/lib/overview/overview-post-html-audit-sections";
import { buildAnalyzeResultFromIssues, filterUnsoundAuditIssues, mergeHtmlReference, openRouterNonStreamCompletion, OVERVIEW_CONTENT_ANALYZE_MAX_HTML_CHARS, stripMarkdownCodeFenceFromModelOutput, type ContentAuditIssueRow, type OverviewContentAnalyzeResult } from "@/lib/overview/overview-content-audit-storage";

const analyzeAspectSchema = z
  .object({
    aspect: z.string().optional(),
    label: z.string().optional(),
    detail: z.string().optional(),
  })
  .transform((a) => ({
    aspect: (a.aspect ?? a.label ?? "Note").trim() || "Note",
    detail: (a.detail ?? "").trim(),
  }));

/** Model row; merges legacy aliases. */
const analyzeIssueEntrySchema = z
  .object({
    title: z.string().optional(),
    issue: z.string().optional(),
    summary: z.string().optional(),
    rationale: z.string().optional(),
    whyItMatters: z.string().optional(),
    rationaleAspects: z.array(analyzeAspectSchema).optional(),
    aspects: z.array(analyzeAspectSchema).optional(),
    proposedFix: z.string().optional(),
    fix: z.string().optional(),
    htmlReference: z.string().optional(),
    htmlSnippet: z.string().optional(),
    snippet: z.string().optional(),
    rawHtml: z.string().optional(),
    beforeMarkup: z.string().optional(),
    afterMarkup: z.string().optional(),
    markupBefore: z.string().optional(),
    markupAfter: z.string().optional(),
    beforeHtml: z.string().optional(),
    afterHtml: z.string().optional(),
    proTip: z.string().optional(),
  })
  .transform((x) => {
    const issue = (x.issue ?? x.summary ?? "").trim();
    const proposedFix = (x.proposedFix ?? x.fix ?? "").trim();
    const rationale = (x.rationale ?? x.whyItMatters ?? "").trim();
    const rawAspects = x.rationaleAspects ?? x.aspects ?? [];
    const rationaleAspects = rawAspects
      .map((a) => ({ aspect: a.aspect, detail: a.detail }))
      .filter((a) => a.detail.length > 0);
    const mergedForRef = mergeHtmlReference(x);
    const beforeMarkup = (x.beforeMarkup ?? x.markupBefore ?? x.beforeHtml ?? "").trim();
    const afterMarkup = (x.afterMarkup ?? x.markupAfter ?? x.afterHtml ?? "").trim();
    return {
      title: (x.title ?? "").trim(),
      issue,
      rationale,
      rationaleAspects,
      proposedFix,
      htmlReference: mergedForRef,
      beforeMarkup,
      afterMarkup,
      proTip: (x.proTip ?? "").trim(),
    };
  })
  .refine((x) => x.issue.length > 0, { message: "Each issue needs issue or summary text" });

const analyzeResponseSchema = z.object({
  issues: z.array(analyzeIssueEntrySchema),
  bullet_text: z.string().optional(),
});

function truncateHtmlForModel(html: string): { text: string; truncated: boolean } {
  if (html.length <= OVERVIEW_CONTENT_ANALYZE_MAX_HTML_CHARS) {
    return { text: html, truncated: false };
  }
  return {
    text: html.slice(0, OVERVIEW_CONTENT_ANALYZE_MAX_HTML_CHARS),
    truncated: true,
  };
}

/** Exported for tests: parse fenced JSON then validate analyze shape. */
export function parseOverviewAnalyzeResponseJson(raw: string): OverviewContentAnalyzeResult {
  const stripped = stripMarkdownCodeFenceFromModelOutput(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped) as unknown;
  } catch {
    throw new Error("Model did not return valid JSON for content analysis.");
  }
  const row = analyzeResponseSchema.safeParse(parsed);
  if (!row.success) {
    throw new Error(`Invalid analyze JSON: ${row.error.message}`);
  }
  const issues: ContentAuditIssueRow[] = row.data.issues.map((x) => ({
    title: x.title,
    issue: x.issue,
    rationale: x.rationale,
    rationaleAspects: x.rationaleAspects.filter((a) => a.detail.length > 0),
    proposedFix: x.proposedFix ?? "",
    htmlReference: x.htmlReference,
    beforeMarkup: x.beforeMarkup,
    afterMarkup: x.afterMarkup,
    proTip: x.proTip,
  }));
  return buildAnalyzeResultFromIssues(issues);
}

/** One prompt string; edit here only. Post-parse QA: filterUnsoundAuditIssues plus parseContentAuditStorage. */
export const OVERVIEW_CONTENT_ANALYZE_PROMPT = `You are an HTML content auditor for WordPress post_content. Your audience cares about readable structure and real-world impact (accessibility, clarity, credible SEO), not pointless tag counting.

Return ONLY valid JSON with this shape and nothing else:
{"issues":[{"title":"short category title","issue":"one-line summary","rationale":"2-6 sentences explaining why this matters beyond raw markup","rationaleAspects":[{"aspect":"Clarity","detail":"impact on skim-reading"},{"aspect":"SEO or structure","detail":"impact on headings and topical grouping"}],"proposedFix":"plain-language steps; you may cite tags like <h3>","beforeMarkup":"<brief flawed excerpt or empty>","afterMarkup":"<desired excerpt or empty>","htmlReference":"MULTI-LINE OK: contiguous copy straight from post HTML spanning the whole subsection you discuss ( headings, paragraphs, list items, wrappers). Prefer the full neighbouring block someone would see in Code editor, often from an opening heading through the related paragraph(s), NOT a fragment so small that the reader cannot match it. Escape JSON strings normally (quotes and newlines as JSON allows). Must be verbatim from the HTML below. Empty string forbidden for a qualifying issue unless you omit the issue entirely.","proTip":"practice tip or empty string"},...]}

Rules:
- "htmlReference" is the ground truth readers use: one contiguous verbatim slice from the HTML section below, large enough that they recognize the passage in Code view. Alias keys "htmlSnippet", "snippet", or "rawHtml" are tolerated by the parser but prefer "htmlReference".
- Optionally set "beforeMarkup" and "afterMarkup" as short snippets that illustrate one concrete markup change like a Gemini auditor. If either is nonempty, BOTH must be nonempty AND beforeMarkup must differ character-for-character from afterMarkup (never paste the identical HTML into Before and After). If you cannot show a truthful contrasting pair, set both strings to exactly "" rather than implying a faux diff.
- The issue narrative must remain true relative to htmlReference alone. Never claim something is absent in the pasted reference if htmlReference visibly already contains what you prescribe (such as opening <h3> for that section already present).
- "rationale" and "rationaleAspects" must be substantive human reasons (not only tag-legality trivia).
- "title", "issue", "proposedFix" must be understandable without opening DevTools jargon.
- Do not invent htmlReference; if no contiguous match exists for an issue you want to mention, omit that issue.
- Prefer {"issues":[]} over low-confidence filler. Only emit issues an editor could defend beside the pasted reference.
- Do not mention h1. Do not discuss meta description, SERP plugins, or keyword density.
- A <footer> inside post_content is normal sometimes. Do NOT emit filler issues that only tell the user to ignore the footer unless there is a concrete defect inside that markup.
- If there are no qualifying issues return {"issues":[]}.
- Cap at 24 issues.

---
`;

/** Section-local audit slice: same schema as OVERVIEW_CONTENT_ANALYZE_PROMPT with cross-section forbiddance (SECTION_HTML grounding only). */
export const OVERVIEW_SECTION_CONTENT_ANALYZE_PROMPT = `You are auditing ONE contiguous slice ("SECTION_HTML") of WordPress post_content. Anything outside SECTION_HTML does not exist for you: never claim headings, spacing, wrappers, outlines, canonical structure, footer usage, prior sections, later sections, or site-wide semantics that are not verbatim inside SECTION_HTML.

Return ONLY valid JSON with this shape (identical schema to NEO Pulse's whole-post HTML audit):
{"issues":[{"title":"short category title","issue":"one-line summary","rationale":"2-6 sentences explaining why this matters beyond raw markup","rationaleAspects":[{"aspect":"Clarity","detail":"impact visible inside this slice"},{"aspect":"SEO or structure","detail":"impact on structure inside SECTION_HTML"}],"proposedFix":"plain-language steps; cite only tags/snippets present in SECTION_HTML","beforeMarkup":"<brief flawed excerpt or empty>","afterMarkup":"<desired excerpt or empty>","htmlReference":"MULTI-LINE OK: one contiguous verbatim slice copied only from SECTION_HTML. Large enough readers match it in Code view. Prefer the full neighbouring block you discuss, not an unrelated microscopic fragment. Alias keys htmlSnippet, snippet, rawHtml are tolerated. Empty string forbids emitting the finding.","proTip":"practice tip or empty string"},...]}

Section rules:
- "htmlReference" must be verbatim from SECTION_HTML only and overlap the prose you criticize when it references markup.
- If either "beforeMarkup" or "afterMarkup" is nonempty, BOTH must differ character-for-character. Otherwise set BOTH to exactly "".

Shared rules mirrored from NEO Pulse whole-document auditing:
- Never invent snippets; omit low-confidence filler. Prefer {"issues":[]}.
- "rationale" and "rationaleAspects" must be substantive human reasons.
- Do not mention h1 or SERP-density noise.
- If there are no qualifying issues visible inside SECTION_HTML alone return {"issues":[]}.
- Cap at 24 issues.

---
`;

export type OverviewContentAnalyzeSectionProgress = {
  phase: "start" | "done";
  sectionIndex: number;
  sectionLabel: string;
  totalSections: number;
  sliceIssueCount?: number;
  sliceIssues?: ContentAuditIssueRow[];
};

export async function analyzeOverviewPostHtmlBySections(args: {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  pageUrl: string;
  html: string;
  signal?: AbortSignal;
  onSectionProgress?: (e: OverviewContentAnalyzeSectionProgress) => void;
}): Promise<OverviewContentAnalyzeResult> {
  const sections = splitHtmlForOverviewAudit(args.html);
  const totalSections = sections.length;
  const merged: ContentAuditIssueRow[] = [];

  for (const sec of sections) {
    const sliceTrim = sec.html.trim();
    if (!sliceTrim) {
      args.onSectionProgress?.({
        phase: "start",
        sectionIndex: sec.sectionIndex,
        sectionLabel: sec.sectionLabel,
        totalSections,
      });
      args.onSectionProgress?.({
        phase: "done",
        sectionIndex: sec.sectionIndex,
        sectionLabel: sec.sectionLabel,
        totalSections,
        sliceIssueCount: 0,
        sliceIssues: [],
      });
      continue;
    }

    args.onSectionProgress?.({
      phase: "start",
      sectionIndex: sec.sectionIndex,
      sectionLabel: sec.sectionLabel,
      totalSections,
    });

    const { text: modelSlice, truncated: sliceTruncated } = truncateHtmlForModel(sliceTrim);

    const user =
      `${OVERVIEW_SECTION_CONTENT_ANALYZE_PROMPT}\n` +
      `Page URL: ${args.pageUrl}\n` +
      `Section title: ${sec.sectionLabel}\n` +
      `Section index (0-based): ${sec.sectionIndex}\n` +
      (sliceTruncated
        ? `NOTE: sectional excerpt capped at ${OVERVIEW_CONTENT_ANALYZE_MAX_HTML_CHARS} chars.\n`
        : "") +
      `SECTION_HTML:\n${modelSlice}`;

    const raw = await openRouterNonStreamCompletion({
      apiKey: args.apiKey,
      model: args.model,
      temperature: args.temperature,
      maxTokens: args.maxTokens,
      topP: args.topP,
      messages: [{ role: "user", content: user }],
      signal: args.signal,
    });

    let parsedIssues = parseOverviewAnalyzeResponseJson(raw).issues;
    parsedIssues = parsedIssues.map((iss) => ({
      ...iss,
      sectionIndex: sec.sectionIndex,
      sectionLabel: sec.sectionLabel,
    }));
    const sliceFiltered = filterUnsoundAuditIssues(sliceTrim, parsedIssues);
    merged.push(...sliceFiltered);

    args.onSectionProgress?.({
      phase: "done",
      sectionIndex: sec.sectionIndex,
      sectionLabel: sec.sectionLabel,
      totalSections,
      sliceIssueCount: sliceFiltered.length,
      sliceIssues: sliceFiltered,
    });
  }

  const globalFiltered = filterUnsoundAuditIssues(args.html, merged);
  return buildAnalyzeResultFromIssues(globalFiltered);
}

export async function analyzeOverviewPostHtml(args: {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  pageUrl: string;
  html: string;
  signal?: AbortSignal;
  onSectionProgress?: (e: OverviewContentAnalyzeSectionProgress) => void;
}): Promise<OverviewContentAnalyzeResult> {
  return analyzeOverviewPostHtmlBySections(args);
}
