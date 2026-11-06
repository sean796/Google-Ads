import { z } from "zod";
import { clampOpenRouterMaxTokens } from "@/lib/openrouter-stream-chat-core";
import { postOpenRouterAppChatFetch } from "@/lib/openrouter-app-api";
import { splitHtmlForOverviewAudit } from "@/lib/overview/overview-post-html-audit-sections";

/** Max outer verify iterations (re-fetch, fix, re-analyze). */
export const MAX_VERIFY_PASSES = 3;

/** Large posts: trim for analyze only; fixes require full payload under cap. */
export const OVERVIEW_CONTENT_ANALYZE_MAX_HTML_CHARS = 120_000;
/** Refuse automated fix passes when REST body exceeds this (avoids half-page model output). */
export const OVERVIEW_AUTOFIX_MAX_HTML_CHARS = 150_000;

/** Legacy: bullet lines no longer embed full HTML when reference appendix exists (full HTML appended to fix request). */
const REF_INLINE_IN_BULLET_MAX_CHARS = 480;

export function mergeHtmlReference(x: {
  htmlReference?: string;
  htmlSnippet?: string;
  snippet?: string;
  rawHtml?: string;
}): string {
  return (x.htmlReference ?? x.htmlSnippet ?? x.snippet ?? x.rawHtml ?? "").trim();
}

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

export function buildAnalyzeResultFromIssues(issues: ContentAuditIssueRow[]): OverviewContentAnalyzeResult {
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

/** Normalize editable textarea bullets into newline list */
export function bulletsMarkdownToLines(markdown: string): string[] {
  return markdown
    .split(/\r?\n/)
    .map((l) => l.replace(/^\s*[-*•]\s*/, "").trim())
    .filter(Boolean);
}

export async function openRouterNonStreamCompletion(args: {
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
