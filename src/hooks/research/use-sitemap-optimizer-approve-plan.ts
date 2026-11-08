import { useCallback, useState } from "react";
import type { WordPressSite } from "@/components/integrations/types";
import {
  runSitemapOptimizerApprovePlan,
  type ApprovePlanPhase,
  type ApprovePlanPhaseProgress,
} from "@/lib/sitemap-optimizer/sitemap-optimizer-approve-plan";
import type { SitemapApproveProgressView } from "@/lib/sitemap-optimizer/sitemap-approve-progress-display";
import type { SitemapOptimizerRunResult } from "@/lib/sitemap-optimizer/types";

export type ApprovePlanProgress = SitemapApproveProgressView;

export function useSitemapOptimizerApprovePlan() {
  const [approving, setApproving] = useState(false);
  const [progress, setProgress] = useState<ApprovePlanProgress | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const setPhaseProgress = useCallback((p: ApprovePlanPhaseProgress) => {
    setProgress(p);
  }, []);

  const approve = useCallback(
    async (args: {
      site: WordPressSite;
      result: SitemapOptimizerRunResult;
      triggerRedirectDownload: (csv: string, filename: string) => void;
      triggerContentSheetDownload: (csv: string, filename: string) => void;
    }) => {
      const { site, result, triggerRedirectDownload, triggerContentSheetDownload } = args;

      setLastError(null);
      setApproving(true);
      setProgress({
        phase: "redirects",
        completed: 0,
        total: 1,
        detail: "Building NEO Pulse redirect redirect CSV",
      });

      try {
        const summary = await runSitemapOptimizerApprovePlan({
          site,
          result,
          triggerRedirectDownload,
          triggerContentSheetDownload,
          onPhaseProgress: setPhaseProgress,
          onTrashProgress: (p) => {
            setProgress({
              phase: "trash",
              completed: p.completed,
              total: p.total,
              detail: p.currentTitle ? `Trash: ${p.currentTitle}` : "Moving posts to trash",
            });
          },
        });

        setProgress({
          phase: "done",
          completed: summary.trashed,
          total: summary.sourcePostCount,
          detail: "Complete",
        });

        return { ok: true as const, summary };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setLastError(msg);
        return { ok: false as const, error: msg };
      } finally {
        setApproving(false);
      }
    },
    [setPhaseProgress],
  );

  return { approving, progress, lastError, approve, setLastError };
}

export type { ApprovePlanPhase };
