/**
 * Overview tile: HTML content analyze + targeted fix via OpenRouter (contract-first).
 * WordPress fetch/upload is performed by callers; this module handles LLM + verify loop only.
 */

import { z } from "zod";
import { clampOpenRouterMaxTokens } from "@/lib/openrouter-stream-chat-core";
import type { WordPressPostContent } from "@/lib/wordpress-api/types";
import { splitHtmlForOverviewAudit } from "@/lib/overview/overview-post-html-audit-sections";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";


/** Max outer verify iterations (re-fetch, fix, re-analyze). */
export const MAX_VERIFY_PASSES = 3;

/** Large posts: trim for analyze only; fixes require full payload under cap. */
export const OVERVIEW_CONTENT_ANALYZE_MAX_HTML_CHARS = 120_000;
/** Refuse automated fix passes when REST body exceeds this (avoids half-page model output). */
export const OVERVIEW_AUTOFIX_MAX_HTML_CHARS = 150_000;

/** Legacy: bullet lines no longer embed full HTML when reference appendix exists (full HTML appended to fix request). */
const REF_INLINE_IN_BULLET_MAX_CHARS = 480;

function mergeHtmlReference(x: {
  htmlReference?: string;
  htmlSnippet?: string;
  snippet?: string;
  rawHtml?: string;
}): string {
  return (x.htmlReference ?? x.htmlSnippet ?? x.snippet ?? x.rawHtml ?? "").trim();
}

/** One labelled impact line ("Accessibility", "SEO", …). */
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

const contentAuditStoredIssueSchema = z
  .object({
    title: z.string().optional(),
    issue: z.string(),
    rationale: z.string().optional(),
    rationaleAspects: z.array(z.object({ aspect: z.string(), detail: z.string() })).optional(),
    proposedFix: z.string().optional(),
    htmlReference: z.string().optional(),
    htmlSnippet: z.string().optional(),
    beforeMarkup: z.string().optional(),
    afterMarkup: z.string().optional(),
    proTip: z.string().optional(),
    sectionIndex: z.number().optional(),
    sectionLabel: z.string().optional(),
  })
  .transform((x) => ({
    title: (x.title ?? "").trim(),
    issue: x.issue.trim(),
    rationale: (x.rationale ?? "").trim(),
    rationaleAspects: Array.isArray(x.rationaleAspects) ? x.rationaleAspects : [],
    proposedFix: (x.proposedFix ?? "").trim(),
    htmlReference: mergeHtmlReference({
      htmlReference: x.htmlReference,
      htmlSnippet: x.htmlSnippet,
    }),
    beforeMarkup: (x.beforeMarkup ?? "").trim(),
    afterMarkup: (x.afterMarkup ?? "").trim(),
    proTip: (x.proTip ?? "").trim(),
    sectionIndex:
      typeof x.sectionIndex === "number" && Number.isFinite(x.sectionIndex) ? x.sectionIndex : undefined,
    sectionLabel: (() => {
      const s = (x.sectionLabel ?? "").trim();
      return s.length > 0 ? s : undefined;
    })(),
  }));

const contentAuditStoredSchema = z.object({
  neoPulseContentAuditV1: z.object({
    issues: z.array(contentAuditStoredIssueSchema),
  }),
});

const fixResponseSchema = z.object({
  html: z.string(),
});

/** Model wraps full HTML outside JSON so literals (newlines) do not break JSON.parse (see debug H3). */
export const OVERVIEW_FIX_HTML_BLOCK_START = "<<<NEO_PULSE_HTML_FIX>>>";
export const OVERVIEW_FIX_HTML_BLOCK_END = "<<<END_NEO_PULSE_HTML_FIX>>>";

export type ContentAuditAspectBullet = { aspect: string; detail: string };

/** One finding: human-readable layers plus markup evidence (Gemini-style audit card). */
export type ContentAuditIssueRow = {
  title: string;
  issue: string;
  rationale: string;
  rationaleAspects: ContentAuditAspectBullet[];
  proposedFix: string;
  /** Contiguous verbatim copy from post HTML covering every tag you cite (often a full subsection). */
  htmlReference: string;
  /** Optional micro comparison: flawed markup snippet. */
  beforeMarkup: string;
  /** Optional micro comparison: desired markup snippet. */
  afterMarkup: string;
  proTip: string;
  /** When issues were merged from sectional passes (0-based). */
  sectionIndex?: number;
  /** Human-readable section label after split (matches overview harness list). */
  sectionLabel?: string;
};

