import { callAgentCategoryOpenRouterChat } from "@/lib/openrouter-agent-category-api";
import { OptimizationFileManager } from "@/lib/optimization-file-manager";
import { aiseoPostContentFileSlug } from "@/lib/overview/overview-aiseo-row-artifacts";
import { computeImplementationReportDiff, countWords } from "./implementation-report-diff";
import {
  buildImplementationReportSystemPrompt,
  parseImplementationReportReasoning,
} from "./implementation-report-reasoning";
import type {
  ContentComparison,
  ImplementationReportReasoning,
} from "./implementation-report-types";

export type {
  ContentComparison,
  H2SectionDiffRow,
  ImplementationReportDeterministicDiff,
  ImplementationReportReasoning,
  ImplementationReportSectionRationale,
  LinkAnchorPair,
} from "./implementation-report-types";
export {
  computeImplementationReportDiff,
  extractLinksFromContent,
  extractMarkdownH2Sections,
} from "./implementation-report-diff";
export {
  IMPLEMENTATION_REPORT_REASONING_SCHEMA,
  buildImplementationReportSystemPrompt,
  parseImplementationReportReasoning,
} from "./implementation-report-reasoning";

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
