import type {
  BlogLinksAddAction,
  BlogLinksPlanResult,
  BlogLinksReplaceAction,
} from "@/lib/overview/overview-blog-links-agent";
import {
  countInternalLinksInHtml,
  extractAllSectionLinkEditSpans,
  extractInternalLinksFromHtml,
  extractInternalLinkRangesFromHtml,
  extractInternalLinkEditSpans,
  findPhraseOutsideTags,
  listHtmlParagraphBlocksForAddLinks,
  type BlogInternalLinkSpan,
} from "@/lib/overview/overview-blog-links-extract";
import { linkUrlEqual } from "@/lib/overview/overview-blog-links-plan-filter";
import { normalizeInternalUrl } from "@/lib/wordpress-api/validate-internal-links";

export type BlogLinksReplaceResult = {
  was: string;
  now: string;
  anchor: string;
  ok: boolean;
};

export type BlogLinksAddResult = {
  anchor: string;
  url: string;
  paragraphIndex: number;
  ok: boolean;
};

export function appendInternalLinkToHtml(html: string, anchor: string, href: string): string {
  const safeHref = href.trim();
  const linkHtml = `<a href="${safeHref}">${anchor}</a>`;
  const trimmed = (html ?? "").trim();
  if (!trimmed) return `<p>${linkHtml}</p>`;
  return `${trimmed}\n<p>${linkHtml}</p>`;
}

export function patchSectionLinkAtIndex(
  html: string,
  linkIndex: number,
  patch: { anchor?: string; href?: string },
): string {
  const spans = extractAllSectionLinkEditSpans(html);
  const span = spans[linkIndex];
  if (!span) return html;

  let out = html;
  if (patch.href != null) {
    out = out.slice(0, span.hrefStart) + patch.href.trim() + out.slice(span.hrefEnd);
  }
  if (patch.anchor != null) {
    const refreshed = extractAllSectionLinkEditSpans(out);
    const inner = refreshed[linkIndex];
    if (inner) {
      out = out.slice(0, inner.innerStart) + patch.anchor + out.slice(inner.innerEnd);
    }
  }
  return out;
}

export function patchInternalLinkAtIndex(
  html: string,
  linkIndex: number,
  patch: { anchor?: string; href?: string },
  siteBaseUrl: string,
  pageUrl?: string,
): string {
  const spans = extractInternalLinkEditSpans(html, siteBaseUrl, pageUrl);
  const span = spans[linkIndex];
  if (!span) return html;

  let out = html;
  if (patch.href != null) {
    out = out.slice(0, span.hrefStart) + patch.href.trim() + out.slice(span.hrefEnd);
  }
  if (patch.anchor != null) {
    const refreshed = extractInternalLinkEditSpans(out, siteBaseUrl, pageUrl);
    const inner = refreshed[linkIndex];
    if (inner) {
      out = out.slice(0, inner.innerStart) + patch.anchor + out.slice(inner.innerEnd);
    }
  }
  return out;
}

function replaceNthInternalLinkHref(
  html: string,
  planIndex: number,
  newUrl: string,
  siteBaseUrl: string,
  pageUrl: string | undefined,
): { html: string; ok: boolean; was: string; anchor: string } {
  const ranges = extractInternalLinkRangesFromHtml(html, siteBaseUrl, pageUrl);
  const r = ranges[planIndex];
  if (!r) return { html, ok: false, was: "", anchor: "" };
  return {
    html: html.slice(0, r.hrefStart) + newUrl + html.slice(r.hrefEnd),
    ok: true,
    was: r.href,
    anchor: r.anchor,
  };
}

function addLinkAtBlock(
  html: string,
  blockIndex: number,
  anchorText: string,
  href: string,
): { html: string; ok: boolean; anchor: string } {
  const blocks = listHtmlParagraphBlocksForAddLinks(html);
  const block = blocks[blockIndex];
  if (!block) return { html, ok: false, anchor: "" };
  const hit = findPhraseOutsideTags(block.html, anchorText);
  if (!hit) return { html, ok: false, anchor: "" };
  const actualText = block.html.slice(hit.start, hit.start + hit.length);
  const newBlock =
    block.html.slice(0, hit.start) +
    `<a href="${href}">${actualText}</a>` +
    block.html.slice(hit.start + hit.length);
  return {
    html: html.slice(0, block.start) + newBlock + html.slice(block.end),
    ok: true,
    anchor: actualText,
  };
}