export type OverviewContentAnalyzeResult = {
  issues: ContentAuditIssueRow[];
  /** Persist on OverviewRow.contentAnalyzeBulletsMarkdown */
  storedJson: string;
  /** Short bullets for the fix model (finding index + summary + apply). */
  fixBulletsMarkdown: string;
  /** Full verbatim HTML blocks aligned to findings; appended to the fix prompt. */
  fixReferenceAppendix: string;
};

/** High-level UX phase for Overview Agree & fix (model, WordPress save, verify pass). */
export type OverviewContentAnalyzeFixBusyPhase =
  | "applying_fixes"
  | "saving_wordpress"
  | "verifying_audit";

export function overviewContentAnalyzeFixBusyPhaseLabel(
  p: OverviewContentAnalyzeFixBusyPhase,
): string {
  switch (p) {
    case "applying_fixes":
      return "Applying fixes with the model. Large posts can take several minutes.";
    case "saving_wordpress":
      return "Saving updated HTML to WordPress.";
    case "verifying_audit":
      return "Re-running content audit on the saved post.";
  }
  const _exhaustive: never = p;
  return _exhaustive;
}

/**
 * Drops findings that contradict their own markup (deterministic QA).
 *
 * When `verbatimSourceHtml` is set: drop if nonempty htmlReference is not a verbatim substring,
 * otherwise model output is unreliable for fixes.
 *
 * Always drop when beforeMarkup and afterMarkup are nonempty but identical (no contrast).
 *
 * When `verbatimSourceHtml` is null (e.g. loading stored audit without fetching post body),
 * only the identical-before/after rule applies.
 */
export function filterUnsoundAuditIssues(
  verbatimSourceHtml: string | null,
  issues: ContentAuditIssueRow[],
): ContentAuditIssueRow[] {
  const haystack = verbatimSourceHtml ?? "";
  const out: ContentAuditIssueRow[] = [];
  for (const row of issues) {
    const ref = row.htmlReference.trim();
    const bm = row.beforeMarkup.trim();
    const am = row.afterMarkup.trim();
    if (bm.length > 0 && bm === am) continue;
    if (verbatimSourceHtml !== null && ref.length > 0 && !haystack.includes(ref)) continue;
    out.push(row);
  }
  return out;
}

function buildAnalyzeResultFromIssues(issues: ContentAuditIssueRow[]): OverviewContentAnalyzeResult {
  return {
    issues,
    storedJson: serializeContentAuditV1(issues),
    fixBulletsMarkdown: issuesToFixBulletsMarkdown(issues),
    fixReferenceAppendix: buildAuditReferenceAppendix(issues),
  };
}

function snippetForBulletHint(htmlReference: string): string {
  const t = htmlReference.trim();
  if (!t || REF_INLINE_IN_BULLET_MAX_CHARS <= 0) return "";
  if (t.length <= REF_INLINE_IN_BULLET_MAX_CHARS) return t;
  return `${t.slice(0, REF_INLINE_IN_BULLET_MAX_CHARS)}…`;
}

