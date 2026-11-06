/**
 * Deterministic publishing output evals. These scorers grade finished artifacts
 * (article HTML, FAQ entries, JSON-LD) before publish and in CI. They never edit
 * content: a failing score is a visible defect, not something to scrub away.
 */
import {
  gradeFactualityVerdicts,
  type FactualityClaimVerdict,
} from "@/lib/evals/factuality-evals";

export type PublishingEvalIssue = { code: string; detail: string };

export type PublishingEvalResult = { pass: boolean; issues: PublishingEvalIssue[] };

export type PublishingEvalReport = {
  pass: boolean;
  links: PublishingEvalResult;
  schema: PublishingEvalResult;
  faqAnswers: PublishingEvalResult;
  /** Present only when factuality verdicts are fed in (Wave 4 judge). */
  factuality?: PublishingEvalResult;
};

function result(issues: PublishingEvalIssue[]): PublishingEvalResult {
  return { pass: issues.length === 0, issues };
}

const LINK_PLACEHOLDER_RE = /\[\[LINK:[^\]]*\]\]/gi;
const ANCHOR_HREF_RE = /<a\s[^>]*href="([^"]+)"/gi;
const JSON_LD_RE = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi;

function normalizeUrlPath(raw: string): string {
  let path = raw.trim();
  try {
    path = new URL(path).pathname;
  } catch {
    path = path.split(/[?#]/)[0] ?? path;
  }
  if (!path.startsWith("/")) path = `/${path}`;
  if (path.length > 1 && path.endsWith("/")) path = path.slice(0, -1);
  return path.toLowerCase();
}

function isInternalHref(href: string, siteHosts: Set<string>): boolean {
  const h = href.trim();
  if (!h || h.startsWith("#") || h.startsWith("mailto:") || h.startsWith("tel:")) return false;
  if (h.startsWith("/")) return true;
  try {
    const url = new URL(h);
    return siteHosts.has(url.hostname.replace(/^www\./, "").toLowerCase());
  } catch {
    return false;
  }
}

/**
 * Link resolution: no leftover [[LINK:...]] placeholders, and every internal
 * anchor must resolve to a URL in the site inventory.
 */
export function scoreLinkResolution(
  html: string,
  opts: { inventoryUrls: Iterable<string>; siteUrl?: string },
): PublishingEvalResult {
  const issues: PublishingEvalIssue[] = [];
  if (!html.trim()) return result(issues);

  for (const m of html.matchAll(LINK_PLACEHOLDER_RE)) {
    issues.push({ code: "unresolved-link-placeholder", detail: m[0].slice(0, 80) });
  }

  const inventory = new Set<string>();
  for (const u of opts.inventoryUrls) inventory.add(normalizeUrlPath(u));

  const siteHosts = new Set<string>();
  if (opts.siteUrl) {
    try {
      siteHosts.add(new URL(opts.siteUrl).hostname.replace(/^www\./, "").toLowerCase());
    } catch {
      // Site URL is only used to recognize same-host absolute links.
    }
  }

  for (const m of html.matchAll(ANCHOR_HREF_RE)) {
    const href = m[1] ?? "";
    if (!isInternalHref(href, siteHosts)) continue;
    if (!inventory.has(normalizeUrlPath(href))) {
      issues.push({ code: "unresolved-internal-link", detail: href.slice(0, 120) });
    }
  }

  return result(issues);
}

type JsonLdBlock = Record<string, unknown> & { "@type"?: string };

function faqSchemaIssues(block: JsonLdBlock, blockIndex: number): PublishingEvalIssue[] {
  const issues: PublishingEvalIssue[] = [];
  const mainEntity = block.mainEntity;
  if (!Array.isArray(mainEntity) || mainEntity.length === 0) {
    issues.push({
      code: "faq-schema-empty",
      detail: `FAQPage block ${blockIndex} has no mainEntity questions`,
    });
    return issues;
  }
  mainEntity.forEach((entry, i) => {
    const q = entry as { name?: unknown; acceptedAnswer?: { text?: unknown } };
    const name = typeof q?.name === "string" ? q.name.trim() : "";
    const answerText =
      typeof q?.acceptedAnswer?.text === "string" ? q.acceptedAnswer.text.trim() : "";
    if (!name) {
      issues.push({ code: "faq-schema-missing-question", detail: `FAQPage block ${blockIndex} item ${i}` });
    }
    if (!answerText) {
      issues.push({
        code: "faq-schema-missing-answer",
        detail: `FAQPage block ${blockIndex} item ${i}: ${name.slice(0, 60) || "(no question)"}`,
      });
    }
  });
  return issues;
}

/**
 * Schema validity: every JSON-LD block must parse, and any FAQPage block must
 * carry real questions with non-empty answers.
 */
export function scoreSchemaValidity(html: string): PublishingEvalResult {
  const issues: PublishingEvalIssue[] = [];
  if (!html.trim()) return result(issues);

  let blockIndex = 0;
  for (const m of html.matchAll(JSON_LD_RE)) {
    const raw = (m[1] ?? "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      issues.push({ code: "jsonld-parse-error", detail: `JSON-LD block ${blockIndex} is not valid JSON` });
      blockIndex += 1;
      continue;
    }
    const blocks = Array.isArray(parsed) ? parsed : [parsed];
    for (const b of blocks) {
      const block = b as JsonLdBlock;
      const type = typeof block?.["@type"] === "string" ? block["@type"] : "";
      if (type === "FAQPage") issues.push(...faqSchemaIssues(block, blockIndex));
    }
    blockIndex += 1;
  }

  return result(issues);
}

/** Fragments from the deleted templated FAQ fabricator. Any hit is a defect. */
export const TEMPLATED_FAQ_ANSWER_FRAGMENTS = [
  "for expert guidance on",
  "contact our team",
  "reach out to our team",
  "our team can help",
  "get in touch with our team",
] as const;

export type FaqEvalEntry = { question: string; answer: string };

/**
 * Templated answer detection: known fabricator fragments, and the same answer
 * pasted under different questions.
 */
export function scoreTemplatedFaqAnswers(entries: FaqEvalEntry[]): PublishingEvalResult {
  const issues: PublishingEvalIssue[] = [];
  const answerUse = new Map<string, string[]>();

  for (const entry of entries) {
    const question = (entry.question || "").trim();
    const answer = (entry.answer || "").trim();
    const lowerAnswer = answer.toLowerCase();
    for (const fragment of TEMPLATED_FAQ_ANSWER_FRAGMENTS) {
      if (lowerAnswer.includes(fragment)) {
        issues.push({
          code: "templated-faq-answer",
          detail: `"${fragment}" in answer for: ${question.slice(0, 60)}`,
        });
      }
    }
    if (answer) {
      const list = answerUse.get(lowerAnswer) ?? [];
      list.push(question);
      answerUse.set(lowerAnswer, list);
    }
  }

  for (const [answer, questions] of answerUse) {
    const distinct = [...new Set(questions.filter(Boolean))];
    if (distinct.length > 1) {
      issues.push({
        code: "duplicate-faq-answer",
        detail: `Same answer under ${distinct.length} questions: ${answer.slice(0, 60)}`,
      });
    }
  }

  return result(issues);
}

/** Run all publishing evals over one finished artifact. */
export function runPublishingEvals(args: {
  html: string;
  faqEntries: FaqEvalEntry[];
  inventoryUrls: Iterable<string>;
  siteUrl?: string;
  /** Judge verdicts from runFactualityJudge; graded deterministically here. */
  factualityVerdicts?: FactualityClaimVerdict[];
  factualitySourceContext?: string;
}): PublishingEvalReport {
  const links = scoreLinkResolution(args.html, {
    inventoryUrls: args.inventoryUrls,
    siteUrl: args.siteUrl,
  });
  const schema = scoreSchemaValidity(args.html);
  const faqAnswers = scoreTemplatedFaqAnswers(args.faqEntries);
  const factuality = args.factualityVerdicts
    ? result(gradeFactualityVerdicts(args.factualityVerdicts, args.factualitySourceContext).issues)
    : undefined;
  return {
    pass: links.pass && schema.pass && faqAnswers.pass && (factuality?.pass ?? true),
    links,
    schema,
    faqAnswers,
    ...(factuality ? { factuality } : {}),
  };
}
