import { callAgentCategoryOpenRouterChat } from "@/lib/openrouter-agent-category-api";
import { parseJsonObjectFromModelText } from "@/lib/openrouter-vision-chat";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { parseSeoResearchBrief, type PageGscQueryRow, type PageGscResultLike } from "@/lib/content-optimization/seo-research-brief-for-optimize";
import { aiseoPostContentFileSlug } from "@/lib/overview/overview-aiseo-row-artifacts";
import { htmlToMarkdown } from "@/lib/wordpress-converter";

export interface ContentComparison {
  originalTitle: string;
  newTitle: string;
  originalExcerpt: string;
  newExcerpt: string;
  originalContent: string; // markdown or HTML
  newContent: string; // markdown
  originalHtml?: string;
  newHtml?: string;
  /** Prior ACF `seo_extra_text` / `extra_text` (markdown or plain). */
  originalExtraText?: string;
  /** New ACF extra block written this run (markdown). */
  newExtraText?: string;
  primaryKeyword: string;
  clusterKeywords?: string[];
  selectedKeyword: {
    query: string;
    clicks: number;
    impressions: number;
    ctr: number;
    position: number;
  };
  gscResult?: PageGscResultLike | unknown;
  seoResearchRaw?: string;
  faqEntries?: Array<{ question: string; answer?: string }>;
  blueprintResult?: any;
  updateMode: "update" | "draft";
  url: string;
  siteId?: string | null;
  siteUrl?: string;
  apiKey?: string;
}

export interface H2SectionDiffRow {
  h2: string;
  status: "added" | "rewritten" | "retained";
  beforeWords: number;
  afterWords: number;
  purpose?: string;
}

export interface LinkAnchorPair {
  url: string;
  anchor: string;
  isInternal: boolean;
}

export interface ImplementationReportDeterministicDiff {
  originalWordCount: number;
  newWordCount: number;
  wordCountDiff: number;
  wordCountPercent: string;
  originalCharCount: number;
  newCharCount: number;
  charCountDiff: number;
  originalH2s: Array<{ h2: string; words: number }>;
  newH2s: Array<{ h2: string; words: number }>;
  removedH2s: Array<{ h2: string; words: number }>;
  sectionDiffs: H2SectionDiffRow[];
  addedInternalLinks: LinkAnchorPair[];
  removedInternalLinks: LinkAnchorPair[];
  retainedInternalLinks: LinkAnchorPair[];
  addedExternalLinks: LinkAnchorPair[];
  removedExternalLinks: LinkAnchorPair[];
  originalKeywordCount: number;
  newKeywordCount: number;
  originalDensity: string;
  newDensity: string;
  gscQueries: PageGscQueryRow[];
  semrushOrganicKeywords: string[];
  semrushPhraseRelatedKeywords: string[];
  semrushExternalUrls: string[];
  serpCompetitors: Array<{ domain?: string; title?: string; url?: string }>;
  serpPaaQuestions: string[];
}

export interface ImplementationReportSectionRationale {
  h2: string;
  status: "added" | "rewritten" | "retained";
  whatChanged: string;
  whyChanged: string;
  dataSignalsUsed: string;
}

export interface ImplementationReportReasoning {
  executiveSummary: string;
  whyOptimized: string;
  gscAndSemrushStrategy: string;
  sectionRationale: ImplementationReportSectionRationale[];
  bossHighlights: string[];
}

