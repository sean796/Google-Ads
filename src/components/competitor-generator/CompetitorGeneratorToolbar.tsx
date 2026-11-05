import { useRef } from "react";
import { Trash2, Upload, Wand2 } from "lucide-react";
import { Button, Field, FileInput } from "@/ui";
import { GeneratorToolbarFrame } from "@/components/blog-generator/GeneratorToolbarFrame";
import {
  normalizeCompetitorBudgetInputChange,
  stepCompetitorBudgetInput,
} from "@/components/competitor-generator/competitor-budget-input";

export type CompetitorGeneratorToolbarProps = {
  workspaceBusy: boolean;
  csvParsing: boolean;
  uploadLabel: string;
  sapPageBudgetInput: string;
  onSapPageBudgetInputChange: (v: string) => void;
  suggestFocusKeyword: string;
  onSuggestFocusKeywordChange: (v: string) => void;
  runLoading: boolean;
  onPickFile: (file: File | null) => void;
  onRunClusters: () => void;
  onClear: () => void;
  hasSapRowsForCsv: boolean;
  onDownloadTargetsCsv: () => void;
  showTempUrl?: boolean;
  tempSeedUrl?: string;
  onTempSeedUrlChange?: (v: string) => void;
};

export function CompetitorGeneratorToolbar({
  workspaceBusy,
  csvParsing,
  uploadLabel,
  sapPageBudgetInput,
  onSapPageBudgetInputChange,
  suggestFocusKeyword,
  onSuggestFocusKeywordChange,
  runLoading,
  onPickFile,
  onRunClusters,
  onClear,
  hasSapRowsForCsv,
  onDownloadTargetsCsv,
  showTempUrl = false,
  tempSeedUrl = "",
  onTempSeedUrlChange,
}: CompetitorGeneratorToolbarProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const fieldsDisabled = workspaceBusy || runLoading;
  const gridUploaded = uploadLabel.trim().length > 0;
  return (
    <GeneratorToolbarFrame
      primary={
        <>
          <FileInput
            ref={fileRef}
            accept=".csv,text/csv"
            onChange={(e) => {
              onPickFile(e.target.files?.[0] ?? null);
              e.target.value = "";
            }}
          />
          {showTempUrl && onTempSeedUrlChange ? (
            <Field
              type="url"
              size="url"
              placeholder="https://example.com"
              aria-label="Website URL"
              value={tempSeedUrl}
              onChange={(e) => onTempSeedUrlChange(e.target.value)}
              disabled={workspaceBusy}
            />
          ) : null}
          <Button
            variant={gridUploaded ? "ready" : "tool"}
            icon={Upload}
            disabled={workspaceBusy || csvParsing}
            onClick={() => fileRef.current?.click()}
            aria-label={gridUploaded ? `Grid CSV: ${uploadLabel}` : "Upload grid CSV"}
            title={uploadLabel.trim() || "Upload grid CSV"}
          >
            Grid
          </Button>
          <Field
            size="keyword"
            placeholder="Keyword"
            value={suggestFocusKeyword}
            onChange={(e) => onSuggestFocusKeywordChange(e.target.value)}
            disabled={fieldsDisabled}
            autoComplete="off"
          />
          <Field
            size="short"
            type="text"
            inputMode="numeric"
            placeholder=""
            aria-label="Competitor count"
            title="Competitor count"
            autoComplete="off"
            value={sapPageBudgetInput}
            onChange={(e) => {
              onSapPageBudgetInputChange(normalizeCompetitorBudgetInputChange(e.target.value));
            }}
            onKeyDown={(e) => {
              if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
              const direction = e.key === "ArrowUp" ? "up" : "down";
              const next = stepCompetitorBudgetInput(sapPageBudgetInput, direction);
              if (next === null) return;
              e.preventDefault();
              onSapPageBudgetInputChange(next);
            }}
            disabled={fieldsDisabled}
          />
        </>
      }
      actions={
        <>
          <Button
            variant="run"
            icon={Wand2}
            disabled={fieldsDisabled}
            aria-busy={runLoading}
            aria-label="Run clusters"
            title="Run clusters"
            onClick={() => void onRunClusters()}
          >
            Clusters
          </Button>
          <Button
            variant="tool"
            disabled={!hasSapRowsForCsv || workspaceBusy}
            aria-label="Download bulk CSV"
            title="Download bulk CSV (bulk-auto-generate-template columns)"
            onClick={onDownloadTargetsCsv}
          >
            Bulk CSV
          </Button>
          <Button
            variant="danger"
            size="icon"
            icon={Trash2}
            disabled={workspaceBusy}
            aria-label="Clear"
            title="Clear"
            onClick={onClear}
          />
        </>
      }
    />
  );
}
