import { useEffect, useMemo, useRef, useState } from "react";
import { Box, Building2, MapPin, Pencil, Share2, Trash2 } from "lucide-react";
import { ActionButton, Button, CheckField, DialogShell, Field, FileInput, FilterRow, FilterRowDivider, Pill } from "@/ui";
import { cityPinPriorities } from "@/lib/local-grid-studio/local-grid-decision-weights";
import type { LocalGridBulkCsvMode } from "@/lib/local-grid-studio/local-grid-bulk-csv-generator";
import type {
  LocalGridAggregatedView,
  LocalGridDistanceMeasure,
  LocalGridScanSize,
  LocalGridShape,
} from "@/lib/local-grid-studio/local-grid-types";

const BULK_ENTITY_ROWS_MAX = 45;
const BULK_COMPETITOR_ROWS_MAX = 20;

const RUN_STATES = ["Run Now", "Running"] as const;

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
  onGenerateBulkCsv: (mode: LocalGridBulkCsvMode, count: number, cities?: string[]) => void;
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
  const bulkBlocked = !hasScan || scanning || generatingBulkCsv;

  return (
    <div className="flex shrink-0 flex-col bg-black text-foreground">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2">
        <FileInput
          ref={fileInputRef}
                    accept=".csv,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImportCsvFile(file);
            e.target.value = "";
          }}
        />

        <Field
          size="keyword"
          placeholder="Keyword"
          aria-label="Search keyword"
          value={keyword}
          disabled={freezeGrid}
          onChange={(e) => onKeywordChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onRunScan();
          }}
        />

        <FilterRow align="end">
          <Button
            variant="run"
            icon={Box}
            title="Open Local Grid Data Report"
            onClick={onScrollToReport}
          >
            Analyze
          </Button>

          <FilterRowDivider />
          <Field
            size="count"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="Rows"
            aria-label="Entity rows"
            title={
              editorialEntityRowCount != null && editorialEntityRowCount !== undefined
                ? "SAP rows still needed this editorial month (same as Properties pin quota gap)"
                : "Location entity rows (1–45). Competitors use 1–20."
            }
            value={bulkRowCountDraft}
            disabled={bulkBlocked}
            onChange={(e) => {
              const v = e.target.value;
              if (v === "" || /^\d+$/.test(v)) {
                setBulkRowCountDraft(v);
              }
            }}
          />
          <Button
            variant="tool"
            icon={MapPin}
            disabled={bulkBlocked || !locationsCountValid}
            onClick={() => {
              const n = parseBulkRowCountDraft(bulkRowCountDraft);
              if (n === null) return;
              onGenerateBulkCsv("locations", n);
            }}
            title={
              hasScan
                ? "Download bulk template CSV with entity + keyword from this grid"
                : "Run a grid scan first to download entities"
            }
          >
            Entities
          </Button>
          <Button
            variant="tool"
            icon={Building2}
            disabled={bulkBlocked || !competitorsCountValid}
            onClick={() => {
              const n = parseBulkRowCountDraft(bulkRowCountDraft);
              if (n === null) return;
              onGenerateBulkCsv("competitors", n);
            }}
            title={
              hasScan
                ? "Generate Competitors bulk template CSV from this grid"
                : "Run a grid scan first to generate Competitors"
            }
          >
            Competitors
          </Button>
          <FilterRowDivider />

          <Button
            variant="tool"
            size="icon"
            icon={Share2}
            disabled={!hasScan}
            onClick={onExportCsv}
            title="Export Local Grid CSV"
            aria-label="Export Local Grid CSV"
          />

          {onDeleteActiveScan ? (
            <Button
              variant="danger"
              size="icon"
              icon={Trash2}
              reserved={!hasScan}
              disabled={freezeGrid}
              onClick={onDeleteActiveScan}
              title="Delete saved scan"
              aria-label="Delete saved scan"
            />
          ) : null}

          {onToggleEditMode ? (
            <Pill
              iconOnly
              square
              icon={Pencil}
              label="Edit grid scan details"
              active={editMode}
              onClick={onToggleEditMode}
            />
          ) : null}

          <ActionButton
            variant="run"
            states={RUN_STATES}
            state={scanning ? "Running" : "Run Now"}
            disabled={scanning || !keyword.trim()}
            onClick={() => onRunScan()}
          />
        </FilterRow>
      </div>
    </div>
  );
}