function countWords(text: string): number {
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

export const IMPLEMENTATION_REPORT_REASONING_SCHEMA = `{"executiveSummary":"string","whyOptimized":"string","gscAndSemrushStrategy":"string","sectionRationale":[{"h2":"string","status":"added|rewritten|retained","whatChanged":"string","whyChanged":"string","dataSignalsUsed":"string"}],"bossHighlights":["string"]}`;

export function buildImplementationReportSystemPrompt(): string {
  return `You are the SEO Director writing an executive Implementation Report for management explaining what was optimized on a blog post and why.
Output a single JSON object only, no markdown fences.
Schema:
${IMPLEMENTATION_REPORT_REASONING_SCHEMA}
Rules:
- Ground every statement strictly in the provided GSC data, Semrush data, DataForSEO SERP/PAA signals, and deterministic before/after diffs.
- Never invent GSC clicks, impressions, or Semrush keywords when those arrays are empty; if a data source has 0 entries, state explicitly that the source had no prior data for this URL and explain which signals (focus keyword, SERP PAA, or site blueprint) drove the decisions instead.
- Do not use the em dash character in any string.
- sectionRationale MUST contain one entry for each H2 in the optimized post (in order), explaining what changed in that section, why it was added or rewritten, and which specific GSC query, Semrush keyword, PAA question, or internal link target informed it.
- bossHighlights MUST contain 3 to 5 concise, high-impact takeaways a manager or client can scan in 15 seconds.`;
}

export function parseImplementationReportReasoning(raw: string): ImplementationReportReasoning {
  const obj = parseJsonObjectFromModelText(raw);
  const executiveSummary = String(obj.executiveSummary ?? "").trim();
  const whyOptimized = String(obj.whyOptimized ?? "").trim();
  const gscAndSemrushStrategy = String(obj.gscAndSemrushStrategy ?? "").trim();
  const rawSections = Array.isArray(obj.sectionRationale) ? obj.sectionRationale : [];
  const rawHighlights = Array.isArray(obj.bossHighlights) ? obj.bossHighlights : [];

  if (!executiveSummary || !whyOptimized || !gscAndSemrushStrategy) {
    throw new Error("Implementation report reasoning JSON is missing required summary fields.");
  }

  const sectionRationale: ImplementationReportSectionRationale[] = rawSections.map((item) => {
    const o = (item ?? {}) as Record<string, unknown>;
    const statusRaw = String(o.status ?? "added").trim().toLowerCase();
    const status: "added" | "rewritten" | "retained" =
      statusRaw === "rewritten" || statusRaw === "retained" ? statusRaw : "added";
    return {
      h2: String(o.h2 ?? "").trim(),
      status,
      whatChanged: String(o.whatChanged ?? "").trim(),
      whyChanged: String(o.whyChanged ?? "").trim(),
      dataSignalsUsed: String(o.dataSignalsUsed ?? "").trim(),
    };
  });

  const bossHighlights = rawHighlights
    .map((h) => String(h ?? "").trim())
    .filter(Boolean);

  return {
    executiveSummary,
    whyOptimized,
    gscAndSemrushStrategy,
    sectionRationale,
    bossHighlights,
  };
}

export async function generateImplementationReport(
  comparison: ContentComparison,
  fileManager: OptimizationFileManager,
  options?: { skipMetaDescriptionSection?: boolean },
): Promise<string> {
  const skipMetaDescriptionSection = Boolean(options?.skipMetaDescriptionSection);
  const diff = computeImplementationReportDiff(comparison);

  let directorReasoning: ImplementationReportReasoning | null = null;
  if (comparison.apiKey?.trim()) {
    const userPayload = JSON.stringify(
      {
        url: comparison.url,
        updateMode: comparison.updateMode,
        primaryKeyword: comparison.primaryKeyword,
        selectedKeywordMetrics: comparison.selectedKeyword,
        clusterKeywords: comparison.clusterKeywords ?? [],
        title: { before: comparison.originalTitle, after: comparison.newTitle },
        wordCount: {
          before: diff.originalWordCount,
          after: diff.newWordCount,
          diff: diff.wordCountDiff,
        },
        gscTopQueries: diff.gscQueries,
        semrush: {
          urlOrganicKeywords: diff.semrushOrganicKeywords,
          phraseRelatedKeywords: diff.semrushPhraseRelatedKeywords,
          externalAuthorityUrls: diff.semrushExternalUrls,
        },
        serpSignals: {
          topCompetitors: diff.serpCompetitors,
          peopleAlsoAsk: diff.serpPaaQuestions.slice(0, 8),
        },
        beforeH2s: diff.originalH2s,
        afterH2SectionDiffs: diff.sectionDiffs,
        removedH2s: diff.removedH2s,
        linksDiff: {
          addedInternal: diff.addedInternalLinks,
          removedInternal: diff.removedInternalLinks,
          addedExternal: diff.addedExternalLinks,
        },
        faqsAdded: (comparison.faqEntries ?? []).map((f) => f.question),
      },
      null,
      2,
    );

    const aiRes = await callAgentCategoryOpenRouterChat({
      category: "research",
      siteId: comparison.siteId,
      apiKey: comparison.apiKey,
      system: buildImplementationReportSystemPrompt(),
      user: `Write the Implementation Report reasoning JSON for this blog optimization:\n\n${userPayload}`,
      maxTokens: 16000,
      reasoning: { effort: "low" },
      temperature: 0.25,
      responseFormat: { type: "json_object" },
    });
    directorReasoning = parseImplementationReportReasoning(aiRes.content);
  }

  const report: string[] = [];
  report.push("# Implementation Report");
  report.push("");
  report.push(`- **URL:** ${comparison.url}`);
  report.push(`- **Primary Focus Keyword:** \`${comparison.primaryKeyword}\``);
  report.push(`- **Mode:** ${comparison.updateMode === "update" ? "Updated Existing Post" : "Created New Draft"}`);
  report.push(`- **Generated:** ${new Date().toISOString()}`);
  report.push("");

  if (directorReasoning) {
    report.push("## Director Executive Summary (For Management)");
    report.push("");
    report.push(directorReasoning.executiveSummary);
    report.push("");
    if (directorReasoning.bossHighlights.length > 0) {
      report.push("### Key Takeaways");
      report.push("");
      for (const bullet of directorReasoning.bossHighlights) {
        report.push(`- ${bullet}`);
      }
      report.push("");
    }
    report.push("## Why This Blog Was Optimized");
    report.push("");
    report.push(directorReasoning.whyOptimized);
    report.push("");
    report.push("## How GSC & Semrush Data Guided the Optimization");
    report.push("");
    report.push(directorReasoning.gscAndSemrushStrategy);
    report.push("");
  } else {
    report.push("## Executive Summary");
    report.push("");
    report.push(
      `This report documents the optimization of ${comparison.url} targeting the primary focus keyword **"${comparison.primaryKeyword}"**.`,
    );
    report.push("");
  }

  report.push("## Search Console (GSC) & Semrush Data Snapshot");
  report.push("");
  report.push("### Primary Keyword Metrics (GSC)");
  report.push(`- **Target Query:** ${comparison.selectedKeyword.query || comparison.primaryKeyword}`);
  report.push(`- **Clicks:** ${comparison.selectedKeyword.clicks ?? 0}`);
  report.push(`- **Impressions:** ${comparison.selectedKeyword.impressions ?? 0}`);
  report.push(
    `- **Average Position:** ${comparison.selectedKeyword.position > 0 ? comparison.selectedKeyword.position.toFixed(1) : "N/A"}`,
  );
  report.push(
    `- **CTR:** ${comparison.selectedKeyword.ctr > 0 ? `${(comparison.selectedKeyword.ctr * 100).toFixed(2)}%` : "N/A"}`,
  );
  report.push("");

  if (diff.gscQueries.length > 0) {
    report.push("### Top GSC Queries for This URL");
    report.push("");
    report.push("| Query | Clicks | Impressions | CTR | Position |");
    report.push("|---|---|---|---|---|");
    for (const q of diff.gscQueries) {
      const ctrStr = q.ctr && q.ctr > 0 ? `${(q.ctr * 100).toFixed(2)}%` : "0.00%";
      const posStr = q.position && q.position > 0 ? q.position.toFixed(1) : "-";
      report.push(`| ${q.query} | ${q.clicks} | ${q.impressions} | ${ctrStr} | ${posStr} |`);
    }
    report.push("");
  } else {
    report.push("- **GSC URL Queries:** No historical Search Console query rows recorded for this URL.");
    report.push("");
  }

  if (diff.semrushOrganicKeywords.length > 0 || diff.semrushPhraseRelatedKeywords.length > 0) {
    report.push("### Semrush Keyword Intelligence Used");
    report.push("");
    if (diff.semrushOrganicKeywords.length > 0) {
      report.push(`- **URL Organic Keywords (${diff.semrushOrganicKeywords.length}):** ${diff.semrushOrganicKeywords.slice(0, 15).join(", ")}`);
    }
    if (diff.semrushPhraseRelatedKeywords.length > 0) {
      report.push(`- **Phrase-Related Keywords (${diff.semrushPhraseRelatedKeywords.length}):** ${diff.semrushPhraseRelatedKeywords.slice(0, 15).join(", ")}`);
    }
    if (diff.semrushExternalUrls.length > 0) {
      report.push(`- **Approved External Citation Targets (${diff.semrushExternalUrls.length}):** ${diff.semrushExternalUrls.slice(0, 8).join(", ")}`);
    }
    report.push("");
  } else {
    report.push("- **Semrush Data:** No Semrush organic or phrase-related keywords were stored in the brief for this URL.");
    report.push("");
  }

  report.push("## Before vs. After Change Tracking");
  report.push("");
  report.push("### Content Statistics");
  report.push("");
  report.push("| Metric | Before | After | Change |");
  report.push("|---|---|---|---|");
  report.push(
    `| Word Count | ${diff.originalWordCount.toLocaleString()} | ${diff.newWordCount.toLocaleString()} | ${diff.wordCountDiff >= 0 ? "+" : ""}${diff.wordCountDiff.toLocaleString()} (${diff.wordCountPercent}%) |`,
  );
  report.push(
    `| Character Count | ${diff.originalCharCount.toLocaleString()} | ${diff.newCharCount.toLocaleString()} | ${diff.charCountDiff >= 0 ? "+" : ""}${diff.charCountDiff.toLocaleString()} |`,
  );
  const h2Diff = diff.newH2s.length - diff.originalH2s.length;
  report.push(
    `| H2 Sections | ${diff.originalH2s.length} | ${diff.newH2s.length} | ${h2Diff >= 0 ? "+" : ""}${h2Diff} |`,
  );
  const kwDiff = diff.newKeywordCount - diff.originalKeywordCount;
  report.push(
    `| Focus Keyword Count | ${diff.originalKeywordCount} (${diff.originalDensity}%) | ${diff.newKeywordCount} (${diff.newDensity}%) | ${kwDiff >= 0 ? "+" : ""}${kwDiff} |`,
  );
  report.push(
    `| Internal Links | ${diff.retainedInternalLinks.length + diff.removedInternalLinks.length} | ${diff.retainedInternalLinks.length + diff.addedInternalLinks.length} | +${diff.addedInternalLinks.length} added / -${diff.removedInternalLinks.length} removed |`,
  );
  report.push(
    `| External Citations | ${diff.removedExternalLinks.length} | ${diff.addedExternalLinks.length} | +${diff.addedExternalLinks.length} added |`,
  );
  report.push("");

  report.push("### Title & Meta Changes");
  report.push("");
  if (comparison.originalTitle !== comparison.newTitle) {
    report.push(`- **Title Before:** \`${comparison.originalTitle}\``);
    report.push(`- **Title After:** \`${comparison.newTitle}\``);
  } else {
    report.push(`- **Title (Unchanged):** \`${comparison.originalTitle}\``);
  }
  if (!skipMetaDescriptionSection) {
    if (comparison.originalExcerpt !== comparison.newExcerpt) {
      report.push(`- **Meta Description Before:** ${comparison.originalExcerpt || "(none)"}`);
      report.push(`- **Meta Description After:** ${comparison.newExcerpt || "(none)"}`);
    } else {
      report.push(`- **Meta Description:** Unchanged`);
    }
  }
  report.push("");

  report.push("## H2 Section-by-Section Changes & Director Rationale");
  report.push("");
  report.push("| # | H2 Heading | Status | Words (Before -> After) | What & Why Changed |");
  report.push("|---|---|---|---|---|");
  const rationaleByH2 = new Map(
    (directorReasoning?.sectionRationale ?? []).map((r) => [r.h2.toLowerCase(), r]),
  );
  diff.sectionDiffs.forEach((sec, idx) => {
    const r = rationaleByH2.get(sec.h2.toLowerCase()) ?? directorReasoning?.sectionRationale[idx];
    const detail = r
      ? `**What:** ${r.whatChanged} **Why:** ${r.whyChanged} *(Signals: ${r.dataSignalsUsed})*`
      : sec.purpose || "Updated to align with target keyword and SERP structure.";
    report.push(
      `| ${idx + 1} | ${sec.h2} | ${sec.status.toUpperCase()} | ${sec.beforeWords} -> ${sec.afterWords} | ${detail.replace(/\|/g, "/")} |`,
    );
  });
  report.push("");

  if (diff.removedH2s.length > 0) {
    report.push("### Replaced / Consolidated Original H2 Headings");
    report.push("");
    for (const rem of diff.removedH2s) {
      report.push(`- \`${rem.h2}\` (${rem.words} words)`);
    }
    report.push("");
  }

  report.push("## Internal & External Link Changes");
  report.push("");
  if (diff.addedInternalLinks.length > 0) {
    report.push(`### Internal Links Added (${diff.addedInternalLinks.length})`);
    report.push("");
    for (const link of diff.addedInternalLinks) {
      report.push(`- [${link.anchor}](${link.url})`);
    }
    report.push("");
  } else {
    report.push("- **Internal Links Added:** 0 new internal links.");
    report.push("");
  }

  if (diff.removedInternalLinks.length > 0) {
    report.push(`### Outdated Internal Links Removed (${diff.removedInternalLinks.length})`);
    report.push("");
    for (const link of diff.removedInternalLinks) {
      report.push(`- \`${link.anchor}\` -> ${link.url}`);
    }
    report.push("");
  }

  if (diff.addedExternalLinks.length > 0) {
    report.push(`### External Authority Citations Added (${diff.addedExternalLinks.length})`);
    report.push("");
    for (const link of diff.addedExternalLinks) {
      report.push(`- [${link.anchor}](${link.url})`);
    }
    report.push("");
  }

  if (comparison.faqEntries && comparison.faqEntries.length > 0) {
    report.push(`## FAQ Schema & Visible Q&A Added (${comparison.faqEntries.length})`);
    report.push("");
    comparison.faqEntries.forEach((faq, idx) => {
      report.push(`${idx + 1}. **${faq.question}**`);
    });
    report.push("");
  }

  const origExtraTrim = (comparison.originalExtraText || "").trim();
  const newExtraTrim = (comparison.newExtraText || "").trim();
  if (origExtraTrim || newExtraTrim) {
    report.push("## Extra Text (ACF: seo_extra_text)");
    report.push("");
    if (origExtraTrim !== newExtraTrim) {
      report.push(`- **Before Words:** ${countWords(origExtraTrim)}`);
      report.push(`- **After Words:** ${countWords(newExtraTrim)}`);
    } else {
      report.push("- **No change** to `seo_extra_text`.");
    }
    report.push("");
  }

  const reportContent = report.join("\n");
  const slug = aiseoPostContentFileSlug(comparison.url || comparison.primaryKeyword);
  const reportFileName = `implementation-report-${slug}.md`;
  fileManager.removeFile(reportFileName);
  fileManager.addFile(reportFileName, reportContent, "text/markdown;charset=utf-8");

  return reportContent;
}
