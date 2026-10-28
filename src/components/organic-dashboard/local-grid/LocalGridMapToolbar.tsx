import { useEffect, useRef, useState } from "react";
import {
  Box,
  Building2,
  Loader2,
  MapPin,
  Pencil,
  Share2,
  Trash2,
} from "lucide-react";
import type { LocalGridBulkCsvMode } from "@/lib/local-grid-studio/local-grid-bulk-csv-generator";
import type {
  LocalGridAggregatedView,
  LocalGridDistanceMeasure,
  LocalGridScanSize,
  LocalGridShape,
} from "@/lib/local-grid-studio/local-grid-types";
import { cn } from "@/lib/utils";

const BULK_ENTITY_ROWS_MAX = 45;
const BULK_COMPETITOR_ROWS_MAX = 20;

function parseBulkRowCountDraft(draft: string): number | null {
  const t = draft.trim();
  if (t === "") return null;
  if (!/^\d+$/.test(t)) return null;
  const n = parseInt(t, 10);
  return Number.isFinite(n) ? n : null;
}

function bulkRowCountMaxForMode(mode: LocalGridBulkCsvMode): number {
  return mode === "competitors" ? BULK_COMPETITOR_ROWS_MAX : BULK_ENTITY_ROWS_MAX;
}

function isBulkRowCountDraftValid(draft: string, mode: LocalGridBulkCsvMode): boolean {
  const n = parseBulkRowCountDraft(draft);
  if (n === null) return false;
  const max = bulkRowCountMaxForMode(mode);
  return n >= 1 && n <= max;
}

const DEFAULT_ENTITY_ROW_DRAFT = "9";

export type LocalGridMapToolbarProps = {
  siteId?: string;
  /** Matches Properties SAP scheduled/quota gap; null = non-editorial site. */
  editorialEntityRowCount?: number | null;
  layoutLocked?: boolean;
  scanning: boolean;
  keyword: string;
  onKeywordChange: (value: string) => void;
  scanSize: LocalGridScanSize;
  onScanSizeChange: (size: LocalGridScanSize) => void;
  shape: LocalGridShape;
  onShapeChange: (shape: LocalGridShape) => void;
  distance: number;
  onDistanceChange: (distance: number) => void;
  distanceMeasure: LocalGridDistanceMeasure;
  onDistanceMeasureChange: (measure: LocalGridDistanceMeasure) => void;
  plannedPinCount: number;
  view: LocalGridAggregatedView | null;
  onRunScan: (overrideSize?: LocalGridScanSize, reuseCenter?: boolean) => void;
  onImportCsvFile: (file: File) => void;
  onExportCsv: () => void;
  onDeleteActiveScan?: () => void;
  onScrollToReport: () => void;
  generatingBulkCsv: boolean;
  onGenerateBulkCsv: (mode: LocalGridBulkCsvMode, count: number) => void;
  editMode?: boolean;
  onToggleEditMode?: () => void;
};

