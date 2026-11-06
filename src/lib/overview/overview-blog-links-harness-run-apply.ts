import { logBlogLinksActivity } from "@/lib/overview/overview-blog-links-activity-log";
import {
  insertWikipediaLinkAtEarliestEntityReference,
  isWikipediaHref,
} from "@/lib/overview/overview-blog-wikipedia-link-insert";
import {
  applySingleLinkAdd,
  applySingleLinkReplace,
  type BlogLinksAddResult,
  type BlogLinksReplaceResult,
} from "@/lib/overview/overview-blog-links-apply-local";
import {
  extractInternalLinksFromHtml,
  listHtmlParagraphBlocksForAddLinks,
  paragraphBlocksForLinkAdds,
} from "@/lib/overview/overview-blog-links-extract";
import {
  runBlogLinksAddIntent,
  runBlogLinksReplaceIntent,
  type ArticleLinkForIntent,
} from "@/lib/overview/overview-blog-links-link-intent";
import {
  keywordCandidatesForAnchor,
  resolveAddKeywordToUrl,
  resolveReplaceDestination,
} from "@/lib/overview/overview-blog-links-agent-payload";
import { isProtectedBlogLinkHref, linkUrlEqual } from "@/lib/overview/overview-blog-links-plan-filter";
import { normalizeInternalUrl } from "@/lib/wordpress-api/validate-internal-links";
import type { BlogLinksCatalogRow } from "@/lib/overview/overview-blog-links-catalog";
import type {
  BlogLinksAgentOptions,
  BlogLinksLinkAction,
} from "@/lib/overview/overview-blog-links-agent";
import {
  formatLinksAnalyzeAndApplyMarkdown,
  LINKS_SECTION_ANALYZE,
  linksHarnessSectionTitle,
} from "@/lib/overview/overview-blog-links-harness-sections";
import {
  emitLinksHarnessStreamMarkdown,
  type LinksHarnessSetters,
} from "@/lib/overview/overview-blog-links-harness-mutations";

type UserLinkHint = { anchor: string; href: string };

function gscHeadingKeywords(row: BlogLinksCatalogRow): string[] {
  return row.gscPicks?.headingKeywords ?? [];
}

function resolveUrlFromUserAnchor(
  anchor: string,
  row: BlogLinksCatalogRow,
  siteUrl: string,
  usedDestinationUrls: string[] = [],
): string {
  const trimmed = anchor.trim();
  if (!trimmed || !siteUrl.trim()) return "";

  const acceptUrl = (url: string): string => {
    if (!url) return "";
    const norm = normalizeInternalUrl(siteUrl, url);
    if (usedDestinationUrls.some((used) => linkUrlEqual(used, norm))) return "";
    return url;
  };

  const direct = acceptUrl(resolveAddKeywordToUrl(trimmed, row.linkPool, siteUrl));
  if (direct) return direct;

  const fromPhrase = acceptUrl(
    resolveReplaceDestination(trimmed, trimmed, undefined, row.linkPool, siteUrl),
  );
  if (fromPhrase) return fromPhrase;

  const lines = keywordCandidatesForAnchor(trimmed, row.linkPool, gscHeadingKeywords(row))
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  for (const kw of lines) {
    const url = acceptUrl(resolveAddKeywordToUrl(kw, row.linkPool, siteUrl));
    if (url) return url;
  }
  return "";
}

function articleLinksForIntent(
  html: string,
  siteUrl: string,
  pageUrl: string,
): ArticleLinkForIntent[] {
  return extractInternalLinksFromHtml(html, siteUrl, pageUrl).map((link) => ({
    index: link.index,
    anchor: link.anchor,
    href: link.href,
  }));
}

function usedDestinationUrlsFromHtml(
  html: string,
  siteUrl: string,
  pageUrl: string,
): string[] {
  return extractInternalLinksFromHtml(html, siteUrl, pageUrl).map((link) =>
    normalizeInternalUrl(siteUrl, link.href),
  );
}

