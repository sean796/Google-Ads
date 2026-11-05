import React, { useRef } from "react";
import { Upload } from "lucide-react";
import type { CompetitorGridPlaceRow } from "@/lib/competitor-research/local-dominator-grid-parse";
import type { WordPressSite } from "@/components/integrations/types";
import type { CompetitorWorkspaceControls } from "../types";
import { cn } from "@/lib/utils";
import { Button, Field, FileInput } from "@/ui";

export type CompetitorDiscoverySectionProps = {
  site: WordPressSite | null;
  workspace: CompetitorWorkspaceControls;
  workspaceBusy: boolean;
  gridPlaces: CompetitorGridPlaceRow[];
  gridCsvName: string | null;
  gridParseError: string | null;
  csvParsing: boolean;
  onPickGridCsv: (file: File | null) => void;
  competitorCount: number;
  onCompetitorCountChange: (n: number) => void;
  competitorKeyword: string;
  onCompetitorKeywordChange: (v: string) => void;
  promptModifier: string;
  onPromptModifierChange: (v: string) => void;
  gridKeywordFromCsv: string;
};

export function CompetitorDiscoverySection({
  site,
  workspace,
  workspaceBusy,
  gridPlaces,
  gridCsvName,
  gridParseError,
  csvParsing,
  onPickGridCsv,
  competitorCount,
  onCompetitorCountChange,
  competitorKeyword,
  onCompetitorKeywordChange,
  promptModifier,
  onPromptModifierChange,
  gridKeywordFromCsv,
}: CompetitorDiscoverySectionProps) {
  const fileRef = useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (!competitorKeyword.trim() && gridKeywordFromCsv.trim()) {
      onCompetitorKeywordChange(gridKeywordFromCsv);
    }
  }, [gridKeywordFromCsv, competitorKeyword, onCompetitorKeywordChange]);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <FileInput
          ref={fileRef}
          accept=".csv,text/csv"
          onChange={(e) => {
            onPickGridCsv(e.target.files?.[0] ?? null);
            e.target.value = "";
          }}
        />
        <Button
          type="button"
          disabled={workspaceBusy || csvParsing}
          onClick={() => fileRef.current?.click()}
        >
          {csvParsing ? (
            null
          ) : (
            <Upload className="mr-2 h-4 w-4" aria-hidden />
          )}
          Grid CSV
        </Button>
        {gridCsvName ? (
          <span className="text-base text-muted-foreground">{gridCsvName}</span>
        ) : null}
        {site?.name ? (
          <span className="text-base text-muted-foreground">Site: {site.name}</span>
        ) : null}
        {workspace.showConnectedToggle && workspace.connectedSiteUrl ? (
          <span className="text-base text-muted-foreground break-words max-w-xs">
            {workspace.mode === "connected" ? workspace.connectedSiteUrl : workspace.tempSeedUrl}
          </span>
        ) : null}
      </div>

      {gridParseError ? (
        <p className="text-base text-destructive">{gridParseError}</p>
      ) : null}

      <div className="grid w-full grid-cols-2 gap-2 gap-x-3">
        <Field
          type="number"
          min={1}
          max={20}
          value={competitorCount}
          onChange={(e) => onCompetitorCountChange(Math.max(1, parseInt(e.target.value, 10) || 1))}
          placeholder="# Competitors"
          aria-label="Number of competitors to generate"
          disabled={workspaceBusy}
        />
        <Field
          type="text"
          value={competitorKeyword}
          onChange={(e) => onCompetitorKeywordChange(e.target.value)}
          placeholder="Keyword (e.g. blinds near me)"
          aria-label="Focus keyword"
          disabled={workspaceBusy}
        />
        <Field
          type="text"
          value={promptModifier}
          onChange={(e) => onPromptModifierChange(e.target.value)}
          placeholder="Prompt modifier (optional)"
          aria-label="Optional prompt modifier"
          disabled={workspaceBusy}
        />
      </div>

      {gridPlaces.length > 0 ? (
        <div className="rounded-md bg-black/20 p-3">
          <p className="mb-2 text-base font-medium text-foreground">
            Top {Math.min(competitorCount, gridPlaces.length)} from grid
          </p>
          <ul className="space-y-1">
            {gridPlaces.slice(0, competitorCount).map((p) => (
              <li key={p.dfsKeyword} className="flex items-center justify-between gap-2 text-base">
                <span className="min-w-0 break-words text-foreground">{p.businessName}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">#{p.rank}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className={cn("text-base text-muted-foreground")}>
          Upload a Local Dominator grid CSV to load competitor businesses.
        </p>
      )}
    </div>
  );
}