export function LocalGridMapToolbar({
  siteId,
  editorialEntityRowCount,
  layoutLocked = false,
  scanning,
  keyword,
  onKeywordChange,
  scanSize,
  onScanSizeChange,
  shape,
  onShapeChange,
  distance,
  onDistanceChange,
  distanceMeasure,
  onDistanceMeasureChange,
  plannedPinCount,
  view,
  onRunScan,
  onImportCsvFile,
  onExportCsv,
  onDeleteActiveScan,
  onScrollToReport,
  generatingBulkCsv,
  onGenerateBulkCsv,
  editMode = false,
  onToggleEditMode,
}: LocalGridMapToolbarProps) {
  const [bulkRowCountDraft, setBulkRowCountDraft] = useState(DEFAULT_ENTITY_ROW_DRAFT);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editorialEntityRowCount === undefined) return;
    if (editorialEntityRowCount === null) {
      setBulkRowCountDraft(DEFAULT_ENTITY_ROW_DRAFT);
      return;
    }
    setBulkRowCountDraft(String(editorialEntityRowCount));
  }, [siteId, editorialEntityRowCount]);

  const freezeGrid = layoutLocked;
  const hasScan = Boolean(view && view.summary.totalPoints > 0);
  const locationsCountValid = isBulkRowCountDraftValid(bulkRowCountDraft, "locations");
  const competitorsCountValid = isBulkRowCountDraftValid(bulkRowCountDraft, "competitors");

  return (
    <div className="flex shrink-0 flex-col border-b border-zinc-800 bg-zinc-950 text-zinc-200">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onImportCsvFile(file);
          e.target.value = "";
        }}
      />

      <input
        type="text"
        aria-label="Search keyword"
        placeholder="Keyword"
        value={keyword}
        disabled={freezeGrid}
        onChange={(e) => onKeywordChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onRunScan();
        }}
        className="h-8 min-w-[10rem] flex-1 rounded-none border border-zinc-800 bg-zinc-900 px-3 text-base text-zinc-100 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-50 sm:max-w-xs"
      />

      <div className="ml-auto flex flex-wrap items-center gap-1.5">
        <button
          type="button"
          onClick={onScrollToReport}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-none bg-primary px-3 text-base font-semibold text-black shadow-none hover:bg-[#92cf00]"
          title="Open Local Grid Data Report"
        >
          <Box className="h-4 w-4 shrink-0" aria-hidden />
          <span>Analyze</span>
        </button>

        <div className="flex shrink-0 flex-nowrap items-center gap-1 border-l border-r border-zinc-800 px-1.5">
          <input
            type="text"
            inputMode="numeric"
            autoComplete="off"
            aria-label="Entity rows"
            placeholder="Entity rows"
            title={
              editorialEntityRowCount != null && editorialEntityRowCount !== undefined
                ? "SAP rows still needed this editorial month (same as Properties pin quota gap)"
                : "Location entity rows (1–45). Competitors use 1–20."
            }
            value={bulkRowCountDraft}
            disabled={!hasScan || scanning || generatingBulkCsv}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^\d+$/.test(v)) {
                setBulkRowCountDraft(v);
              }
            }}
            className="h-8 w-16 shrink-0 rounded-none border border-zinc-800 bg-zinc-900 px-2 text-base font-medium tabular-nums text-zinc-200 placeholder:text-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-40"
          />

          <button
            type="button"
            disabled={!hasScan || scanning || generatingBulkCsv || !locationsCountValid}
            onClick={() => {
              const n = parseBulkRowCountDraft(bulkRowCountDraft);
              if (n === null) return;
              onGenerateBulkCsv("locations", n);
            }}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-none border border-zinc-800 bg-zinc-900 px-2.5 text-base font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            title={
              hasScan
                ? "Download bulk template CSV with entity + keyword from this grid"
                : "Run a grid scan first to download entities"
            }
          >
            <MapPin className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>Entities</span>
          </button>

          <button
            type="button"
            disabled={!hasScan || scanning || generatingBulkCsv || !competitorsCountValid}
            onClick={() => {
              const n = parseBulkRowCountDraft(bulkRowCountDraft);
              if (n === null) return;
              onGenerateBulkCsv("competitors", n);
            }}
            className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-none border border-zinc-800 bg-zinc-900 px-2.5 text-base font-medium text-zinc-300 transition-colors hover:bg-zinc-800 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
            title={
              hasScan
                ? "Generate Competitors bulk template CSV from this grid"
                : "Run a grid scan first to generate Competitors"
            }
          >
            <Building2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
            <span>Competitors</span>
          </button>
        </div>

        <button
          type="button"
          disabled={!hasScan}
          onClick={onExportCsv}
          className="inline-flex h-8 w-8 items-center justify-center rounded-none border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-40"
          title="Export Local Grid CSV"
          aria-label="Export Local Grid CSV"
        >
          <Share2 className="h-4 w-4" aria-hidden />
        </button>

        {hasScan && onDeleteActiveScan ? (
          <button
            type="button"
            disabled={freezeGrid}
            onClick={onDeleteActiveScan}
            className="inline-flex h-8 w-8 items-center justify-center rounded-none border border-zinc-800 bg-zinc-900 text-zinc-300 hover:bg-zinc-800 hover:text-red-400 disabled:opacity-40"
            title="Delete saved scan"
            aria-label="Delete saved scan"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
          </button>
        ) : null}

        {onToggleEditMode ? (
          <button
            type="button"
            onClick={onToggleEditMode}
            className={cn(
              "inline-flex h-8 w-8 items-center justify-center rounded-none bg-primary text-black transition-colors hover:bg-[#92cf00]",
              editMode && "ring-2 ring-primary ring-offset-2 ring-offset-zinc-950",
            )}
            title={editMode ? "Close edit screen" : "Edit grid scan details"}
            aria-label="Edit grid scan details"
          >
            <Pencil className="h-4 w-4 text-black" aria-hidden />
          </button>
        ) : null}

        <button
          type="button"
          disabled={scanning || !keyword.trim()}
          onClick={() => onRunScan()}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-none bg-primary px-3.5 text-base font-semibold text-black shadow-none hover:bg-[#92cf00] disabled:opacity-50"
        >
          {scanning ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden /> : null}
          <span>{scanning ? "Running…" : "Run Now"}</span>
        </button>
      </div>
      </div>
    </div>
  );
}
