import type { MetaBulkMicroSnapshot } from "@/components/overview/overview-bulk-micro-progress-helpers";
import type { BlogImportHeaderProgress } from "@/lib/bulk/blog-import-header-progress";
import {
  sitemapApproveOverallPct,
  type SitemapApproveProgressView,
} from "@/lib/sitemap-optimizer/sitemap-approve-progress-display";
import { sitemapOptimizerOverallPct } from "@/lib/sitemap-optimizer/progress-display";
import type { SitemapOptimizerProgress } from "@/lib/sitemap-optimizer/types";

export const SITEMAP_ANALYZE_LABEL = "Sitemap analyze";
export const SITEMAP_RANK_MATH_LABEL = "NEO Pulse redirect import";
export const SITEMAP_APPROVE_LABEL = "Approve plan";

export type SitemapPlanHeaderProgress = {
  label: string;
  phase: string;
  completed: number;
  total: number;
  progressPct?: number;
};

export function sitemapPlanHeaderProgressToBlogImport(
  progress: SitemapPlanHeaderProgress | null | undefined,
  isProcessing: boolean,
): BlogImportHeaderProgress | null {
  if (!progress?.phase?.trim()) return null;
  return {
    phase: progress.phase.trim(),
    completed: Math.max(0, progress.completed),
    total: Math.max(1, progress.total),
    progressPct: progress.progressPct,
    harnessActive: isProcessing,
  };
}

export function sitemapPlanHeaderProgressFromState(args: {
  rankMathImportRunning: boolean;
  rankMathProgress: SitemapOptimizerProgress | null;
  analyzeRunning: boolean;
  analyzeProgress: SitemapOptimizerProgress | null;
  approving: boolean;
  approveProgress: SitemapApproveProgressView | null;
}): SitemapPlanHeaderProgress | null {
  if (args.rankMathImportRunning && args.rankMathProgress) {
    const p = args.rankMathProgress;
    return {
      label: SITEMAP_RANK_MATH_LABEL,
      phase: p.detail?.trim() || SITEMAP_RANK_MATH_LABEL,
      completed: Math.max(0, p.completed),
      total: Math.max(1, p.total),
      progressPct: Math.round(sitemapOptimizerOverallPct(p)),
    };
  }

  if (args.analyzeRunning && args.analyzeProgress) {
    const p = args.analyzeProgress;
    return {
      label: SITEMAP_ANALYZE_LABEL,
      phase: p.detail?.trim() || SITEMAP_ANALYZE_LABEL,
      completed: Math.max(0, p.completed),
      total: Math.max(1, p.total),
      progressPct: Math.round(sitemapOptimizerOverallPct(p)),
    };
  }

  if (args.approving && args.approveProgress) {
    const p = args.approveProgress;
    return {
      label: SITEMAP_APPROVE_LABEL,
      phase: p.detail?.trim() || SITEMAP_APPROVE_LABEL,
      completed: Math.max(0, p.completed),
      total: Math.max(1, p.total),
      progressPct: Math.round(sitemapApproveOverallPct(p)),
    };
  }

  return null;
}

export function buildSitemapPlanMicroSnapshot(
  progress: SitemapPlanHeaderProgress | null | undefined,
): MetaBulkMicroSnapshot | null {
  if (!progress?.phase?.trim()) return null;
  const label = progress.label.trim();
  const phase = progress.phase.trim();
  const completed = Math.max(0, Math.floor(progress.completed));
  const total = Math.max(1, Math.floor(progress.total));
  const statusMessage =
    phase.toLowerCase() !== label.toLowerCase() ? phase : undefined;
  const progressPct =
    typeof progress.progressPct === "number" && Number.isFinite(progress.progressPct)
      ? Math.min(100, Math.max(0, progress.progressPct))
      : undefined;
  return { label, completed, total, statusMessage, progressPct };
}

export function sitemapPlanProgressBusy(args: {
  rankMathImportRunning: boolean;
  analyzeRunning: boolean;
  approving: boolean;
}): boolean {
  return args.rankMathImportRunning || args.analyzeRunning || args.approving;
}
