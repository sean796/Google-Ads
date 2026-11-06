import { callOpenRouterChatCompletion } from "@/lib/competitor-research/competitor-report-openrouter";
import { parseJsonStrict } from "@/lib/model-json";
import type { HarnessSectionAnchorEntry } from "@/lib/bulk/harness-section-anchor-ids";
import { HARNESS_OVERVIEW_ANCHOR_ID } from "@/lib/bulk/harness-section-anchor-ids";
import { stitchHarnessSections } from "@/lib/bulk/bulk-harness-outline";
import { getProductionModel } from "@/lib/optimization-settings-storage";
import { rewaveAppendedOverviewHashLink, completeOverviewScrollLinks } from "@/lib/prompt-builders/overview-link-rules";
import {
  extractOverviewSectionHtml,
  stripLeadingOverviewSection,
} from "@/lib/overview/overview-blog-overview-prepend";

export type OverviewHarnessScrollLinkBullet = {
  anchorId: string;
  bulletLabel: string;
  sentenceHtml: string;
};

type OverviewHarnessScrollLinksPayload = {
  bullets: OverviewHarnessScrollLinkBullet[];
};

function defaultBulletLabel(displayTitle: string): string {
  const words = displayTitle.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).join(" ") || "Topic";
}

function normalizeScrollLinkBullet(
  got: Partial<OverviewHarnessScrollLinkBullet> | undefined,
  expected: HarnessSectionAnchorEntry,
): OverviewHarnessScrollLinkBullet | null {
  const anchorId = expected.anchorId;
  const bulletLabel = got?.bulletLabel?.trim() || defaultBulletLabel(expected.displayTitle);
  let sentenceHtml = got?.sentenceHtml?.trim() || "";
  if (!sentenceHtml) {
    console.warn(
      `[Overview scroll links] missing sentenceHtml for "${expected.displayTitle}" (#${anchorId}) — skipping bullet`,
    );
    return null;
  }
  sentenceHtml = sentenceHtml.replace(/href="#[^"']+"/gi, `href="#${anchorId}"`);
  sentenceHtml = rewaveAppendedOverviewHashLink(sentenceHtml, anchorId);
  if (!sentenceHtml.includes(`href="#${anchorId}"`)) {
    console.warn(
      `[Overview scroll links] sentenceHtml for "${expected.displayTitle}" missing href="#${anchorId}" — skipping bullet`,
    );
    return null;
  }
  if (/\bfits your seo plan\b/i.test(sentenceHtml.replace(/<[^>]+>/g, " "))) {
    console.warn(
      `[Overview scroll links] forbidden SEO stub phrasing in bullet for "${expected.displayTitle}" — skipping bullet`,
    );
    return null;
  }
  return { anchorId, bulletLabel, sentenceHtml };
}

function countListItems(html: string): number {
  const lower = html.toLowerCase();
  let count = 0;
  let searchFrom = 0;
  while (true) {
    const idx = lower.indexOf("<li", searchFrom);
    if (idx < 0) break;
    const openEnd = lower.indexOf(">", idx);
    if (openEnd < 0) break;
    const closeAt = lower.indexOf("</li>", openEnd + 1);
    if (closeAt < 0) break;
    count += 1;
    searchFrom = closeAt + 5;
  }
  return count;
}

function liInnerStartsWithBold(inner: string): boolean {
  const t = inner.trimStart().toLowerCase();
  return t.startsWith("<strong") || t.startsWith("<b>") || t.startsWith("<b ");
}

function collectHashHrefs(html: string): string[] {
  const lower = html.toLowerCase();
  const hrefs: string[] = [];
  let searchFrom = 0;
  while (true) {
    const hrefIdx = lower.indexOf("href=", searchFrom);
    if (hrefIdx < 0) break;
    const afterEq = hrefIdx + 5;
    const quote = lower[afterEq];
    if (quote !== '"' && quote !== "'") {
      searchFrom = afterEq;
      continue;
    }
    const valueStart = afterEq + 1;
    const valueEnd = lower.indexOf(quote, valueStart);
    if (valueEnd < 0) break;
    const href = html.slice(valueStart, valueEnd).trim();
    if (href.startsWith("#")) {
      hrefs.push(href.slice(1));
    }
    searchFrom = valueEnd + 1;
  }
  return hrefs;
}

function collectNonHashHrefs(html: string, allowWikipediaUrl?: string): string[] {
  const lower = html.toLowerCase();
  const allowed = allowWikipediaUrl?.trim().toLowerCase() ?? "";
  const bad: string[] = [];
  let searchFrom = 0;
  while (true) {
    const hrefIdx = lower.indexOf("href=", searchFrom);
    if (hrefIdx < 0) break;
    const afterEq = hrefIdx + 5;
    const quote = lower[afterEq];
    if (quote !== '"' && quote !== "'") {
      searchFrom = afterEq;
      continue;
    }
    const valueStart = afterEq + 1;
    const valueEnd = lower.indexOf(quote, valueStart);
    if (valueEnd < 0) break;
    const href = html.slice(valueStart, valueEnd).trim();
    if (!href.startsWith("#")) {
      if (!allowed || href.toLowerCase() !== allowed) {
        bad.push(href);
      }
    }
    searchFrom = valueEnd + 1;
  }
  return bad;
}

/** Remove the first <ul>…</ul> block; keep h2 and lead paragraphs. */
export function stripOverviewBulletList(html: string): string {
  const lower = html.toLowerCase();
  const ulOpen = lower.indexOf("<ul");
  if (ulOpen < 0) return html.trim();
  const ulClose = lower.indexOf("</ul>", ulOpen);
  if (ulClose < 0) return html.trim();
  const before = html.slice(0, ulOpen).trimEnd();
  const after = html.slice(ulClose + 5).trim();
  return after ? `${before}\n${after}`.trim() : before;
}

export function rebuildOverviewWithScrollLinkBullets(
  headHtml: string,
  bullets: OverviewHarnessScrollLinkBullet[],
): string {
  const lis = bullets
    .map((b) => `<li><strong>${b.bulletLabel.trim()}</strong>: ${b.sentenceHtml.trim()}</li>`)
    .join("\n");
  return `${headHtml.trim()}\n<ul>\n${lis}\n</ul>`;
}

export function verifyOverviewHarnessScrollLinks(
  html: string,
  anchorMap: HarnessSectionAnchorEntry[],
  opts?: { allowWikipediaUrl?: string },
): void {
  if (anchorMap.length === 0) {
    console.warn("[Overview scroll links] anchor map is empty");
    return;
  }

  const liCount = countListItems(html);
  if (liCount !== anchorMap.length) {
    console.warn(
      `[Overview scroll links] expected ${anchorMap.length} bullets, found ${liCount}`,
    );
  }

  const hashHrefs = collectHashHrefs(html);
  const expectedIds = anchorMap.map((e) => e.anchorId);
  for (const id of expectedIds) {
    const matches = hashHrefs.filter((h) => h === id).length;
    if (matches !== 1) {
      console.warn(
        `[Overview scroll links] anchor #${id} should appear exactly once (found ${matches})`,
      );
    }
  }

  const badHrefs = collectNonHashHrefs(html, opts?.allowWikipediaUrl);
  if (badHrefs.length > 0) {
    console.warn(
      `[Overview scroll links] non-# href(s) present: ${badHrefs.slice(0, 3).join(", ")}`,
    );
  }

  const lower = html.toLowerCase();
  let searchFrom = 0;
  while (true) {
    const idx = lower.indexOf("<li", searchFrom);
    if (idx < 0) break;
    const openEnd = lower.indexOf(">", idx);
    if (openEnd < 0) break;
    const closeAt = lower.indexOf("</li>", openEnd + 1);
    if (closeAt < 0) break;
    const inner = html.slice(openEnd + 1, closeAt);
    if (!liInnerStartsWithBold(inner)) {
      console.warn("[Overview scroll links] bullet missing <strong>Label</strong>: prefix");
    }
    searchFrom = closeAt + 5;
  }
}

const SCROLL_LINKS_SYSTEM = `You write Overview key-point bullets for a WordPress HTML block. Return JSON only.

NON-NEGOTIABLE:
- One bullet per assigned anchor, in the same order as IN-PAGE SECTION ANCHORS.
- Each bullet: bulletLabel (2-3 word scannable label), sentenceHtml (HTML fragment AFTER the bold label colon — do not include the label).
- bulletLabel MUST be topic-specific (2-3 words from the assigned H2 title). FORBIDDEN: "Additional Information", "Additional Information 1", "Topic", "Section", "more details", "further resources".
- sentenceHtml MUST include exactly one <a href="#anchorId">2–4 word phrase</a> woven INSIDE the sentence BEFORE the final period.
- FORBIDDEN: placing the <a> tag after the final . ! or ? (no period-then-link append).
- FORBIDDEN: "See how", "fits your SEO plan", "see below", SEO-stub templates, or generic meta copy.
- Good: Explore our <a href="#services">window treatments</a> for local homes.
- Bad: Explore options for local homes. <a href="#services">window treatments</a>
- anchorId MUST match the assigned id exactly. Never invent ids.
- Anchor link text MUST be 2–4 subtle words from the sentence in sentence case (brands capitalized only) — NEVER the full Title Case H2 title or bulletLabel.
- No http/https URLs in sentenceHtml. # anchors only.

Return JSON: {"bullets":[{"anchorId":"...","bulletLabel":"...","sentenceHtml":"..."}]}`;

export function extractBodyH2AnchorsFromHtml(html: string): HarnessSectionAnchorEntry[] {
  const lower = html.toLowerCase();
  let overviewBlockEnd = 0;

  const classIdx = lower.indexOf('class="flo-overview"');
  if (classIdx < 0) {
    const altIdx = lower.indexOf("class='flo-overview'");
    if (altIdx >= 0) {
      overviewBlockEnd = findFloOverviewBlockEnd(html, lower, altIdx);
    }
  } else {
    overviewBlockEnd = findFloOverviewBlockEnd(html, lower, classIdx);
  }

  const entries: HarnessSectionAnchorEntry[] = [];
  let searchFrom = 0;
  let sectionIndex = 1;

  while (true) {
    const h2Open = lower.indexOf("<h2", searchFrom);
    if (h2Open < 0) break;
    if (overviewBlockEnd > 0 && h2Open < overviewBlockEnd) {
      searchFrom = h2Open + 3;
      continue;
    }
    const gt = lower.indexOf(">", h2Open);
    if (gt < 0) break;
    const openTag = html.slice(h2Open, gt);
    const idMatch = openTag.match(/\sid\s*=\s*(["'])([^"']+)\1/i);
    const closeAt = lower.indexOf("</h2>", gt);
    if (closeAt < 0) break;
    const inner = html.slice(gt + 1, closeAt).replace(/<[^>]+>/g, "").trim();
    if (idMatch) {
      const anchorId = idMatch[2]!.trim();
      if (anchorId !== HARNESS_OVERVIEW_ANCHOR_ID && anchorId !== "overview") {
        entries.push({
          sectionIndex,
          displayTitle: inner || anchorId,
          anchorId,
        });
        sectionIndex += 1;
      }
    }
    searchFrom = closeAt + 5;
  }

  return entries;
}

function findFloOverviewBlockEnd(html: string, lower: string, classIdx: number): number {
  const divStart = lower.lastIndexOf("<div", classIdx);
  if (divStart < 0) return 0;
  let depth = 0;
  let pos = divStart;
  while (pos < html.length) {
    const nextOpen = lower.indexOf("<div", pos);
    const nextClose = lower.indexOf("</div>", pos);
    if (nextClose < 0) break;
    if (nextOpen >= 0 && nextOpen < nextClose) {
      depth += 1;
      pos = nextOpen + 4;
      continue;
    }
    depth -= 1;
    pos = nextClose + 6;
    if (depth === 0) return pos;
  }
  return 0;
}

export async function applyOverviewHarnessScrollLinks(args: {
  html: string;
  anchorMap: HarnessSectionAnchorEntry[];
  articleTitle: string;
  keyword: string;
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  inPageAnchorBlock?: string;
  allowWikipediaUrl?: string;
}): Promise<string> {
  const { html, anchorMap, articleTitle, keyword, apiKey } = args;
  if (anchorMap.length === 0) {
    console.warn("[Overview scroll links] cannot rebuild bullets without body H2 anchors — shipping as-is");
    return html;
  }

  const headHtml = stripOverviewBulletList(html);
  const anchorLines = anchorMap
    .map((e, i) => `Bullet ${i + 1}: #${e.anchorId} → "${e.displayTitle}"`)
    .join("\n");

  const user = `Article title: ${articleTitle}
Primary keyword: ${keyword}

${args.inPageAnchorBlock?.trim() ? `${args.inPageAnchorBlock.trim()}\n\n` : ""}Assigned anchors (one bullet each, in order):
${anchorLines}

Lead copy to preserve (keep meaning; bullets are rebuilt separately):
${headHtml}

Return JSON with exactly ${anchorMap.length} bullets — one per anchor above, in order.`;

  const { content } = await callOpenRouterChatCompletion({
    apiKey,
    model: args.model?.trim() || getProductionModel(),
    system: SCROLL_LINKS_SYSTEM,
    user,
    maxTokens: 2048,
    temperature: 0.25,
    responseFormat: { type: "json_object" },
    signal: args.signal,
  });

  const parsed = parseJsonStrict<OverviewHarnessScrollLinksPayload>(content);

  const rawBullets = Array.isArray(parsed.bullets) ? parsed.bullets : [];
  const normalizedBullets = anchorMap
    .map((expected, i) => normalizeScrollLinkBullet(rawBullets[i], expected))
    .filter((b): b is OverviewHarnessScrollLinkBullet => b !== null);

  if (normalizedBullets.length === 0) {
    console.warn("[Overview scroll links] scroll-link agent returned no usable bullets — shipping as-is");
    return html;
  }

  const rebuilt = rebuildOverviewWithScrollLinkBullets(headHtml, normalizedBullets);
  return completeOverviewScrollLinks(rebuilt, anchorMap);
}

/** Rebuild Overview scroll-link bullets on a full stitched article (Overview + body). */
export async function applyOverviewHarnessScrollLinksToStitchedHtml(args: {
  html: string;
  anchorMap: HarnessSectionAnchorEntry[];
  articleTitle: string;
  keyword: string;
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  inPageAnchorBlock?: string;
  allowWikipediaUrl?: string;
}): Promise<string> {
  const { html, anchorMap } = args;
  if (anchorMap.length === 0) return html;

  const overviewSection = extractOverviewSectionHtml(html);
  if (!overviewSection) return html;

  const rebuiltOverview = await applyOverviewHarnessScrollLinks({
    html: overviewSection,
    anchorMap,
    articleTitle: args.articleTitle,
    keyword: args.keyword,
    apiKey: args.apiKey,
    model: args.model,
    signal: args.signal,
    inPageAnchorBlock: args.inPageAnchorBlock,
    allowWikipediaUrl: args.allowWikipediaUrl,
  });

  const bodyOnly = stripLeadingOverviewSection(html);
  return stitchHarnessSections([rebuiltOverview, bodyOnly]);
}