export function applySingleLinkReplace(
  html: string,
  planIndex: number,
  newUrl: string,
  existingLinks: BlogInternalLinkSpan[],
  siteBaseUrl: string,
  pageUrl?: string,
): { html: string; result: BlogLinksReplaceResult } {
  const wasCatalog = existingLinks[planIndex]?.href ?? "";
  const anchor = existingLinks[planIndex]?.anchor ?? "";
  const wasNorm = wasCatalog ? normalizeInternalUrl(siteBaseUrl, wasCatalog) : "";
  const nowNorm = newUrl ? normalizeInternalUrl(siteBaseUrl, newUrl) : "";
  if (!newUrl || !wasCatalog || linkUrlEqual(wasNorm, nowNorm)) {
    return {
      html,
      result: { was: wasCatalog, now: newUrl, anchor, ok: false },
    };
  }
  const applied = replaceNthInternalLinkHref(html, planIndex, newUrl, siteBaseUrl, pageUrl);
  return {
    html: applied.html,
    result: {
      was: applied.was || wasCatalog,
      now: newUrl,
      anchor: applied.anchor || anchor,
      ok: applied.ok,
    },
  };
}

export function applySingleLinkAdd(
  html: string,
  paragraphIndex: number,
  anchorText: string,
  href: string,
): { html: string; result: BlogLinksAddResult } {
  if (!href || !anchorText) {
    return {
      html,
      result: { anchor: anchorText, url: href, paragraphIndex, ok: false },
    };
  }
  const applied = addLinkAtBlock(html, paragraphIndex, anchorText, href);
  return {
    html: applied.html,
    result: {
      anchor: applied.anchor || anchorText,
      url: href,
      paragraphIndex,
      ok: applied.ok,
    },
  };
}

export type BlogLinksApplyStepEvent =
  | { kind: "replace"; slotIndex: number; result: BlogLinksReplaceResult }
  | { kind: "add"; slotIndex: number; result: BlogLinksAddResult };