export async function rewriteExistingLinks(
  row: BlogLinksCatalogRow,
  html: string,
  agentOptions: BlogLinksAgentOptions,
  setters: LinksHarnessSetters,
  url: string,
  linkActions: BlogLinksLinkAction[],
): Promise<{
  html: string;
  replacements: BlogLinksReplaceResult[];
  replacementsOk: number;
  intentKeywords: string[];
}> {
  let out = html;
  const replacements: BlogLinksReplaceResult[] = [];
  const intentKeywords: string[] = [];
  let replacementsOk = 0;

  const siteUrl = agentOptions.siteUrl?.trim() ?? "";
  const linkCount = extractInternalLinksFromHtml(out, siteUrl, row.url).length;
  for (let i = 0; i < linkCount; i += 1) {
    const links = extractInternalLinksFromHtml(out, siteUrl, row.url);
    const link = links[i];
    if (!link) break;

    intentKeywords.push("");
    let applied = applySingleLinkReplace(out, i, "", links, siteUrl, row.url);
    if (isProtectedBlogLinkHref(link.href)) {
      replacements.push(applied.result);
      continue;
    }

    const hint = row.userLinkTargets?.[i];
    const userHref = hint?.href?.trim() ?? "";
    const userAnchor = hint?.anchor?.trim() ?? "";

    if (userHref) {
      applied = applySingleLinkReplace(out, i, userHref, links, siteUrl, row.url);
      if (applied.result.ok) {
        out = applied.html;
        replacementsOk += 1;
        linkActions.push({
          action: "replace",
          index: i,
          proposedUrl: applied.result.now,
          rationale: userAnchor || "user href",
        });
      }
      replacements.push(applied.result);
      emitLinksHarnessStreamMarkdown(
        url,
        setters,
        LINKS_SECTION_ANALYZE,
        linksHarnessSectionTitle(row, LINKS_SECTION_ANALYZE),
        formatLinksAnalyzeAndApplyMarkdown(row, replacements, [], intentKeywords),
      );
      continue;
    }

    const usedDestinationUrls = usedDestinationUrlsFromHtml(out, siteUrl, row.url);
    const resolvedFromAnchor = userAnchor
      ? resolveUrlFromUserAnchor(userAnchor, row, siteUrl, usedDestinationUrls)
      : "";
    if (resolvedFromAnchor) {
      applied = applySingleLinkReplace(out, i, resolvedFromAnchor, links, siteUrl, row.url);
      if (applied.result.ok) {
        out = applied.html;
        replacementsOk += 1;
        linkActions.push({
          action: "replace",
          index: i,
          proposedUrl: applied.result.now,
          rationale: userAnchor,
        });
      }
      replacements.push(applied.result);
      emitLinksHarnessStreamMarkdown(
        url,
        setters,
        LINKS_SECTION_ANALYZE,
        linksHarnessSectionTitle(row, LINKS_SECTION_ANALYZE),
        formatLinksAnalyzeAndApplyMarkdown(row, replacements, [], intentKeywords),
      );
      continue;
    }

    const articleLinks = articleLinksForIntent(out, siteUrl, row.url).map((entry, idx) =>
      idx === i && userAnchor ? { ...entry, anchor: userAnchor } : entry,
    );

    try {
      const intent = await runBlogLinksReplaceIntent(
        row,
        i,
        agentOptions,
        usedDestinationUrls,
        articleLinks,
      );
      if (intent?.proposedUrl) {
        intentKeywords[i] = intent.proposedKeyword;
        applied = applySingleLinkReplace(out, i, intent.proposedUrl, links, siteUrl, row.url);
        if (applied.result.ok) {
          out = applied.html;
          replacementsOk += 1;
          linkActions.push({
            action: "replace",
            index: i,
            proposedUrl: applied.result.now,
            rationale: intent.proposedKeyword,
          });
        }
      }
    } catch (err) {
      logBlogLinksActivity("replace_error", {
        url: row.url,
        index: i + 1,
        message: err instanceof Error ? err.message : "replace failed",
      });
    }

    replacements.push(applied.result);
    emitLinksHarnessStreamMarkdown(
      url,
      setters,
      LINKS_SECTION_ANALYZE,
      linksHarnessSectionTitle(row, LINKS_SECTION_ANALYZE),
      formatLinksAnalyzeAndApplyMarkdown(row, replacements, [], intentKeywords),
    );
  }

  return { html: out, replacements, replacementsOk, intentKeywords };
}

