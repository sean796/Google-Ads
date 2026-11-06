import { normalizeCompetitorDomainKey } from "@/lib/competitor-research/competitor-domain-key";
import { formatCompetitorMetricCell } from "@/lib/competitor-research/competitor-report-number-format";
import type { CompetitorReportSectionIndex } from "@/lib/competitor-research/competitor-report-system-prompt";
export function formatOpenRouterPayloadBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export function safeDomainForFilename(d: string): string {
  const k = normalizeCompetitorDomainKey(d);
  return (k || "domain").replace(/[^a-z0-9.-]+/gi, "_").slice(0, 80);
}

/** Non-empty trimmed lines - supports paste of multiple URLs, one per line. */
export function splitCompetitorInputLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

export function triggerDownloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Rotating hints while step 2 runs - summarize research JSON. */
export const REPORT_SUMMARIZE_WAIT_HINTS = [
  "Summarizing shrinks text fields so the writer step fits in context.",
  "OpenRouter may queue briefly before the summarizer starts.",
  "Keep this tab in the foreground to avoid browser throttling.",
  "Only your API key, compact research JSON, and instructions are sent to OpenRouter.",
] as const;

/** Short labels for the strategist sections (writer step). */
export const STRATEGIST_SECTION_LABELS: Record<CompetitorReportSectionIndex, string> = {
  1: "The Foundational Pillars",
  2: "Pain Points",
  3: "Traffic & Intent Gaps",
};

/** Rotating hints while step 6 runs (strategist sections). */
export const REPORT_WRITE_WAIT_HINTS = [
  "Writing the strategist report. Large keyword tables can push this past 5 minutes; three sections run in parallel.",
  "OpenRouter may queue briefly before the model starts writing.",
  "Keep this tab in the foreground to avoid browser throttling.",
  "Only your API key, summarized research JSON, and instructions are sent to OpenRouter.",
] as const;

export function formatCompetitorReportTabProgressLine(step: number, label: string | null, total: number): string {
  const micro = label ?? "…";
  if (step <= 0) {
    return `Step 3/3 · 0/${total} · ${micro}`;
  }
  const phase = step <= 5 ? "Prep" : "Strategist";
  const phaseDetail = step <= 5 ? `${step}/5` : `${step - 5}/4`;
  return `Step 3/3 · ${phase} ${phaseDetail} · ${step}/${total} · ${micro}`;
}

export function isPortfolioBlockedHost(dk: string, blocked: string[]): boolean {
  if (!dk || blocked.length === 0) return false;
  for (const b of blocked) {
    if (!b) continue;
    if (dk === b) return true;
    if (dk.endsWith(`.${b}`)) return true;
  }
  return false;
}

/** One-line GSC or seed-demand status after Analyze - neon frame, no query table. */
export function fmtSeedNum(n: number | null | undefined): string {
  return formatCompetitorMetricCell(n);
}

export function fmtSeedMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return " - ";
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

