import pLimit from "p-limit";
import { notify } from "@/lib/app-notifications";
import {
  NOTIFY_COULD_NOT_DERIVE_A_FOCUS_KEYWORD_FOR_THI,
  NOTIFY_DATAFORSEO_SERP_STORED_AND_JSON_CONTENT_,
  NOTIFY_GSC_KEYWORDS_FOR_THIS_PAGE_URL_FAILED_SE,
} from "@/lib/notify-messages";
import type { BulkHarnessSectionPayload } from "@/lib/bulk-auto-generate";
import { parseGscBriefFromContext } from "@/lib/overview-seo-content-brief";
import {
  extractSerpDumpJsonFromMcpResponse,
  fetchOptionalDataForSeoSerp,
  mergeSeoContentBriefFromParts,
  resolveSerpDumpJsonForBrief,
} from "@/lib/llm-audit/fetch-seo-content-brief-wave";
import { extractDataForSeoSerpBrief } from "@/lib/overview-seo-content-brief";
import { fetchLlmAuditOpenRouterWithQfo } from "@/lib/llm-audit/llm-audit-openrouter";
import type { LlmAuditBrief, QueryFanout } from "@/lib/overview-seo-content-brief";
import {
  RESEARCH_HARNESS_SECTION_TITLES,
  RESEARCH_HARNESS_TOTAL_SECTIONS,
  type ResearchHarnessDoneSummary,
} from "@/lib/overview/overview-research-harness-sections";
import { backendApiUrl } from "@/lib/wordpress-api/connection";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import type { WordPressSite } from "@/components/integrations/types";

const SEO_BRIEF_SAVE_CONCURRENCY = 20;
const seoBriefSaveLimit = pLimit(SEO_BRIEF_SAVE_CONCURRENCY);

export const RESEARCH_NO_GSC_DATA = "No GSC data";

export function isOverviewGscDumpFilename(filename: string): boolean {
  const name = filename.trim();
  return /^gsc_(quick_wins|page_keywords|site_queries)__[a-zA-Z0-9._-]+\.csv$/i.test(name);
}

export function firstValidGscDumpFilename(
  ...candidates: Array<string | null | undefined>
): string | null {
  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed && isOverviewGscDumpFilename(trimmed)) return trimmed;
  }
  return null;
}

export function hasValidGscDumpFilename(filename: string | null | undefined): boolean {
  return Boolean(filename?.trim() && isOverviewGscDumpFilename(filename.trim()));
}

export type ResearchArtifactFile = { name: string; content: string; mimeType: string };

export type OverviewResearchRowInput = {
  row: OverviewRow;
  rowIndex?: number;
  site: WordPressSite | undefined;
  gscQuickWinsFile: string | null;
  gscCsvForBatch?: string | null;
  resolveGscCsv?: () => Promise<string | null>;
  batchResearchMode?: boolean;
  serpDumpUrl: (filename: string) => string;
  skipGsc?: boolean;
  silent?: boolean;
  onHarnessSection?: (payload: BulkHarnessSectionPayload) => void;
  onResearchArtifact?: (file: ResearchArtifactFile) => void;
};

function researchRowArtifactName(keyword: string, stepPart: string): string {
  const slug = keyword.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60) || "row";
  const part = stepPart.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60) || "step";
  return `research-${slug}-${part}.json`;
}

function emitResearchArtifact(
  input: OverviewResearchRowInput,
  keyword: string,
  stepPart: string,
  content: unknown,
): void {
  input.onResearchArtifact?.({
    name: researchRowArtifactName(keyword, stepPart),
    content: JSON.stringify(content, null, 2),
    mimeType: "application/json;charset=utf-8",
  });
}

function emitHarnessSection(
  input: OverviewResearchRowInput,
  sectionIndex: number,
  phase: BulkHarnessSectionPayload["phase"],
  markdownSlice?: string,
): void {
  const rowIndex = input.rowIndex ?? 0;
  input.onHarnessSection?.({
    rowIndex,
    sectionIndex,
    totalSections: RESEARCH_HARNESS_TOTAL_SECTIONS,
    title: RESEARCH_HARNESS_SECTION_TITLES[sectionIndex] ?? `Section ${sectionIndex + 1}`,
    phase,
    markdownSlice,
  });
}

