import { useEffect, useRef, useState } from "react";
import {
  generateBulkSplashStatus,
  type BulkSplashStatus,
} from "@/lib/bulk/bulk-splash-status-agent";
import { logger } from "@/lib/logger";

export const BULK_SPLASH_STARTER_STATUS: BulkSplashStatus = {
  status: "Getting the workshop warmed up",
  visual: "generic",
};

type UseBulkSplashAiStatusArgs = {
  /** True while a bulk post generation run is in flight. */
  active: boolean;
  /** Newest raw pipeline step (processingStepLog tail, or run status). */
  latestStep: string;
  articleTitle?: string;
  keyword?: string;
  siteName?: string;
};

/**
 * Follows the newest bulk pipeline step and keeps one AI-written status line
 * plus its matching placeholder graphic kind on the generation splash.
 * Fire-and-forget: it never blocks the run, stale replies are dropped,
 * repeated steps are served from cache, and a failed rewrite leaves the
 * previous pair on screen.
 */
export function useBulkSplashAiStatus({
  active,
  latestStep,
  articleTitle,
  keyword,
  siteName,
}: UseBulkSplashAiStatusArgs): BulkSplashStatus {
  const [statusPair, setStatusPair] = useState<BulkSplashStatus>(BULK_SPLASH_STARTER_STATUS);
  const cacheRef = useRef(new Map<string, BulkSplashStatus>());
  const sequenceRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const step = latestStep.trim();

  useEffect(() => {
    if (!active) {
      abortRef.current?.abort();
      sequenceRef.current += 1;
      setStatusPair(BULK_SPLASH_STARTER_STATUS);
      return;
    }
    if (!step) return;

    const cacheKey = `${keyword?.trim().toLowerCase() ?? ""}::${step}`;
    const cached = cacheRef.current.get(cacheKey);
    if (cached) {
      setStatusPair(cached);
      return;
    }

    const sequence = ++sequenceRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    void generateBulkSplashStatus({
      step,
      articleTitle,
      keyword,
      siteName,
      signal: controller.signal,
    })
      .then((pair) => {
        cacheRef.current.set(cacheKey, pair);
        if (sequenceRef.current === sequence) {
          setStatusPair(pair);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        logger.warn("[Bulk] splash status rewrite failed, keeping previous line:", error);
      });
  }, [active, step, articleTitle, keyword, siteName]);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  return statusPair;
}
