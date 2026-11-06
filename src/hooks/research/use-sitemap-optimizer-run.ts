import { useCallback, useRef, useState } from "react";
import type {
  SitemapOptimizerProgress,
  SitemapOptimizerRunResult,
} from "@/lib/sitemap-optimizer/types";
import { executeSitemapOptimizerRun } from "./sitemap-optimizer-run-execute";
import type { SitemapOptimizerRunArgs } from "./use-sitemap-optimizer-run-types";

export function useSitemapOptimizerRun() {
  const [phase, setPhase] = useState<SitemapOptimizerProgress["phase"]>("idle");
  const [progress, setProgress] = useState<SitemapOptimizerProgress>({
    phase: "idle",
    completed: 0,
    total: 0,
  });
  const [result, setResult] = useState<SitemapOptimizerRunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    setProgress({ phase: "idle", completed: 0, total: 0 });
  }, []);

  const run = useCallback(
    async (args: SitemapOptimizerRunArgs) =>
      executeSitemapOptimizerRun(
        { setPhase, setProgress, setResult, setError, abortRef },
        args,
      ),
    [],
  );

  const running = phase !== "idle" && phase !== "done" && phase !== "error";

  return {
    phase,
    progress,
    result,
    error,
    running,
    run,
    cancel,
    setResult,
    setError,
  };
}
