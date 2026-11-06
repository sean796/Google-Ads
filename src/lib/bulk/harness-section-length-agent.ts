import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseJsonStrict } from "@/lib/model-json";
import { getProductionModel } from "@/lib/optimization-settings-storage";

/** When false, harness uses one OpenRouter pass per section only — no length rewrite pass. */
export const HARNESS_AI_LENGTH_RETRY = false;

export type HarnessSectionLengthResult = {
  compliant: boolean;
  section_html: string;
};

const SYSTEM = `You are a harness section editor for WordPress HTML. Return JSON only.

Contract for the section HTML:
- Exactly one top-level <h2> for this section (plus optional <h3> subheads under it). Never nest <h2> inside <h2>. If the draft contains more than one <h2>, set compliant false and rewrite to keep ONLY the assigned section—delete every foreign <h2> block and its content.
- At most 3 <p> tags for body prose (lists/tables allowed but concise).
- At most 4 sentences per <p>. Every paragraph ends with a complete sentence — never a standalone word or partial link text.
- No full-article intro, no "this guide will explore", no repeating topics from sibling H2s listed in the user message.
- Never append Overview scroll-link <ul> lists in body sections. Overview <ul> belongs only in the Overview step.
- STOP after the last </p>, </table>, or </ol> — no preview of sibling sections.
- Never add <footer>. Never use markdown.

If the draft already complies, set compliant true and return the same HTML in section_html (light copy-edit only).
If it violates the contract, set compliant false and return a rewritten section_html that complies while preserving facts and links.`;

const OVERVIEW_SYSTEM = `You are a harness section editor for the Overview (AI Overview) block. Return JSON only.

NON-NEGOTIABLE contract — copy this shape:
<h2>Overview</h2>
<p>keyword answer…</p>
<p>optional…</p>
<ul>
<li><strong>Label</strong>: … <a href="#anchor-id">2-4 words</a> …</li>
(exactly N items — one per IN-PAGE anchor in the user message)
</ul>
STOP after </ul>.

Rules:
- Lead <p> = plain prose. # links only in <ul>. Optional entity Wikipedia in <p> when user requires it.
- Every <a> is <a href="...">text</a> only — no target=, rel=, partial tags.
- Each <li> starts <strong>Label</strong>: then one # citation with 2–4 word anchor text.
- No <h3>, no tables, no <footer>, no markdown, no text after </ul>.

If the draft is missing the <ul> or wrong bullet count, set compliant false and rewrite to match the skeleton.
If compliant, return the draft (light copy-edit only).`;

export async function ensureHarnessSectionLengthCompliance(args: {
  sectionHtml: string;
  sectionTitle: string;
  siblingSectionTitles: string[];
  articleTitle: string;
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  /** Overview AI block: require bold-label key-points <ul>. */
  isOverviewSection?: boolean;
  /** Overview: IN-PAGE SECTION ANCHORS block for 1:1 bullet contract. */
  inPageAnchorBlock?: string;
  /** Overview: required bullet count (= body H2 anchor count). */
  overviewBulletCount?: number;
}): Promise<string> {
  if (!HARNESS_AI_LENGTH_RETRY || !args.sectionHtml.trim()) {
    return args.sectionHtml;
  }

  const isOverview = Boolean(args.isOverviewSection);
  const overviewN = isOverview
    ? (args.overviewBulletCount ?? args.siblingSectionTitles.length)
    : 0;

  const siblings =
    args.siblingSectionTitles.length > 0
      ? args.siblingSectionTitles.map((t) => `- ${t}`).join("\n")
      : "(none)";

  const overviewForceNote = isOverview
    ? `\nOverview: exactly ${overviewN} <li> items in <ul> after 1-2 <p>. Stop after </ul>. # links in bullets only.\n`
    : "";

  const anchorBlockNote =
    isOverview && args.inPageAnchorBlock?.trim() ? `\n${args.inPageAnchorBlock.trim()}\n` : "";

  const user = `Article title: ${args.articleTitle}
Current section topic: ${args.sectionTitle}
Sibling H2s (do not duplicate their coverage):
${siblings}
${anchorBlockNote}${overviewForceNote}
Draft HTML:
${args.sectionHtml.trim()}

Return JSON: {"compliant":boolean,"section_html":"..."}`;

  try {
    const { content } = await callOpenRouterChatCompletion({
      apiKey: args.apiKey,
      model: args.model?.trim() || getProductionModel(),
      system: isOverview ? OVERVIEW_SYSTEM : SYSTEM,
      user,
      maxTokens: 2048,
      temperature: 0.25,
      responseFormat: { type: "json_object" },
      signal: args.signal,
    });

    const parsed = parseJsonStrict<HarnessSectionLengthResult>(content);

    const html =
      typeof parsed.section_html === "string" && parsed.section_html.trim()
        ? parsed.section_html.trim()
        : args.sectionHtml;

    if (parsed.compliant === false) {
      console.info(
        `[Bulk Harness] Section length agent rewrote "${args.sectionTitle}" for compliance`,
      );
    }

    return html;
  } catch (err) {
    console.warn("[Bulk Harness] Section length agent failed (using draft):", err);
    return args.sectionHtml;
  }
}