export async function applyOneLinkAddSlot(
  row: BlogLinksCatalogRow,
  html: string,
  agentOptions: BlogLinksAgentOptions,
  addBlocks: Array<{ index: number; text: string }>,
  usedBlockIndices: Set<number>,
  hint?: UserLinkHint,
): Promise<{
  html: string;
  result: BlogLinksAddResult;
  addBlocks: Array<{ index: number; text: string }>;
  action?: BlogLinksLinkAction;
}> {
  const siteUrl = agentOptions.siteUrl?.trim() ?? "";
  const userHref = hint?.href?.trim() ?? "";
  const userAnchor = hint?.anchor?.trim() ?? "";

  if (userHref && isWikipediaHref(userHref)) {
    const entityLabel = userAnchor || row.focusKeyword || row.title || "entity";
    const applied = insertWikipediaLinkAtEarliestEntityReference(html, entityLabel, userHref);
    return {
      html: applied.html,
      result: {
        anchor: applied.anchor,
        url: applied.url,
        paragraphIndex: -1,
        ok: applied.ok,
      },
      addBlocks: paragraphBlocksForLinkAdds(applied.html),
      action: applied.ok
        ? {
            action: "add" as const,
            paragraphIndex: -1,
            anchorText: applied.anchor,
            proposedUrl: applied.url,
            rationale: "wikipedia entity link",
          }
        : undefined,
    };
  }

  const tryUserAdd = (anchorText: string, targetUrl: string) => {
    for (const block of listHtmlParagraphBlocksForAddLinks(html)) {
      if (usedBlockIndices.has(block.index)) continue;
      const applied = applySingleLinkAdd(html, block.index, anchorText, targetUrl);
      if (applied.result.ok) {
        return {
          html: applied.html,
          result: applied.result,
          addBlocks: paragraphBlocksForLinkAdds(applied.html),
          action: {
            action: "add" as const,
            paragraphIndex: block.index,
            anchorText: applied.result.anchor,
            proposedUrl: targetUrl,
            rationale: userAnchor || "user link",
          },
        };
      }
    }
    return null;
  };

  if (userHref && userAnchor) {
    const hit = tryUserAdd(userAnchor, userHref);
    if (hit) return hit;
  }

  if (userAnchor && !userHref) {
    const usedDestinationUrls = usedDestinationUrlsFromHtml(html, siteUrl, row.url);
    const resolved = resolveUrlFromUserAnchor(userAnchor, row, siteUrl, usedDestinationUrls);
    if (resolved) {
      const hit = tryUserAdd(userAnchor, resolved);
      if (hit) return hit;
    }
  }

  if (!userHref) {
    for (const block of addBlocks) {
      if (usedBlockIndices.has(block.index)) continue;

      try {
        const articleLinks = articleLinksForIntent(html, siteUrl, row.url);
        const usedDestinationUrls = usedDestinationUrlsFromHtml(html, siteUrl, row.url);
        const intent = await runBlogLinksAddIntent(
          row,
          block.index,
          block.text,
          agentOptions,
          usedDestinationUrls,
          articleLinks,
        );
        if (intent?.proposedUrl && intent.anchorText) {
          const applied = applySingleLinkAdd(html, block.index, intent.anchorText, intent.proposedUrl);
          if (applied.result.ok) {
            return {
              html: applied.html,
              result: applied.result,
              addBlocks: paragraphBlocksForLinkAdds(applied.html),
              action: {
                action: "add",
                paragraphIndex: block.index,
                anchorText: intent.anchorText,
                proposedUrl: intent.proposedUrl,
                rationale: intent.proposedKeyword,
              },
            };
          }
        }
      } catch (err) {
        logBlogLinksActivity("add_error", {
          url: row.url,
          message: err instanceof Error ? err.message : "add failed",
        });
      }
    }
  }

  return {
    html,
    result: { anchor: userAnchor, url: userHref, paragraphIndex: 0, ok: false },
    addBlocks,
  };
}

export async function addLinksByBudget(
  row: BlogLinksCatalogRow,
  html: string,
  agentOptions: BlogLinksAgentOptions,
  setters: LinksHarnessSetters,
  url: string,
  linkActions: BlogLinksLinkAction[],
  applyMarkdownCtx: {
    replacements: BlogLinksReplaceResult[];
    intentKeywords: string[];
  },
  seedAdditions: BlogLinksAddResult[] = [],
  usedBlockIndicesSeed?: Set<number>,
): Promise<{ html: string; additionsOk: number; additions: BlogLinksAddResult[] }> {
  let out = html;
  let additionsOk = seedAdditions.filter((a) => a.ok).length;
  const additions: BlogLinksAddResult[] = [...seedAdditions];
  let addBlocks = paragraphBlocksForLinkAdds(out);

  const usedBlockIndices = usedBlockIndicesSeed ?? new Set<number>();
  for (const entry of seedAdditions) {
    if (entry.ok) usedBlockIndices.add(entry.paragraphIndex);
  }

  for (let i = 0; i < row.linksToAdd; i += 1) {
    const slot = await applyOneLinkAddSlot(row, out, agentOptions, addBlocks, usedBlockIndices);
    const result = slot.result;

    if (slot.result.ok) {
      out = slot.html;
      usedBlockIndices.add(slot.result.paragraphIndex);
      addBlocks = slot.addBlocks;
      additionsOk += 1;
      if (slot.action) linkActions.push(slot.action);
    }

    additions.push(result);
    emitLinksHarnessStreamMarkdown(
      url,
      setters,
      LINKS_SECTION_ANALYZE,
      linksHarnessSectionTitle(row, LINKS_SECTION_ANALYZE),
      formatLinksAnalyzeAndApplyMarkdown(
        row,
        applyMarkdownCtx.replacements,
        additions,
        applyMarkdownCtx.intentKeywords,
      ),
    );
  }

  return { html: out, additionsOk, additions };
}

