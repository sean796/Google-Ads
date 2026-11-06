import { z } from "zod";
import type { WordPressPostContent } from "@/lib/wordpress-api/types";
import { splitHtmlForOverviewAudit } from "@/lib/overview/overview-post-html-audit-sections";
import { auditIssuesToFixPassPayload, bulletsMarkdownToLines, filterUnsoundAuditIssues, inferAuditIssueSectionIndices, MAX_VERIFY_PASSES, openRouterNonStreamCompletion, OVERVIEW_AUTOFIX_MAX_HTML_CHARS, parseContentAuditStorage, stripMarkdownCodeFenceFromModelOutput, type ContentAuditIssueRow, type OverviewContentAnalyzeFixBusyPhase } from "@/lib/overview/overview-content-audit-storage";
import { analyzeOverviewPostHtml } from "@/lib/overview/overview-content-analyze-runner";

const fixResponseSchema = z.object({
  html: z.string(),
});

/** Model wraps full HTML outside JSON so literals (newlines) do not break JSON.parse (see debug H3). */
export const OVERVIEW_FIX_HTML_BLOCK_START = "<<<NEO_PULSE_HTML_FIX>>>";
export const OVERVIEW_FIX_HTML_BLOCK_END = "<<<END_NEO_PULSE_HTML_FIX>>>";

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