export function applyBlogLinksPlanStepByStep(
  html: string,
  plan: BlogLinksPlanResult,
  existingLinks: BlogInternalLinkSpan[],
  siteBaseUrl: string,
  pageUrl: string | undefined,
  onStep: (event: BlogLinksApplyStepEvent) => void,
): {
  updatedHtml: string;
  finalLinks: BlogInternalLinkSpan[];
  replacements: BlogLinksReplaceResult[];
  additions: BlogLinksAddResult[];
} {
  let out = html;
  const replacements: BlogLinksReplaceResult[] = [];
  const additions: BlogLinksAddResult[] = [];
  const linkCountBefore = countInternalLinksInHtml(html, siteBaseUrl, pageUrl);

  const replaceActions = [...plan.linkActions]
    .filter(
      (a): a is BlogLinksReplaceAction =>
        a.action === "replace" && a.index >= 0 && a.index < existingLinks.length,
    )
    .sort((a, b) => a.index - b.index);

  for (let slotIndex = 0; slotIndex < existingLinks.length; slotIndex += 1) {
    const action = replaceActions.find((a) => a.index === slotIndex);
    const wasCatalog = existingLinks[slotIndex]?.href ?? "";
    const anchor = existingLinks[slotIndex]?.anchor ?? "";
    if (!action) {
      const skipped: BlogLinksReplaceResult = { was: wasCatalog, now: "", anchor, ok: false };
      replacements.push(skipped);
      onStep({ kind: "replace", slotIndex, result: skipped });
      continue;
    }
    const now = action.proposedUrl.trim();
    const wasNorm = wasCatalog ? normalizeInternalUrl(siteBaseUrl, wasCatalog) : "";
    const nowNorm = now ? normalizeInternalUrl(siteBaseUrl, now) : "";
    if (!now || !wasCatalog || linkUrlEqual(wasNorm, nowNorm)) {
      const skipped: BlogLinksReplaceResult = { was: wasCatalog, now, anchor, ok: false };
      replacements.push(skipped);
      onStep({ kind: "replace", slotIndex, result: skipped });
      continue;
    }
    const result = replaceNthInternalLinkHref(out, slotIndex, now, siteBaseUrl, pageUrl);
    out = result.html;
    const entry: BlogLinksReplaceResult = {
      was: result.was || wasCatalog,
      now,
      anchor: result.anchor || anchor,
      ok: result.ok,
    };
    replacements.push(entry);
    onStep({ kind: "replace", slotIndex, result: entry });
  }

  const addActions = [...plan.linkActions]
    .filter((a): a is BlogLinksAddAction => a.action === "add")
    .sort((a, b) => a.paragraphIndex - b.paragraphIndex);

  const applyAddOrder = [...addActions].sort((a, b) => b.paragraphIndex - a.paragraphIndex);

  for (const action of applyAddOrder) {
    const slotIndex = addActions.indexOf(action);
    const url = action.proposedUrl.trim();
    const anchorText = action.anchorText.trim();
    if (!url || !anchorText) {
      const skipped: BlogLinksAddResult = {
        anchor: anchorText,
        url,
        paragraphIndex: action.paragraphIndex,
        ok: false,
      };
      additions.push(skipped);
      onStep({ kind: "add", slotIndex, result: skipped });
      continue;
    }
    const result = addLinkAtBlock(out, action.paragraphIndex, anchorText, url);
    out = result.html;
    const entry: BlogLinksAddResult = {
      anchor: result.anchor || anchorText,
      url,
      paragraphIndex: action.paragraphIndex,
      ok: result.ok,
    };
    additions.push(entry);
    onStep({ kind: "add", slotIndex, result: entry });
  }

  const addsApplied = additions.filter((a) => a.ok).length;
  const replacesApplied = replacements.filter((r) => r.ok).length;
  const linkCountAfter = countInternalLinksInHtml(out, siteBaseUrl, pageUrl);
  if (linkCountAfter !== linkCountBefore + addsApplied) {
    return {
      updatedHtml: html,
      finalLinks: extractInternalLinksFromHtml(html, siteBaseUrl, pageUrl),
      replacements: [],
      additions: [],
    };
  }

  if (replacesApplied === 0 && addsApplied === 0) {
    return {
      updatedHtml: html,
      finalLinks: extractInternalLinksFromHtml(html, siteBaseUrl, pageUrl),
      replacements,
      additions,
    };
  }

  return {
    updatedHtml: out,
    finalLinks: extractInternalLinksFromHtml(out, siteBaseUrl, pageUrl),
    replacements,
    additions,
  };
}

export function applyBlogLinksPlanLocally(
  html: string,
  plan: BlogLinksPlanResult,
  existingLinks: BlogInternalLinkSpan[],
  siteBaseUrl: string,
  pageUrl?: string,
): {
  updatedHtml: string;
  finalLinks: BlogInternalLinkSpan[];
  replacements: BlogLinksReplaceResult[];
  additions: BlogLinksAddResult[];
} {
  return applyBlogLinksPlanStepByStep(html, plan, existingLinks, siteBaseUrl, pageUrl, () => {});
}

export function verifyLocalLinksApply(
  originalHtml: string,
  updatedHtml: string,
  siteBaseUrl: string,
  pageUrl?: string,
  expect?: { adds: number; replacements: number },
): { ok: true } | { ok: false; reason: string } {
  const before = countInternalLinksInHtml(originalHtml, siteBaseUrl, pageUrl);
  const after = countInternalLinksInHtml(updatedHtml, siteBaseUrl, pageUrl);
  const expectedAdds = expect?.adds ?? 0;
  const expectedReplacements = expect?.replacements ?? 0;

  if (after !== before + expectedAdds) {
    return { ok: false, reason: `Link count ${before} → ${after} (expected +${expectedAdds})` };
  }

  if (expectedAdds === 0 && expectedReplacements > 0) {
    const origSpans = extractInternalLinksFromHtml(originalHtml, siteBaseUrl, pageUrl);
    const updSpans = extractInternalLinksFromHtml(updatedHtml, siteBaseUrl, pageUrl);
    if (origSpans.length !== updSpans.length) {
      return { ok: false, reason: "Internal link span count mismatch" };
    }
    for (let i = 0; i < origSpans.length; i++) {
      if (origSpans[i]?.anchor !== updSpans[i]?.anchor) {
        return { ok: false, reason: "Anchor text changed" };
      }
    }
  }

  return { ok: true };
}