function emitHarnessError(
  input: OverviewResearchRowInput,
  sectionIndex: number,
  message: string,
  harnessSummaries: ResearchHarnessDoneSummary,
): void {
  const title = RESEARCH_HARNESS_SECTION_TITLES[sectionIndex];
  if (title) harnessSummaries[title] = message;
  emitHarnessSection(input, sectionIndex, "done", message);
}

export async function exportOverviewGscForPageUrls(
  siteUrl: string,
  pageUrls: string[],
): Promise<string | null> {
  if (!siteUrl.trim() || pageUrls.length === 0) return null;
  const unique = [...new Set(pageUrls.map((u) => u.trim()).filter(Boolean))];
  if (!unique.length) return null;
  const exportRes = await fetch(backendApiUrl("/gsc/export-overview-quick-wins"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      siteUrl: siteUrl.trim(),
      pageUrls: unique,
    }),
  });
  const exportJson = await exportRes.json().catch(() => null);
  if (exportRes.ok && exportJson?.storedFile) {
    const stored = String(exportJson.storedFile);
    return hasValidGscDumpFilename(stored) ? stored : null;
  }
  return null;
}

function emitGscCsvDone(
  input: OverviewResearchRowInput,
  filename: string | null,
  harnessSummaries: ResearchHarnessDoneSummary,
): string | null {
  if (input.skipGsc === true) {
    harnessSummaries["GSC CSV"] = RESEARCH_NO_GSC_DATA;
    emitHarnessSection(input, 1, "done", RESEARCH_NO_GSC_DATA);
    return null;
  }
  if (hasValidGscDumpFilename(filename)) {
    harnessSummaries["GSC CSV"] = `GSC CSV: ${filename}`;
    emitHarnessSection(input, 1, "done", harnessSummaries["GSC CSV"]);
    return filename!.trim();
  }
  harnessSummaries["GSC CSV"] = RESEARCH_NO_GSC_DATA;
  emitHarnessSection(input, 1, "done", RESEARCH_NO_GSC_DATA);
  return null;
}

async function resolveGscFilenameForRow(
  input: OverviewResearchRowInput,
  harnessSummaries: ResearchHarnessDoneSummary,
): Promise<string | null> {
  const { row, site, resolveGscCsv } = input;
  const silent = input.silent === true;

  if (input.skipGsc === true) {
    return emitGscCsvDone(input, null, harnessSummaries);
  }

  const preset = firstValidGscDumpFilename(
    input.gscCsvForBatch,
    row.gscQuickWinsCsvFilename,
    input.gscQuickWinsFile,
  );
  if (preset) {
    return emitGscCsvDone(input, preset, harnessSummaries);
  }

  emitHarnessSection(input, 1, "start");

  if (resolveGscCsv) {
    const batchFile = await resolveGscCsv();
    if (hasValidGscDumpFilename(batchFile)) {
      return emitGscCsvDone(input, batchFile, harnessSummaries);
    }
  }

  if (site?.siteUrl && row.url?.trim()) {
    const single = await exportOverviewGscForPageUrls(site.siteUrl, [row.url.trim()]);
    if (single) {
      return emitGscCsvDone(input, single, harnessSummaries);
    }
    if (!silent) {
      notify.warning(NOTIFY_GSC_KEYWORDS_FOR_THIS_PAGE_URL_FAILED_SE);
    }
  }

  return emitGscCsvDone(input, null, harnessSummaries);
}