/** Full HTML excerpts for the fix pass (nothing truncated here). */
export function buildAuditReferenceAppendix(issues: ContentAuditIssueRow[]): string {
  const parts: string[] = [];
  for (let i = 0; i < issues.length; i++) {
    const row = issues[i]!;
    const ref = row.htmlReference.trim();
    if (!ref) continue;
    const proposed = row.proposedFix.trim();
    const bm = row.beforeMarkup.trim();
    const am = row.afterMarkup.trim();
    const blockLines: (string | null)[] = [
      `FINDING_${i + 1}`,
      typeof row.sectionIndex === "number" ? `SECTION_INDEX: ${row.sectionIndex}` : null,
      row.sectionLabel && row.sectionLabel.trim().length > 0 ? `SECTION: ${row.sectionLabel.trim()}` : null,
      `TITLE: ${row.title.trim() || "(none)"}`,
      `SUMMARY: ${row.issue}`,
      proposed.length > 0 ? `PROPOSED_FIX: ${proposed}` : null,
    ];
    if (bm.length > 0 && am.length > 0 && bm !== am) {
      blockLines.push(
        "BEFORE_MARKUP_START",
        bm,
        "BEFORE_MARKUP_END",
        "AFTER_MARKUP_START",
        am,
        "AFTER_MARKUP_END",
      );
    }
    blockLines.push("REFERENCE_HTML_START", `${ref}`, "REFERENCE_HTML_END");
    parts.push(
      blockLines.filter((line): line is string => typeof line === "string" && line.length > 0).join("\n"),
    );
  }
  if (!parts.length) return "";
  return [
    "",
    "REFERENCE_HTML_FROM_AUDIT:",
    "",
    ...parts.map((block, i) => (i === 0 ? block : `---\n${block}`)),
    "",
    "Each REFERENCE_HTML block must appear verbatim in the HTML you are editing (whole-document ORIGINAL_HTML or sectional SECTION_HTML). Implement PROPOSED_FIX literally for tag and list changes when it names tags or elements.",
    "",
  ].join("\n");
}

/** Short bullets plus full appendix for Agree & fix. */
export function auditIssuesToFixPassPayload(issues: ContentAuditIssueRow[]): {
  bulletsMarkdown: string;
  referenceAppendix: string;
} {
  return {
    bulletsMarkdown: issuesToFixBulletsMarkdown(issues),
    referenceAppendix: buildAuditReferenceAppendix(issues),
  };
}

/** One line per finding for the model (readable; full HTML is in appendix). */
export function issuesToFixBulletsMarkdown(issues: ContentAuditIssueRow[]): string {
  return issues
    .map((row, i) => {
      const n = i + 1;
      const title = row.title.trim();
      const fx = row.proposedFix.trim();
      const head = title.length > 0 ? `[${title}] ${row.issue}` : row.issue;
      const chunks: string[] = [`Finding ${n}: ${head}`];
      const sectionBits: string[] = [];
      if (typeof row.sectionIndex === "number" && Number.isFinite(row.sectionIndex)) {
        sectionBits.push(`#${row.sectionIndex + 1}`);
      }
      if (typeof row.sectionLabel === "string" && row.sectionLabel.trim().length > 0) {
        sectionBits.push(row.sectionLabel.trim());
      }
      if (sectionBits.length > 0) {
        chunks.push(`Section: ${sectionBits.join(" - ")}`);
      }
      const hint = snippetForBulletHint(row.htmlReference);
      if (hint.length > 0) {
        chunks.push(`HTML preview: ${hint}`);
      } else if (row.htmlReference.trim().length > 0) {
        chunks.push(`Full HTML for finding ${n}: see REFERENCE_HTML_FROM_AUDIT below`);
      }
      if (fx.length > 0) {
        chunks.push(`Apply: ${fx}`);
      }
      return `- ${chunks.join(" | ")}`;
    })
    .join("\n");
}

export function serializeContentAuditV1(issues: ContentAuditIssueRow[]): string {
  return JSON.stringify({
    neoPulseContentAuditV1: {
      issues: issues.map((x) => {
        const base = {
          title: x.title.trim(),
          issue: x.issue.trim(),
          rationale: x.rationale.trim(),
          rationaleAspects: x.rationaleAspects.map((a) => ({
            aspect: a.aspect.trim(),
            detail: a.detail.trim(),
          })),
          proposedFix: (x.proposedFix ?? "").trim(),
          htmlReference: (x.htmlReference ?? "").trim(),
          beforeMarkup: (x.beforeMarkup ?? "").trim(),
          afterMarkup: (x.afterMarkup ?? "").trim(),
          proTip: (x.proTip ?? "").trim(),
        };
        const out: typeof base & { sectionIndex?: number; sectionLabel?: string } = { ...base };
        if (typeof x.sectionIndex === "number" && Number.isFinite(x.sectionIndex)) {
          out.sectionIndex = x.sectionIndex;
        }
        const label = typeof x.sectionLabel === "string" ? x.sectionLabel.trim() : "";
        if (label.length > 0) {
          out.sectionLabel = label;
        }
        return out;
      }),
    },
  });
}

