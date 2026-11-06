import { extractInternalLinksFromHtml } from "@/lib/overview/overview-blog-links-extract";
import {
  insertWikipediaLink,
  isWikipediaHref,
  resolveEntityAndWikiForOverviewRow,
} from "@/lib/overview/overview-blog-wikipedia-link-insert";
import type { WordPressSite } from "@/components/integrations/types";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { OverviewSitemapSource } from "@/lib/overview/overview-sitemap-source";
import type {
  WikipediaLinkCatalogRow,
  WikipediaLinkRowOutcome,
} from "@/lib/overview/overview-blog-wikipedia-link-catalog";

function formatWikiRowMarkdown(params: {
  pageTitle: string;
  url: string;
  entity?: string;
  wikiTitle?: string;
  wikiUrl?: string;
  anchor?: string;
  outcome: "ok" | "skipped";
  reason?: string;
}): string {
  const lines = [
    `# Wikipedia link — ${params.pageTitle}`,
    "",
    `URL: ${params.url}`,
  ];
  if (params.entity) lines.push(`Entity: ${params.entity}`);
  if (params.wikiTitle) lines.push(`Wikipedia: ${params.wikiTitle}`);
  if (params.wikiUrl) lines.push(`Link: ${params.wikiUrl}`);
  if (params.anchor) lines.push(`Anchor in body: ${params.anchor}`);
  if (params.outcome === "skipped" && params.reason) lines.push(`Result: ${params.reason}`);
  return lines.join("\n");
}

export async function runWikipediaLinkForCatalogRow(params: {
  entry: WikipediaLinkCatalogRow;
  overviewRow: OverviewRow;
  site: WordPressSite;
  sitemapSource?: OverviewSitemapSource;
  urlEntities?: Record<string, string>;
  apiKey: string;
  wikiCache?: Map<string, { url: string; title: string; matchLabel: string } | null>;
}): Promise<WikipediaLinkRowOutcome> {
  const { entry: row, overviewRow, site, sitemapSource, urlEntities, apiKey, wikiCache } = params;
  const cache = wikiCache ?? new Map<string, { url: string; title: string; matchLabel: string } | null>();
  const pageTitle = row.title || row.url;
  const resolved = await resolveEntityAndWikiForOverviewRow({
    row: overviewRow,
    site,
    sitemapSource,
    urlEntities,
    apiKey,
    wikiCache: cache,
  });
  if (!resolved) {
    const summary = `${pageTitle}: no Wikipedia page found`;
    return {
      kind: "skipped",
      summary,
      markdown: formatWikiRowMarkdown({
        pageTitle,
        url: row.url,
        outcome: "skipped",
        reason: "No Wikipedia page found for entity candidates",
      }),
    };
  }

  const html = row.html?.trim() ?? "";
  if (!html) {
    const summary = `${pageTitle}: ${resolved.wikiTitle} (no HTML body)`;
    return {
      kind: "ok",
      summary,
      markdown: formatWikiRowMarkdown({
        pageTitle,
        url: row.url,
        entity: resolved.entity,
        wikiTitle: resolved.wikiTitle,
        wikiUrl: resolved.wikiUrl,
        outcome: "ok",
      }),
      patch: {
        postContentOptimized: row.html,
        blogWikiLinksRanAtIso: new Date().toISOString(),
        blogWikiLinkList: [{ anchor: resolved.wikiTitle, href: resolved.wikiUrl }],
        blogWikiLinkSummary: summary,
      },
    };
  }

  const applied = insertWikipediaLink(
    html,
    resolved.linkEntity,
    resolved.wikiUrl,
    resolved.wikiTitle,
  );
  if (!applied.ok) {
    const summary = `${pageTitle}: ${resolved.wikiTitle} (already linked)`;
    const links = extractInternalLinksFromHtml(html, site.siteUrl, row.url)
      .filter((l) => isWikipediaHref(l.href))
      .map((l) => ({ href: l.href, anchor: l.anchor }));
    return {
      kind: "ok",
      summary,
      markdown: formatWikiRowMarkdown({
        pageTitle,
        url: row.url,
        entity: resolved.entity,
        wikiTitle: resolved.wikiTitle,
        wikiUrl: resolved.wikiUrl,
        outcome: "ok",
      }),
      patch: {
        postContentOptimized: html,
        blogWikiLinksRanAtIso: new Date().toISOString(),
        blogWikiLinkList: links.length
          ? links
          : [{ anchor: resolved.wikiTitle, href: resolved.wikiUrl }],
        blogWikiLinkSummary: summary,
      },
    };
  }

  const links = extractInternalLinksFromHtml(applied.html, site.siteUrl, row.url)
    .filter((l) => isWikipediaHref(l.href))
    .map((l) => ({ href: l.href, anchor: l.anchor }));

  const summary = `${pageTitle}: ${resolved.wikiTitle}`;
  const markdown = formatWikiRowMarkdown({
    pageTitle,
    url: row.url,
    entity: resolved.entity,
    wikiTitle: resolved.wikiTitle,
    wikiUrl: resolved.wikiUrl,
    anchor: applied.anchor,
    outcome: "ok",
  });

  return {
    kind: "ok",
    summary,
    markdown,
    patch: {
      postContentOptimized: applied.html,
      blogWikiLinksRanAtIso: new Date().toISOString(),
      blogWikiLinkList: links.length
        ? links
        : [{ anchor: applied.anchor || resolved.entity, href: resolved.wikiUrl }],
      blogWikiLinkSummary: summary,
    },
  };
}