async function loadGscBriefContext(
  filename: string,
  pageUrl: string,
): Promise<{ queries: string[]; pageUrl: string }> {
  if (!filename.trim() || !pageUrl.trim()) {
    throw new Error("GSC quick-wins context missing backend or page URL");
  }
  if (!isOverviewGscDumpFilename(filename)) {
    throw new Error("GSC quick-wins context requires a valid GSC CSV dump");
  }
  const ctxRes = await fetch(backendApiUrl("/gsc/quick-wins-context"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filename, pageUrl: pageUrl.trim() }),
  });
  const ctxJson = await ctxRes.json().catch(() => null);
  if (!ctxRes.ok || !ctxJson) {
    const detail =
      ctxJson && typeof ctxJson === "object" && "error" in ctxJson
        ? String((ctxJson as { error?: unknown }).error)
        : typeof ctxJson === "string"
          ? ctxJson.slice(0, 240)
          : "";
    const suffix = detail.trim() ? `: ${detail.trim()}` : "";
    throw new Error(`GSC quick-wins context failed (HTTP ${ctxRes.status})${suffix}`);
  }
  if (Array.isArray(ctxJson.queries) && ctxJson.queries.length) {
    return {
      queries: ctxJson.queries.filter(
        (q: unknown): q is string => typeof q === "string" && q.trim().length > 0,
      ),
      pageUrl,
    };
  }
  if (typeof ctxJson.context === "string") {
    const parsed = parseGscBriefFromContext(ctxJson.context);
    return {
      queries: parsed.queries,
      pageUrl: parsed.pageUrl || pageUrl,
    };
  }
  return { queries: [], pageUrl };
}

function emitGscQuickWinsNoData(
  input: OverviewResearchRowInput,
  harnessSummaries: ResearchHarnessDoneSummary,
): { queries: string[]; pageUrl: string } {
  harnessSummaries["GSC quick-wins context"] = RESEARCH_NO_GSC_DATA;
  emitHarnessSection(input, 4, "done", RESEARCH_NO_GSC_DATA);
  return { queries: [], pageUrl: input.row.url?.trim() ?? "" };
}

async function uploadSeoBrief(content: string, keyword: string): Promise<string | null> {
  try {
    return await seoBriefSaveLimit(async () => {
      const saveRes = await fetch(backendApiUrl("/overview/seo-brief"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, keyword }),
      });
      const saveJson = await saveRes.json().catch(() => null);
      if (saveRes.ok && saveJson?.storedFile) return String(saveJson.storedFile);
      return null;
    });
  } catch {
    return null;
  }
}

function llmAuditHasContent(audit: LlmAuditBrief): boolean {
  return audit.platforms.some((platform) => platform.status === "ok" && platform.responseText?.trim());
}

function llmAuditTimedOut(audit: LlmAuditBrief): boolean {
  const err = audit.platforms.find((platform) => platform.error)?.error?.trim() ?? "";
  return /timeout|aborted|abort/i.test(err);
}

function emptyLlmAudit(pageUrl: string): LlmAuditBrief {
  return { siteUrl: pageUrl, location: "", platforms: [] };
}

function harnessStepIsDone(
  summaries: ResearchHarnessDoneSummary,
  sectionIndex: number,
): boolean {
  const title = RESEARCH_HARNESS_SECTION_TITLES[sectionIndex];
  return Boolean(title && summaries[title]?.trim());
}

function completeRemainingResearchHarnessSteps(
  input: OverviewResearchRowInput,
  summaries: ResearchHarnessDoneSummary,
  message: string,
  fromSectionIndex = 0,
): void {
  for (let sectionIndex = fromSectionIndex; sectionIndex < RESEARCH_HARNESS_TOTAL_SECTIONS; sectionIndex += 1) {
    if (harnessStepIsDone(summaries, sectionIndex)) continue;
    emitHarnessError(input, sectionIndex, message, summaries);
  }
}

function stripHtmlToPlainText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function serpPeopleAlsoAskFromMcp(
  serpMcpJson: Record<string, unknown> | null | undefined,
): string[] {
  const dump = extractSerpDumpJsonFromMcpResponse(serpMcpJson);
  if (!dump) return [];
  return extractDataForSeoSerpBrief(dump)
    .peopleAlsoAsk.map((entry) => entry.question.trim())
    .filter(Boolean)
    .slice(0, 8);
}