export type ParsedContentAuditStorage =
  | { kind: "v1"; issues: ContentAuditIssueRow[] }
  | { kind: "legacy"; lines: string[] };

export function parseContentAuditStorage(raw: string): ParsedContentAuditStorage {
  const t = raw.trim();
  if (!t) return { kind: "legacy", lines: [] };
  if (t.startsWith("{")) {
    try {
      const parsed = JSON.parse(t) as unknown;
      const row = contentAuditStoredSchema.safeParse(parsed);
      if (row.success) {
        const mappedIssues = row.data.neoPulseContentAuditV1.issues
          .map((x) => ({
            title: x.title.trim(),
            issue: x.issue.trim(),
            rationale: x.rationale.trim(),
            rationaleAspects: x.rationaleAspects
              .filter((a) => a.detail.trim().length > 0)
              .map((a) => ({
                aspect: (a.aspect ?? "Note").trim() || "Note",
                detail: a.detail.trim(),
              })),
            proposedFix: (x.proposedFix ?? "").trim(),
            htmlReference: (x.htmlReference ?? "").trim(),
            beforeMarkup: (x.beforeMarkup ?? "").trim(),
            afterMarkup: (x.afterMarkup ?? "").trim(),
            proTip: (x.proTip ?? "").trim(),
            sectionIndex:
              typeof x.sectionIndex === "number" && Number.isFinite(x.sectionIndex)
                ? x.sectionIndex
                : undefined,
            sectionLabel:
              typeof x.sectionLabel === "string" && x.sectionLabel.trim().length > 0
                ? x.sectionLabel.trim()
                : undefined,
          }))
          .filter((x) => x.issue.length > 0);
        const issues = filterUnsoundAuditIssues(null, mappedIssues);
        return { kind: "v1", issues };
      }
    } catch {
      /* legacy */
    }
  }
  return { kind: "legacy", lines: bulletsMarkdownToLines(t) };
}

/** Build fix-model bullet list from row storage (v1 JSON or legacy markdown). */
export function contentAuditStorageToFixBulletsMarkdown(raw: string): string {
  return auditStorageToFixPassPayload(raw).bulletsMarkdown;
}

export function auditStorageToFixPassPayload(raw: string): {
  bulletsMarkdown: string;
  referenceAppendix: string;
} {
  const parsed = parseContentAuditStorage(raw);
  if (parsed.kind !== "v1") {
    const bulletsMarkdown = parsed.lines.map((l) => (l.startsWith("-") ? l : `- ${l}`)).join("\n");
    return { bulletsMarkdown, referenceAppendix: "" };
  }
  return auditIssuesToFixPassPayload(parsed.issues);
}

/**
 * Stamp missing sectionIndex / sectionLabel by finding the single overview audit slice whose HTML
 * contains htmlReference verbatim. Leaves rows unchanged when ref is empty, ambiguous (0 or 2+
 * matches), or sectionIndex already set.
 */
export function inferAuditIssueSectionIndices(
  html: string,
  issues: ContentAuditIssueRow[],
): ContentAuditIssueRow[] {
  const splits = splitHtmlForOverviewAudit(html);
  return issues.map((row) => {
    if (typeof row.sectionIndex === "number" && Number.isFinite(row.sectionIndex)) {
      return row;
    }
    const ref = row.htmlReference.trim();
    if (!ref.length) {
      return row;
    }
    const matches = splits.filter((s) => s.html.includes(ref));
    if (matches.length !== 1) {
      return row;
    }
    const sec = matches[0]!;
    return { ...row, sectionIndex: sec.sectionIndex, sectionLabel: sec.sectionLabel };
  });
}


/** Strip optional ```json ... ``` fences from model output. Exported for tests. */
export function stripMarkdownCodeFenceFromModelOutput(raw: string): string {
  let s = raw.trim();
  const fence = /^```(?:json)?\s*\n?([\s\S]*?)\n?```\s*$/i.exec(s);
  if (fence?.[1]) s = fence[1].trim();
  return s;
}

