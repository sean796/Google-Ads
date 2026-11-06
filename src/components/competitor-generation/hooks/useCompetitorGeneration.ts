import { useCallback, useState } from "react";
import { notify, notifyHeaderError } from "@/lib/app-notifications";
import { NOTIFY_OPENROUTER_IN_SETTINGS } from "@/lib/notify-messages";
import { loadApiKey } from "@/lib/api";
import type { CompetitorGridPlaceRow } from "@/lib/competitor-research/local-dominator-grid-parse";
import type { WordPressSite } from "@/components/integrations/types";
import { generateCompetitors } from "@/lib/competitor-research";
import { buildCompetitorHarnessGroups } from "@/lib/competitor-research/competitor-comparison-harness-state";
import { filterPlacesExcludingConnectedSite, selectCompetitorPlacesForRun } from "@/lib/competitor-research/filter-connected-site-competitors";
import type { CompetitorWithRow } from "@/lib/competitor-research/types";
import { finalizeEntitySapRowsForAdGroups } from "@/lib/local-analysis/sap-entity-ad-groups";
import type {
  CompetitorGenerationProgress,
  GeneratedCompetitorRow,
  UseCompetitorGenerationOptions,
} from "../types";
import { logClustersPipeline } from "@/lib/local-analysis/entity-clusters-console-log";

function competitorsToGeneratedRows(comps: CompetitorWithRow[]): GeneratedCompetitorRow[] {
  const domainByEntity = new Map(comps.map((c) => [c.row.entity?.trim() ?? "", c.domain]));
  return finalizeEntitySapRowsForAdGroups(comps.map((c) => c.row)).map((row) => ({
    ...row,
    domain: domainByEntity.get(row.entity?.trim() ?? "") ?? null,
  }));
}

export function useCompetitorGeneration(options?: UseCompetitorGenerationOptions) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState<CompetitorGenerationProgress | null>(null);
  const [generatedRows, setGeneratedRows] = useState<GeneratedCompetitorRow[]>([]);
  const [suggestedTitleFormat, setSuggestedTitleFormat] = useState("");
  const [competitorKeyword, setCompetitorKeyword] = useState("");
  const [promptModifier, setPromptModifier] = useState("");

  const handleGenerate = useCallback(
    async (
      site: WordPressSite,
      places: CompetitorGridPlaceRow[],
      keyword: string,
      count: number,
      promptModifierOverride?: string,
      onRowsUpdate?: (rows: GeneratedCompetitorRow[]) => void,
    ) => {
      const apiKey = loadApiKey();
      if (!apiKey) {
        notify.error(NOTIFY_OPENROUTER_IN_SETTINGS);
        return;
      }

      const kw = keyword.trim();
      if (!kw) {
        notify.error("Enter a keyword.");
        return;
      }
      if (!Number.isFinite(count) || count < 1) {
        notify.error("Enter a valid competitor count.");
        return;
      }

      const capped = selectCompetitorPlacesForRun(places, site, count);
      if (capped.length === 0) {
        logClustersPipeline("competitors", "blocked", { reason: "no_places_after_filter" });
        notify.error("No competitor businesses found for this city and keyword.");
        return;
      }

      const modifier = promptModifierOverride?.trim() ?? promptModifier.trim();
      logClustersPipeline("competitors", "generation_started", {
        keyword: kw,
        requestedCount: count,
        placeCount: capped.length,
        placesPreview: capped.slice(0, 25).map((p) => ({
          businessName: p.businessName,
          dfsKeyword: p.dfsKeyword,
          rank: p.rank,
        })),
        hasPromptModifier: Boolean(modifier),
      });
      setIsGenerating(true);
      setGeneratedRows([]);
      setProgress({
        currentMessage: "Starting competitor generation…",
        stepLog: [],
        harnessGroups: buildCompetitorHarnessGroups(capped.map((p) => p.businessName)),
      });

      try {
        const result = await generateCompetitors(
          {
            site,
            places: capped,
            keyword: kw,
            promptModifier: modifier || undefined,
            apiKey,
            siteId: site.id,
            onRowsUpdate: (comps) => {
              const rows = competitorsToGeneratedRows(comps);
              setGeneratedRows(rows);
              onRowsUpdate?.(rows);
            },
          },
          (message, harnessGroups) => {
            setProgress((prev) => ({
              currentMessage: message,
              stepLog: [...(prev?.stepLog ?? []), message].slice(-40),
              harnessGroups: harnessGroups ?? prev?.harnessGroups,
            }));
          },
        );

        const rows = competitorsToGeneratedRows(result.competitors);
        setGeneratedRows(rows);
        onRowsUpdate?.(rows);
        setSuggestedTitleFormat(result.suggestedTitleFormat);
        options?.onComplete?.(site.id, rows, result.suggestedTitleFormat);
      } catch (e) {
        notifyHeaderError(e, "Competitor generation failed");
      } finally {
        setIsGenerating(false);
      }
    },
    [promptModifier, options],
  );

  const clearResults = useCallback(() => {
    setGeneratedRows([]);
    setProgress(null);
    setSuggestedTitleFormat("");
  }, []);

  const updateGeneratedRowAt = useCallback((globalIdx: number, patch: Partial<GeneratedCompetitorRow>) => {
    setGeneratedRows((prev) => {
      if (globalIdx < 0 || globalIdx >= prev.length) return prev;
      const next = [...prev];
      next[globalIdx] = { ...next[globalIdx], ...patch };
      return next;
    });
  }, []);

  return {
    isGenerating,
    progress,
    generatedRows,
    suggestedTitleFormat,
    competitorKeyword,
    setCompetitorKeyword,
    promptModifier,
    setPromptModifier,
    handleGenerate,
    clearResults,
    updateGeneratedRowAt,
  };
}