async function runOpenRouterLlmAuditStep(
  input: OverviewResearchRowInput,
  keyword: string,
  pageUrl: string,
  harnessSummaries: ResearchHarnessDoneSummary,
  serpPeopleAlsoAsk: string[] = [],
): Promise<{ llmAudit: LlmAuditBrief; queryFanout?: QueryFanout }> {
  emitHarnessSection(input, 2, "start");
  const pageExcerpt = input.row.postContent?.trim()
    ? stripHtmlToPlainText(input.row.postContent).slice(0, 1200)
    : undefined;
  let result = await fetchLlmAuditOpenRouterWithQfo({
    keyword,
    siteUrl: pageUrl,
    site: input.site,
    companyName: input.site?.name,
    title: input.row.title,
    pageUrl,
    metaDescription: input.row.metaDescription,
    pageExcerpt,
    serpPeopleAlsoAsk,
  });
  if (!llmAuditHasContent(result.llmAudit) && !llmAuditTimedOut(result.llmAudit)) {
    result = await fetchLlmAuditOpenRouterWithQfo({
      keyword,
      siteUrl: pageUrl,
      site: input.site,
      companyName: input.site?.name,
      title: input.row.title,
      pageUrl,
      metaDescription: input.row.metaDescription,
      pageExcerpt,
      serpPeopleAlsoAsk,
    });
  }
  const { llmAudit, queryFanout } = result;
  const queryCount = queryFanout?.queries?.length ?? 0;
  if (llmAuditHasContent(llmAudit)) {
    const llmOkCount = llmAudit.platforms.filter((platform) => platform.status === "ok").length;
    harnessSummaries["LLM audit"] =
      queryCount > 0
        ? `LLM audit: ${llmOkCount}/${llmAudit.platforms.length} ok (${queryCount} QFO questions)`
        : `LLM audit: ${llmOkCount}/${llmAudit.platforms.length} ok`;
    emitHarnessSection(input, 2, "done", harnessSummaries["LLM audit"]);
  } else {
    const llmErr =
      llmAudit.platforms.find((platform) => platform.error)?.error?.trim() || "LLM audit failed";
    emitHarnessError(input, 2, llmErr, harnessSummaries);
  }
  emitResearchArtifact(input, keyword, "llm-audit", llmAudit);
  if (queryFanout?.queries?.length) {
    emitResearchArtifact(input, keyword, "qfo-questions", queryFanout);
  }
  return { llmAudit, queryFanout };
}

async function runGscQuickWinsContextStep(
  input: OverviewResearchRowInput,
  filename: string,
  pageUrl: string,
  harnessSummaries: ResearchHarnessDoneSummary,
): Promise<{ queries: string[]; pageUrl: string }> {
  emitHarnessSection(input, 4, "start");
  try {
    const ctx = await loadGscBriefContext(filename, pageUrl);
    const summary =
      ctx.queries.length > 0 ? `${ctx.queries.length} GSC queries` : RESEARCH_NO_GSC_DATA;
    harnessSummaries["GSC quick-wins context"] = summary;
    emitHarnessSection(input, 4, "done", summary);
    return ctx;
  } catch (err) {
    const message = err instanceof Error ? err.message : "GSC quick-wins context failed";
    emitHarnessError(input, 4, message, harnessSummaries);
    return { queries: [], pageUrl };
  }
}

export type OverviewResearchRowResult = {
  patch: Partial<OverviewRow> | null;
  harnessSummaries?: ResearchHarnessDoneSummary;
};