function truncateHtmlForModel(html: string): { text: string; truncated: boolean } {
  if (html.length <= OVERVIEW_CONTENT_ANALYZE_MAX_HTML_CHARS) {
    return { text: html, truncated: false };
  }
  return {
    text: html.slice(0, OVERVIEW_CONTENT_ANALYZE_MAX_HTML_CHARS),
    truncated: true,
  };
}

async function openRouterNonStreamCompletion(args: {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  messages: Array<{ role: "system" | "user"; content: string }>;
  signal?: AbortSignal;
}): Promise<string> {
  const safeMax = clampOpenRouterMaxTokens(args.maxTokens);
  const response = await postOpenRouterAppChatFetch({
    method: "POST",
    body: JSON.stringify({
      model: args.model,
      messages: args.messages,
      temperature: args.temperature,
      max_tokens: safeMax,
      top_p: args.topP,
      stream: false,
    }),
    signal: args.signal,
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`OpenRouter HTTP ${response.status}: ${errText.slice(0, 500)}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const content = (data.choices?.[0]?.message?.content ?? "").trim();
  if (!content) {
    throw new Error("OpenRouter returned empty content.");
  }
  return content;
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

/** Normalize editable textarea bullets into newline list */
export function bulletsMarkdownToLines(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
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

/** Exported for tests: parse fenced JSON then validate fix shape (fallback when delimiter block missing). */
export function parseOverviewFixResponseJson(raw: string): string {
  const stripped = stripMarkdownCodeFenceFromModelOutput(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped) as unknown;
  } catch {
    throw new Error("Model did not return valid JSON for HTML fix.");
  }
  const row = fixResponseSchema.safeParse(parsed);
  if (!row.success) {
    throw new Error(`Invalid fix JSON: ${row.error.message}`);
  }
  return row.data.html;
}

/**
 * Prefer delimiter-wrapped HTML (avoids embedding raw HTML inside JSON strings; models often emit
 * literal newlines and break JSON.parse with "Bad control character in string literal").
 */
export function extractOverviewFixHtmlFromModelRaw(raw: string): string {
  const trimmed = raw.trim();

  const start = trimmed.indexOf(OVERVIEW_FIX_HTML_BLOCK_START);
  const end = trimmed.indexOf(OVERVIEW_FIX_HTML_BLOCK_END);
  if (start !== -1 && end !== -1 && end > start + OVERVIEW_FIX_HTML_BLOCK_START.length) {
    const html = trimmed.slice(start + OVERVIEW_FIX_HTML_BLOCK_START.length, end).trim();
    if (html.length > 0) {
      return html;
    }
  }

  return parseOverviewFixResponseJson(trimmed);
}

/** True when every issue has a sectionIndex that exists in `splitHtmlForOverviewAudit(html)`. */
export function canUseStitchedSectionFix(html: string, issues: ContentAuditIssueRow[]): boolean {
  if (issues.length === 0) return false;
  if (!issues.every((i) => typeof i.sectionIndex === "number" && Number.isFinite(i.sectionIndex))) {
    return false;
  }
  const splits = splitHtmlForOverviewAudit(html);
  const maxIdx = splits.length - 1;
  return issues.every((i) => {
    const ix = i.sectionIndex as number;
    return ix >= 0 && ix <= maxIdx;
  });
}

async function applyOverviewHtmlFixesStitchedBySections(args: {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  pageUrl: string;
  html: string;
  issues: ContentAuditIssueRow[];
  signal?: AbortSignal;
}): Promise<string> {
  const splits = splitHtmlForOverviewAudit(args.html);
  const byIndex = new Map<number, ContentAuditIssueRow[]>();
  for (const iss of args.issues) {
    const ix = iss.sectionIndex as number;
    const list = byIndex.get(ix) ?? [];
    list.push(iss);
    byIndex.set(ix, list);
  }

  const pieces: string[] = [];
  for (const sec of splits) {
    const sliceIssues = byIndex.get(sec.sectionIndex) ?? [];
    if (sliceIssues.length === 0) {
      pieces.push(sec.html);
      continue;
    }
    const { bulletsMarkdown, referenceAppendix } = auditIssuesToFixPassPayload(sliceIssues);
    const fixedSlice = await applyOverviewHtmlFixesToAuditSlice({
      apiKey: args.apiKey,
      model: args.model,
      temperature: args.temperature,
      maxTokens: args.maxTokens,
      topP: args.topP,
      pageUrl: args.pageUrl,
      sectionIndex: sec.sectionIndex,
      sectionLabel: sec.sectionLabel,
      sliceHtml: sec.html,
      bulletsMarkdown,
      referenceAppendix,
      signal: args.signal,
    });
    const trimmed = fixedSlice.trim();
    pieces.push(trimmed);
  }

  return pieces.join("");
}

/**
 * Apply audit bullets to one `splitHtmlForOverviewAudit` slice; model returns delimiter-wrapped slice HTML only.
 */
export async function applyOverviewHtmlFixesToAuditSlice(args: {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  pageUrl: string;
  sectionIndex: number;
  sectionLabel: string;
  sliceHtml: string;
  bulletsMarkdown: string;
  referenceAppendix?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const lines = bulletsMarkdownToLines(args.bulletsMarkdown);
  if (!lines.length) {
    throw new Error("No bullet fixes to apply for this section.");
  }

  if (args.sliceHtml.length > OVERVIEW_AUTOFIX_MAX_HTML_CHARS) {
    throw new Error(
      `Section HTML is ${args.sliceHtml.length} characters; auto-fix supports up to ${OVERVIEW_AUTOFIX_MAX_HTML_CHARS} characters per slice. Use Optimize content manually for very large slices.`,
    );
  }

  const system = `You revise ONE contiguous SECTION_HTML slice from WordPress post_content. Return it using ONLY this delimiter format (no JSON no markdown fences no prose):

${OVERVIEW_FIX_HTML_BLOCK_START}
... paste the FULL updated SECTION_HTML here as raw markup ...
${OVERVIEW_FIX_HTML_BLOCK_END}

Rules:
- Do not write anything outside those two delimiter lines except a single newline after the end delimiter if needed.
- Implement every bullet in BULLET FIXES that applies to this slice (matching Section index or FINDING SECTION_INDEX). When FINDING_* includes PROPOSED_FIX, BEFORE_MARKUP, or AFTER_MARKUP, treat them as authoritative for that finding. For heading or list-tag changes explicitly named there or in Apply:, match those tags exactly (for example changing h3 to h2 means that exact substitution in the grounded REFERENCE_HTML region only).
- When REFERENCE_HTML_FROM_AUDIT appears, each FINDING block must map to a verbatim substring of SECTION_HTML before you edit that region, or omit that bullet.
- Do not rewrite unrelated headings, lists, or copy. Preserve all markup and wording outside the bullets you apply.
- Do not invent unrelated SEO copy keyword stuffing or structural rewrites.
- Return the ENTIRE corrected SECTION_HTML for this slice between the markers. Do not return the full post, only this section's markup.`;

  const appendix = (args.referenceAppendix ?? "").trim();
  const user = `Page URL: ${args.pageUrl}
Section index (0-based): ${args.sectionIndex}
Section title: ${args.sectionLabel}

BULLET FIXES TO APPLY:
${lines.map((l) => `- ${l}`).join("\n")}
${appendix.length > 0 ? `\n${appendix}\n` : ""}
SECTION_HTML:
${args.sliceHtml}`;

  const raw = await openRouterNonStreamCompletion({
    apiKey: args.apiKey,
    model: args.model,
    temperature: Math.min(args.temperature, 0.4),
    maxTokens: args.maxTokens,
    topP: args.topP,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    signal: args.signal,
  });

  return extractOverviewFixHtmlFromModelRaw(raw);
}

export async function applyOverviewHtmlFixesFromBullets(args: {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  pageUrl: string;
  html: string;
  bulletsMarkdown: string;
  /** Full verbatim FINDING_* HTML blocks appended after bullets (preferred over tiny inline hints). */
  referenceAppendix?: string;
  signal?: AbortSignal;
}): Promise<string> {
  const lines = bulletsMarkdownToLines(args.bulletsMarkdown);
  if (!lines.length) {
    throw new Error("No bullet fixes to apply.");
  }

  if (args.html.length > OVERVIEW_AUTOFIX_MAX_HTML_CHARS) {
    throw new Error(
      `HTML is ${args.html.length} characters; auto-fix supports up to ${OVERVIEW_AUTOFIX_MAX_HTML_CHARS}. Use Optimize content manually for very large bodies.`,
    );
  }

  const text = args.html;

  const system = `You revise WordPress post body HTML and return it using ONLY this delimiter format (no JSON no markdown fences no prose):

${OVERVIEW_FIX_HTML_BLOCK_START}
... paste the FULL updated HTML here as raw markup ...
${OVERVIEW_FIX_HTML_BLOCK_END}

Rules:
- Do not write anything outside those two delimiter lines except a single newline after the end delimiter if needed.
- Implement every bullet in BULLET FIXES. When FINDING_* blocks include PROPOSED_FIX or BEFORE_MARKUP and AFTER_MARKUP, treat them as authoritative for that finding. Obey Apply: lines for explicit tag-level changes (heading levels, ul/li wrappers, and similar).
- Locate each FINDING inside ORIGINAL_HTML using REFERENCE_HTML verbatim before editing. Do not rewrite unrelated headings, lists, or copy.
- Do not invent unrelated SEO copy keyword stuffing or structural rewrites.
- Preserve headings sections and wording except where a bullet requires a change.
- Return the ENTIRE corrected post body HTML between the markers.`;

  const appendix = (args.referenceAppendix ?? "").trim();
  const user = `Page URL: ${args.pageUrl}

BULLET FIXES TO APPLY:
${lines.map((l) => `- ${l}`).join("\n")}
${appendix.length > 0 ? `\n${appendix}\n` : ""}
ORIGINAL HTML:
${text}`;


  const raw = await openRouterNonStreamCompletion({
    apiKey: args.apiKey,
    model: args.model,
    temperature: Math.min(args.temperature, 0.4),
    maxTokens: args.maxTokens,
    topP: args.topP,
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    signal: args.signal,
  });

  return extractOverviewFixHtmlFromModelRaw(raw);
}

function wpRenderableString(v: unknown): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (
    typeof v === "object" &&
    v !== null &&
    "rendered" in v &&
    typeof (v as { rendered?: unknown }).rendered === "string"
  ) {
    return (v as { rendered: string }).rendered;
  }
  if (
    typeof v === "object" &&
    v !== null &&
    "raw" in v &&
    typeof (v as { raw?: unknown }).raw === "string"
  ) {
    return (v as { raw: string }).raw;
  }
  return String(v);
}

/** Map WordPress REST content for update-call title field. */
export function titleForWpUpdate(post: WordPressPostContent): string {
  const t = wpRenderableString(post.title as unknown).trim();
  return t || "Untitled";
}

export function excerptForWpUpdate(post: WordPressPostContent): string | undefined {
  const e = wpRenderableString(post.excerpt as unknown).trim();
  return e.length > 0 ? e : undefined;
}

export async function runOverviewContentAnalyzeFixLoop(args: {
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  topP: number;
  pageUrl: string;
  initialBulletsMarkdown: string;
  /** Matches stored audit JSON appendix (verbatim HTML blocks); optional when only legacy bullets exist. */
  initialReferenceAppendix?: string;
  /**
   * v1 audit JSON persisted on the row (same field as bullets when audit is stored as JSON).
   * Used to group findings by section; falls back to `initialBulletsMarkdown` when omitted.
   */
  initialStoredJson?: string;
  fetchPost: () => Promise<WordPressPostContent>;
  updatePostContent: (payload: { content: string; sourcePost: WordPressPostContent }) => Promise<void>;
  signal?: AbortSignal;
  /** Progress label for Overview UI (determinate bars do not fit long OpenRouter waits). */
  onFixBusyPhase?: (phase: OverviewContentAnalyzeFixBusyPhase) => void;
  onPass?: (state: {
    pass: number;
    storedJson: string;
    issuesCount: number;
    clean: boolean;
  }) => void;
}): Promise<{ clean: boolean; storedJson: string; passesUsed: number }> {
  let bullets = args.initialBulletsMarkdown.trim();
  if (!bulletsMarkdownToLines(bullets).length) {
    throw new Error("Add at least one fix bullet before running Agree & fix.");
  }

  let referenceAppendix = (args.initialReferenceAppendix ?? "").trim();
  let auditStorageForGrouping = (args.initialStoredJson ?? args.initialBulletsMarkdown).trim();

  let lastStoredJson = "";

  for (let pass = 1; pass <= MAX_VERIFY_PASSES; pass++) {
    if (args.signal?.aborted) {
      const e = new Error("Aborted");
      e.name = "AbortError";
      throw e;
    }

    const post = await args.fetchPost();
    const html = (post.content ?? "").trim();
    if (!html) {
      throw new Error("Post body is empty in WordPress.");
    }

    args.onFixBusyPhase?.("applying_fixes");

    const parsed = parseContentAuditStorage(auditStorageForGrouping);
    let fixedTrim: string;

    if (parsed.kind !== "v1") {
      const fixed = await applyOverviewHtmlFixesFromBullets({
        apiKey: args.apiKey,
        model: args.model,
        temperature: args.temperature,
        maxTokens: args.maxTokens,
        topP: args.topP,
        pageUrl: args.pageUrl,
        html,
        bulletsMarkdown: bullets,
        referenceAppendix,
        signal: args.signal,
      });
      fixedTrim = fixed.trim();
    } else {
      const sound = filterUnsoundAuditIssues(html, parsed.issues);
      const soundForFix = inferAuditIssueSectionIndices(html, sound);
      if (soundForFix.length === 0) {
        fixedTrim = html;
      } else if (canUseStitchedSectionFix(html, soundForFix)) {
        const fixed = await applyOverviewHtmlFixesStitchedBySections({
          apiKey: args.apiKey,
          model: args.model,
          temperature: args.temperature,
          maxTokens: args.maxTokens,
          topP: args.topP,
          pageUrl: args.pageUrl,
          html,
          issues: soundForFix,
          signal: args.signal,
        });
        fixedTrim = fixed.trim();
      } else {
        const { bulletsMarkdown: bm, referenceAppendix: apx } = auditIssuesToFixPassPayload(soundForFix);
        const fixed = await applyOverviewHtmlFixesFromBullets({
          apiKey: args.apiKey,
          model: args.model,
          temperature: args.temperature,
          maxTokens: args.maxTokens,
          topP: args.topP,
          pageUrl: args.pageUrl,
          html,
          bulletsMarkdown: bm,
          referenceAppendix: apx,
          signal: args.signal,
        });
        fixedTrim = fixed.trim();
      }
    }

    if (fixedTrim.length > 0 && fixedTrim !== html) {
      args.onFixBusyPhase?.("saving_wordpress");
      await args.updatePostContent({ content: fixedTrim, sourcePost: post });
    }

    args.onFixBusyPhase?.("verifying_audit");
    const postAfter = await args.fetchPost();
    const verifyHtml = (postAfter.content ?? "").trim();
    const analyzed = await analyzeOverviewPostHtml({
      apiKey: args.apiKey,
      model: args.model,
      temperature: args.temperature,
      maxTokens: args.maxTokens,
      topP: args.topP,
      pageUrl: args.pageUrl,
      html: verifyHtml,
      signal: args.signal,
    });

    lastStoredJson = analyzed.storedJson;
    bullets = analyzed.fixBulletsMarkdown;
    referenceAppendix = analyzed.fixReferenceAppendix;
    auditStorageForGrouping = analyzed.storedJson;
    const clean = analyzed.issues.length === 0;
    args.onPass?.({ pass, storedJson: lastStoredJson, issuesCount: analyzed.issues.length, clean });

    if (clean) {
      return { clean: true, storedJson: lastStoredJson, passesUsed: pass };
    }
  }

  return { clean: false, storedJson: lastStoredJson, passesUsed: MAX_VERIFY_PASSES };
}
