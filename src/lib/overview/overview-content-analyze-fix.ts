/**
 * Overview tile: HTML content analyze + targeted fix via OpenRouter (contract-first).
 * WordPress fetch/upload is performed by callers; this module handles LLM + verify loop only.
 */

export {
  MAX_VERIFY_PASSES,
  OVERVIEW_CONTENT_ANALYZE_MAX_HTML_CHARS,
  OVERVIEW_AUTOFIX_MAX_HTML_CHARS,
  mergeHtmlReference,
  overviewContentAnalyzeFixBusyPhaseLabel,
  filterUnsoundAuditIssues,
  buildAnalyzeResultFromIssues,
  buildAuditReferenceAppendix,
  auditIssuesToFixPassPayload,
  issuesToFixBulletsMarkdown,
  serializeContentAuditV1,
  parseContentAuditStorage,
  contentAuditStorageToFixBulletsMarkdown,
  auditStorageToFixPassPayload,
  inferAuditIssueSectionIndices,
  stripMarkdownCodeFenceFromModelOutput,
  bulletsMarkdownToLines,
  openRouterNonStreamCompletion,
} from "@/lib/overview/overview-content-audit-storage";
export type {
  ContentAuditAspectBullet,
  ContentAuditIssueRow,
  OverviewContentAnalyzeResult,
  OverviewContentAnalyzeFixBusyPhase,
  ParsedContentAuditStorage,
} from "@/lib/overview/overview-content-audit-storage";
export {
  parseOverviewAnalyzeResponseJson,
  OVERVIEW_CONTENT_ANALYZE_PROMPT,
  OVERVIEW_SECTION_CONTENT_ANALYZE_PROMPT,
  analyzeOverviewPostHtmlBySections,
  analyzeOverviewPostHtml,
} from "@/lib/overview/overview-content-analyze-runner";
export type {
  OverviewContentAnalyzeSectionProgress,
} from "@/lib/overview/overview-content-analyze-runner";
export {
  OVERVIEW_FIX_HTML_BLOCK_START,
  OVERVIEW_FIX_HTML_BLOCK_END,
  parseOverviewFixResponseJson,
  extractOverviewFixHtmlFromModelRaw,
  canUseStitchedSectionFix,
  applyOverviewHtmlFixesToAuditSlice,
  applyOverviewHtmlFixesFromBullets,
  titleForWpUpdate,
  excerptForWpUpdate,
  runOverviewContentAnalyzeFixLoop,
} from "@/lib/overview/overview-content-fix-runner";