export async function runOverviewResearchForRow(
  input: OverviewResearchRowInput,
): Promise<OverviewResearchRowResult> {
  const { row, serpDumpUrl } = input;
  const skipGsc = input.skipGsc === true;
  const silent = input.silent === true;
  const harnessSummaries: ResearchHarnessDoneSummary = {};

  const keyword = row.focusKeyword?.trim();
  if (!keyword) {
    const missingKw = "Missing focus keyword";
    completeRemainingResearchHarnessSteps(input, harnessSummaries, missingKw, 0);
    if (!silent) notify.error(NOTIFY_COULD_NOT_DERIVE_A_FOCUS_KEYWORD_FOR_THI);
    return { patch: null, harnessSummaries };
  }

  const pageUrl = row.url?.trim() ?? "";
  let storedFile: string | null = null;
  let serpMcpJson: Awaited<ReturnType<typeof fetchOptionalDataForSeoSerp>>["serpMcpJson"] = null;
  let gscFilename: string | null = null;
  let llmAudit: LlmAuditBrief = emptyLlmAudit(pageUrl);
  let queryFanout: QueryFanout | undefined;
  let serpDumpJson: Record<string, unknown> = { tasks: [] };
  let gscContext: { queries: string[]; pageUrl: string } = { queries: [], pageUrl };
  let briefText = "";

  try {
    // Step 0: DataForSEO SERP (optional; never aborts row)
    emitHarnessSection(input, 0, "start");
    const serpResult = await fetchOptionalDataForSeoSerp({
      keyword,
      site: input.site,
    });
    storedFile = serpResult.storedFile;
    serpMcpJson = serpResult.serpMcpJson;
    if (storedFile) {
      harnessSummaries["DataForSEO SERP"] = `SERP saved: ${storedFile}`;
      emitHarnessSection(input, 0, "done", harnessSummaries["DataForSEO SERP"]);
      const serpInline = extractSerpDumpJsonFromMcpResponse(
        serpMcpJson as Record<string, unknown> | null | undefined,
      );
      if (serpInline) {
        emitResearchArtifact(input, keyword, "dataforseo-serp", serpInline);
      }
    } else {
      const serpMsg =
        serpResult.serpError?.trim() ||
        "DataForSEO SERP unavailable; OpenRouter LLM audit used for SERP research";
      emitHarnessError(input, 0, serpMsg, harnessSummaries);
    }

    // Step 1: GSC CSV
    gscFilename = skipGsc
      ? emitGscCsvDone(input, null, harnessSummaries)
      : await resolveGscFilenameForRow(input, harnessSummaries);

    // Step 2: OpenRouter LLM audit (required for brief)
    const serpPeopleAlsoAsk = serpPeopleAlsoAskFromMcp(
      serpMcpJson as Record<string, unknown> | null | undefined,
    );
    const llmStep = await runOpenRouterLlmAuditStep(
      input,
      keyword,
      pageUrl,
      harnessSummaries,
      serpPeopleAlsoAsk,
    );
    llmAudit = llmStep.llmAudit;
    queryFanout = llmStep.queryFanout;

    // Step 3: SERP dump load
    emitHarnessSection(input, 3, "start");
    const serpLoad = await resolveSerpDumpJsonForBrief({
      storedFile,
      serpMcpJson,
      serpDumpUrl,
    });
    serpDumpJson = serpLoad.serpDumpJson;
    harnessSummaries["SERP dump load"] = serpLoad.loadSummary;
    emitHarnessSection(input, 3, "done", serpLoad.loadSummary);
    emitResearchArtifact(input, keyword, "serp-dump-load", serpDumpJson);
    const serpInlineAfterLoad = extractSerpDumpJsonFromMcpResponse(
      serpMcpJson as Record<string, unknown> | null | undefined,
    );
    if (!serpInlineAfterLoad && Object.keys(serpDumpJson).length > 0) {
      emitResearchArtifact(input, keyword, "dataforseo-serp", serpDumpJson);
    }

    // Step 4: GSC quick-wins context (after GSC filename is known)
    if (skipGsc) {
      emitHarnessSection(input, 4, "start");
      gscContext = emitGscQuickWinsNoData(input, harnessSummaries);
    } else if (hasValidGscDumpFilename(gscFilename)) {
      gscContext = await runGscQuickWinsContextStep(
        input,
        gscFilename!,
        pageUrl,
        harnessSummaries,
      );
    } else {
      emitHarnessSection(input, 4, "start");
      gscContext = emitGscQuickWinsNoData(input, harnessSummaries);
    }
    emitResearchArtifact(input, keyword, "gsc-quick-wins-context", gscContext);

    // Step 5: Brief merge
    emitHarnessSection(input, 5, "start");
    const merged = mergeSeoContentBriefFromParts({
      serpDumpJson,
      pageUrl,
      focusKeyword: keyword,
      gscPageUrl: gscContext.pageUrl,
      gscQueries: gscContext.queries,
      semrushOverviewJson: null,
      llmAudit,
      queryFanout,
    });
    briefText = JSON.stringify(merged, null, 2);
    harnessSummaries["Brief merge"] = "Brief merged";
    emitHarnessSection(input, 5, "done", harnessSummaries["Brief merge"]);

    const briefSlug = keyword.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60) || "brief";
    const briefFileName = `serp-research-brief-${briefSlug}.json`;
    input.onResearchArtifact?.({
      name: briefFileName,
      content: briefText,
      mimeType: "application/json;charset=utf-8",
    });

    // Step 6: Brief upload
    emitHarnessSection(input, 6, "start");
    const briefStored = await uploadSeoBrief(briefText, keyword);
    if (briefStored) {
      harnessSummaries["Brief upload"] = `Brief saved: ${briefStored}`;
      emitHarnessSection(input, 6, "done", harnessSummaries["Brief upload"]);
      input.onResearchArtifact?.({
        name: briefStored,
        content: briefText,
        mimeType: "application/json;charset=utf-8",
      });
    } else {
      emitHarnessError(
        input,
        6,
        "Brief upload unavailable; brief JSON saved in generated files",
        harnessSummaries,
      );
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const failedIndex = RESEARCH_HARNESS_SECTION_TITLES.findIndex(
      (title) => !harnessSummaries[title]?.trim(),
    );
    if (failedIndex >= 0) {
      emitHarnessError(input, failedIndex, message, harnessSummaries);
    }
    completeRemainingResearchHarnessSteps(
      input,
      harnessSummaries,
      "Continued after step error",
      failedIndex >= 0 ? failedIndex + 1 : 0,
    );
  }

  if (!briefText.trim()) {
    try {
      if (!harnessStepIsDone(harnessSummaries, 5)) {
        emitHarnessSection(input, 5, "start");
      }
      const merged = mergeSeoContentBriefFromParts({
        serpDumpJson,
        pageUrl,
        focusKeyword: keyword,
        gscPageUrl: gscContext.pageUrl,
        gscQueries: gscContext.queries,
        semrushOverviewJson: null,
        llmAudit,
        queryFanout,
      });
      briefText = JSON.stringify(merged, null, 2);
      harnessSummaries["Brief merge"] = "Brief merged";
      emitHarnessSection(input, 5, "done", harnessSummaries["Brief merge"]);
      const briefSlug = keyword.replace(/[^a-z0-9._-]+/gi, "_").slice(0, 60) || "brief";
      input.onResearchArtifact?.({
        name: `serp-research-brief-${briefSlug}.json`,
        content: briefText,
        mimeType: "application/json;charset=utf-8",
      });
    } catch (mergeErr) {
      const mergeMessage = mergeErr instanceof Error ? mergeErr.message : String(mergeErr);
      emitHarnessError(input, 5, mergeMessage, harnessSummaries);
    }
  }

  if (!harnessStepIsDone(harnessSummaries, 6)) {
    emitHarnessSection(input, 6, "start");
    const briefStored = briefText.trim() ? await uploadSeoBrief(briefText, keyword) : null;
    if (briefStored) {
      harnessSummaries["Brief upload"] = `Brief saved: ${briefStored}`;
      emitHarnessSection(input, 6, "done", harnessSummaries["Brief upload"]);
      input.onResearchArtifact?.({
        name: briefStored,
        content: briefText,
        mimeType: "application/json;charset=utf-8",
      });
    } else {
      emitHarnessError(
        input,
        6,
        briefText.trim()
          ? "Brief upload unavailable; brief JSON saved in generated files"
          : "Brief upload skipped; brief merge did not produce JSON",
        harnessSummaries,
      );
    }
  }

  completeRemainingResearchHarnessSteps(
    input,
    harnessSummaries,
    "Step did not run",
    0,
  );

  const briefStoredFilename =
    harnessSummaries["Brief upload"]?.replace(/^Brief saved:\s*/i, "").trim() || null;

  const researchPatch: Partial<OverviewRow> = {
    ...(storedFile ? { researchFileName: storedFile } : {}),
    ...(!skipGsc && hasValidGscDumpFilename(gscFilename)
      ? { gscQuickWinsCsvFilename: gscFilename }
      : {}),
    ...(briefText.trim() ? { seoResearch: briefText } : {}),
    ...(briefStoredFilename ? { briefFileName: briefStoredFilename } : {}),
  };

  if (!silent && briefText.trim()) {
    notify.success(NOTIFY_DATAFORSEO_SERP_STORED_AND_JSON_CONTENT_);
  }

  return {
    patch: briefText.trim() ? researchPatch : null,
    harnessSummaries,
  };
}
