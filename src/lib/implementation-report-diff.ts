import { parseSeoResearchBrief } from "@/lib/content-optimization/seo-research-brief-for-optimize";
import type {
  PageGscQueryRow,
  PageGscResultLike,
} from "@/lib/content-optimization/seo-research-brief-for-optimize";
import { htmlToMarkdown } from "@/lib/wordpress-converter";
import type {
  ContentComparison,
  H2SectionDiffRow,
  ImplementationReportDeterministicDiff,
  LinkAnchorPair,
} from "./implementation-report-types";

export function countWords(text: string): number {
  return text
    .replace(/<[^>]*>/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 0).length;
}

export function extractMarkdownH2Sections(markdown: string): Array<{ h2: string; words: number }> {
  const lines = markdown.split(/\r?\n/);
  const sections: Array<{ h2: string; lines: string[] }> = [];
  let current: { h2: string; lines: string[] } | null = null;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("## ") && !trimmed.startsWith("### ")) {
      if (current) sections.push(current);
      current = { h2: trimmed.slice(3).trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    }
  }
  if (current) sections.push(current);

  return sections.map((s) => ({
    h2: s.h2,
    words: countWords(s.lines.join("\n")),
  }));
}

function normalizeHost(urlStr: string): string {
  try {
    return new URL(urlStr).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function extractLinksFromContent(
  htmlOrMarkdown: string,
  siteUrl?: string,
): LinkAnchorPair[] {
  const siteHost = siteUrl ? normalizeHost(siteUrl) : "";
  const seen = new Set<string>();
  const links: LinkAnchorPair[] = [];

  const pushLink = (rawUrl: string, rawAnchor: string) => {
    const url = rawUrl.trim();
    if (!url || url.startsWith("#") || url.startsWith("mailto:") || url.startsWith("tel:")) return;
    const key = url.toLowerCase().replace(/\/+$/, "");
    if (seen.has(key)) return;
    seen.add(key);
    const anchor = rawAnchor.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || url;
    const linkHost = normalizeHost(url);
    const isInternal =
      url.startsWith("/") ||
      Boolean(siteHost && linkHost && linkHost === siteHost);
    links.push({ url, anchor, isInternal });
  };

  let searchFrom = 0;
  const lower = htmlOrMarkdown.toLowerCase();
  while (searchFrom < htmlOrMarkdown.length) {
    const aStart = lower.indexOf("<a ", searchFrom);
    if (aStart === -1) break;
    const tagEnd = htmlOrMarkdown.indexOf(">", aStart);
    if (tagEnd === -1) break;
    const closeIdx = lower.indexOf("</a>", tagEnd);
    if (closeIdx === -1) break;
    const openTag = htmlOrMarkdown.slice(aStart, tagEnd + 1);
    const hrefIdx = openTag.toLowerCase().indexOf("href=");
    if (hrefIdx !== -1) {
      const quote = openTag[hrefIdx + 5];
      if (quote === '"' || quote === "'") {
        const endQuote = openTag.indexOf(quote, hrefIdx + 6);
        if (endQuote !== -1) {
          const href = openTag.slice(hrefIdx + 6, endQuote);
          const inner = htmlOrMarkdown.slice(tagEnd + 1, closeIdx);
          pushLink(href, inner);
        }
      }
    }
    searchFrom = closeIdx + 4;
  }

  const mdLines = htmlOrMarkdown.split(/\r?\n/);
  for (const line of mdLines) {
    let pos = 0;
    while (pos < line.length) {
      const openBracket = line.indexOf("[", pos);
      if (openBracket === -1) break;
      const closeBracket = line.indexOf("](", openBracket);
      if (closeBracket === -1) break;
      const closeParen = line.indexOf(")", closeBracket + 2);
      if (closeParen === -1) break;
      const anchor = line.slice(openBracket + 1, closeBracket);
      const url = line.slice(closeBracket + 2, closeParen).split(/\s+/)[0] ?? "";
      pushLink(url, anchor);
      pos = closeParen + 1;
    }
  }

  return links;
}

function countSubstringOccurrences(haystack: string, needle: string): number {
  const h = haystack.toLowerCase();
  const n = needle.trim().toLowerCase();
  if (!h || !n) return 0;
  let count = 0;
  let idx = 0;
  while (true) {
    const found = h.indexOf(n, idx);
    if (found === -1) break;
    count += 1;
    idx = found + n.length;
  }
  return count;
}

export function computeImplementationReportDiff(
  comparison: ContentComparison,
): ImplementationReportDeterministicDiff {
  let originalMarkdown = comparison.originalContent || "";
  if (originalMarkdown.includes("<") && originalMarkdown.includes(">")) {
    try {
      originalMarkdown = htmlToMarkdown(originalMarkdown);
    } catch {
      // keep raw
    }
  }
  const newMarkdown = comparison.newContent || "";

  const originalWordCount = countWords(originalMarkdown);
  const newWordCount = countWords(newMarkdown);
  const wordCountDiff = newWordCount - originalWordCount;
  const wordCountPercent =
    originalWordCount > 0 ? ((wordCountDiff / originalWordCount) * 100).toFixed(1) : "0.0";

  const originalCharCount = originalMarkdown.length;
  const newCharCount = newMarkdown.length;
  const charCountDiff = newCharCount - originalCharCount;

  const originalH2s = extractMarkdownH2Sections(originalMarkdown);
  const newH2s = extractMarkdownH2Sections(newMarkdown);

  const blueprintPurposes = new Map<string, string>();
  if (Array.isArray(comparison.blueprintResult?.agents)) {
    for (const agent of comparison.blueprintResult.agents) {
      const t = String(agent?.title ?? "").trim();
      const p = String(agent?.purpose ?? agent?.description ?? "").trim();
      if (t && p) blueprintPurposes.set(t.toLowerCase(), p);
    }
  }

  const origByLower = new Map(originalH2s.map((s) => [s.h2.toLowerCase(), s]));
  const newLowerSet = new Set(newH2s.map((s) => s.h2.toLowerCase()));

  const sectionDiffs: H2SectionDiffRow[] = newH2s.map((s) => {
    const match = origByLower.get(s.h2.toLowerCase());
    const purpose = blueprintPurposes.get(s.h2.toLowerCase());
    if (!match) {
      return {
        h2: s.h2,
        status: "added",
        beforeWords: 0,
        afterWords: s.words,
        ...(purpose ? { purpose } : {}),
      };
    }
    return {
      h2: s.h2,
      status: match.words === s.words ? "retained" : "rewritten",
      beforeWords: match.words,
      afterWords: s.words,
      ...(purpose ? { purpose } : {}),
    };
  });

  const removedH2s = originalH2s.filter((s) => !newLowerSet.has(s.h2.toLowerCase()));

  const siteUrl = comparison.siteUrl || comparison.url;
  const beforeLinks = extractLinksFromContent(
    comparison.originalHtml || comparison.originalContent || "",
    siteUrl,
  );
  const afterLinks = extractLinksFromContent(
    comparison.newHtml || comparison.newContent || "",
    siteUrl,
  );

  const beforeKeySet = new Set(beforeLinks.map((l) => l.url.toLowerCase().replace(/\/+$/, "")));
  const afterKeySet = new Set(afterLinks.map((l) => l.url.toLowerCase().replace(/\/+$/, "")));

  const addedInternalLinks = afterLinks.filter(
    (l) => l.isInternal && !beforeKeySet.has(l.url.toLowerCase().replace(/\/+$/, "")),
  );
  const removedInternalLinks = beforeLinks.filter(
    (l) => l.isInternal && !afterKeySet.has(l.url.toLowerCase().replace(/\/+$/, "")),
  );
  const retainedInternalLinks = afterLinks.filter(
    (l) => l.isInternal && beforeKeySet.has(l.url.toLowerCase().replace(/\/+$/, "")),
  );
  const addedExternalLinks = afterLinks.filter(
    (l) => !l.isInternal && !beforeKeySet.has(l.url.toLowerCase().replace(/\/+$/, "")),
  );
  const removedExternalLinks = beforeLinks.filter(
    (l) => !l.isInternal && !afterKeySet.has(l.url.toLowerCase().replace(/\/+$/, "")),
  );

  const originalKeywordCount = countSubstringOccurrences(originalMarkdown, comparison.primaryKeyword);
  const newKeywordCount = countSubstringOccurrences(newMarkdown, comparison.primaryKeyword);
  const originalDensity =
    originalWordCount > 0 ? ((originalKeywordCount / originalWordCount) * 100).toFixed(2) : "0.00";
  const newDensity =
    newWordCount > 0 ? ((newKeywordCount / newWordCount) * 100).toFixed(2) : "0.00";

  const brief = parseSeoResearchBrief(comparison.seoResearchRaw);
  const rawGsc = comparison.gscResult as PageGscResultLike | undefined;
  const gscQueries: PageGscQueryRow[] = [];
  const seenQ = new Set<string>();

  if (Array.isArray(rawGsc?.queries)) {
    for (const q of rawGsc.queries) {
      const queryText = String(q?.query ?? "").trim();
      if (!queryText || seenQ.has(queryText.toLowerCase())) continue;
      seenQ.add(queryText.toLowerCase());
      gscQueries.push({
        query: queryText,
        clicks: Number(q.clicks ?? 0),
        impressions: Number(q.impressions ?? 0),
        ctr: Number(q.ctr ?? 0),
        position: Number(q.position ?? 0),
      });
    }
  }
  if (brief?.gsc?.queries?.length) {
    for (const qText of brief.gsc.queries) {
      const trimmed = qText.trim();
      if (!trimmed || seenQ.has(trimmed.toLowerCase())) continue;
      seenQ.add(trimmed.toLowerCase());
      gscQueries.push({
        query: trimmed,
        clicks: 0,
        impressions: 0,
        ctr: 0,
        position: 0,
      });
    }
  }

  return {
    originalWordCount,
    newWordCount,
    wordCountDiff,
    wordCountPercent,
    originalCharCount,
    newCharCount,
    charCountDiff,
    originalH2s,
    newH2s,
    removedH2s,
    sectionDiffs,
    addedInternalLinks,
    removedInternalLinks,
    retainedInternalLinks,
    addedExternalLinks,
    removedExternalLinks,
    originalKeywordCount,
    newKeywordCount,
    originalDensity,
    newDensity,
    gscQueries: gscQueries.slice(0, 15),
    semrushOrganicKeywords: brief?.semrush?.urlOrganicKeywords ?? [],
    semrushPhraseRelatedKeywords: brief?.semrush?.phraseRelatedKeywords ?? [],
    semrushExternalUrls: brief?.semrush?.externalSemrushUrls ?? [],
    serpCompetitors: (brief?.dataforseo?.organic ?? []).slice(0, 5).map((o) => ({
      domain: o.domain,
      title: o.title,
      url: o.url,
    })),
    serpPaaQuestions: (brief?.dataforseo?.peopleAlsoAsk ?? [])
      .map((p) => p.question?.trim())
      .filter(Boolean) as string[],
  };
}
