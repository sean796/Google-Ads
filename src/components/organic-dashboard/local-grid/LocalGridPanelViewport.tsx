import { useRef } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, X } from "lucide-react";
import type { LocalGridBulkCsvMode } from "@/lib/local-grid-studio/local-grid-bulk-csv-generator";
import type {
  LocalGridAggregatedView,
  LocalGridBusinessIdentity,
  LocalGridCoordinateNode,
  LocalGridDistanceMeasure,
  LocalGridEvaluatedPin,
  LocalGridHistoryEntry,
  LocalGridScanDocument,
  LocalGridScanSize,
  LocalGridShape,
} from "@/lib/local-grid-studio/local-grid-types";
import { cn } from "@/lib/utils";
import type { WordPressSite } from "@/components/integrations/types";
import { LocalGridDataReportTables } from "./LocalGridDataReportTables";
import { LocalGridEditPanel } from "./LocalGridEditPanel";
import { LocalGridMapCanvas } from "./LocalGridMapCanvas";
import { LocalGridMapToolbar } from "./LocalGridMapToolbar";
import { LocalGridOverlayCards } from "./LocalGridOverlayCards";
import { useLocalGridMapSnapshotPersist } from "./useLocalGridMapSnapshotPersist";
import type { LocalGridEntityDetailsBandProps } from "./LocalGridEntityDetailsBand";

export type LocalGridPanelViewportProps = {
  site: WordPressSite;
  /** SAP rows still needed this editorial month; null = not on a package; undefined = loading. */
  editorialEntityRowCount?: number | null;
  editMode?: boolean;
  onToggleEditMode?: () => void;
  onCloseEditMode?: () => void;
  onSaveEdit?: () => void;
  layoutLocked: boolean;
  oldestDateLabel: string;
  newestDateLabel: string;
  chronologicalHistory: LocalGridHistoryEntry[];
  activeScan: LocalGridScanDocument | null;
  activeHistoryIndex: number;
  history: LocalGridHistoryEntry[];
  onSelectHistoryScan: (scanId: string) => void;
  aggregatedView: LocalGridAggregatedView | null;
  previewNodes: LocalGridCoordinateNode[];
  scanning: boolean;
  selectedPointId: string | null;
  recenterSignal: number;
  onSelectPin: (pointId: string | null) => void;
  onDragPin: (pointId: string, newLat: number, newLng: number) => void;
  activeBusiness: LocalGridBusinessIdentity;
  resolvingBusiness: boolean;
  geocodingAddress: boolean;
  centerLat: number;
  centerLng: number;
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
  selectedPin: LocalGridEvaluatedPin | null;
  onCloseSelectedPin: () => void;
  onSelectBusiness: (biz: LocalGridBusinessIdentity) => void;
  onCenterOnAddress: (customAddr?: string) => void;
  onRunScan: (overrideSize?: LocalGridScanSize, reuseCenter?: boolean) => void;
  onImportCsvFile: (file: File) => void;
  onExportCsv: () => void;
  onDeleteActiveScan: (() => void) | undefined;
  reportDrawerOpen: boolean;
  onToggleReportDrawer: () => void;
  onCloseReportDrawer: () => void;
  generatingBulkCsv: boolean;
  onGenerateBulkCsv: (mode: LocalGridBulkCsvMode, count: number) => void;
  entityDetailsBand: LocalGridEntityDetailsBandProps;
};

export function LocalGridPanelViewport(props: LocalGridPanelViewportProps) {
  const {
    site,
    editorialEntityRowCount,
    editMode = false,
    onToggleEditMode,
    onCloseEditMode,
    onSaveEdit,
    layoutLocked,
    oldestDateLabel,
    newestDateLabel,
    chronologicalHistory,
    activeScan,
    activeHistoryIndex,
    history,
    onSelectHistoryScan,
    aggregatedView,
    previewNodes,
    scanning,
    selectedPointId,
    recenterSignal,
    onSelectPin,
    onDragPin,
    activeBusiness,
    resolvingBusiness,
    geocodingAddress,
    centerLat,
    centerLng,
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
    selectedPin,
    onCloseSelectedPin,
    onSelectBusiness,
    onCenterOnAddress,
    onRunScan,
    onImportCsvFile,
    onExportCsv,
    onDeleteActiveScan,
    reportDrawerOpen,
    onToggleReportDrawer,
    onCloseReportDrawer,
    generatingBulkCsv,
    onGenerateBulkCsv,
  } = props;

  const mapShellRef = useRef<HTMLDivElement>(null);
  useLocalGridMapSnapshotPersist({
    siteId: site.id,
    scanId: activeScan?.scanId,
    scanning,
    pointCount: activeScan?.points.length ?? 0,
    mapShellRef,
  });

  return (
    <div className="local-grid-panel-main flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="flex h-11 w-full shrink-0 items-center justify-between gap-4 border-b border-zinc-800 bg-zinc-900 px-4 text-base text-zinc-300">
        <div className="flex flex-1 items-center gap-3">
          <span className="shrink-0 text-base text-zinc-400 tabular-nums">{oldestDateLabel}</span>
          <div className="relative flex flex-1 items-center py-2">
            <div className="h-1 w-full rounded-full bg-zinc-800" />
            {chronologicalHistory.length > 0 ? (
              chronologicalHistory.map((item, idx) => {
                const pct =
                  chronologicalHistory.length > 1
                    ? (idx / (chronologicalHistory.length - 1)) * 100
                    : 100;
                const isCurrent = item.scanId === activeScan?.scanId;
                return (
                  <button
                    key={item.scanId}
                    type="button"
                    disabled={layoutLocked}
                    onClick={() => onSelectHistoryScan(item.scanId)}
                    style={{ left: `${pct}%` }}
                    className={cn(
                      "absolute -translate-x-1/2 rounded-full border-2 border-zinc-950 transition-transform hover:scale-125",
                      isCurrent
                        ? "h-3.5 w-3.5 bg-primary shadow-sm shadow-[#84bc00]/50"
                        : "h-3 w-3 bg-[#659100] hover:bg-primary",
                    )}
                    title={`${item.scanDateLabel} · ${item.keyword}`}
                  />
                );
              })
            ) : (
              <span className="absolute left-1/2 -translate-x-1/2 text-xs text-zinc-500">
                No scans recorded yet
              </span>
            )}
          </div>
          <span className="shrink-0 text-base font-medium text-zinc-200 tabular-nums">
            {newestDateLabel}
          </span>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <div className="inline-flex h-8 items-center gap-2 rounded-none border border-zinc-800 bg-zinc-950 px-3 text-base text-zinc-300">
            <span>Last 3 months</span>
            <ChevronDown className="h-4 w-4 text-zinc-400" aria-hidden />
          </div>
          <button
            type="button"
            disabled={
              layoutLocked || activeHistoryIndex < 0 || activeHistoryIndex >= history.length - 1
            }
            onClick={() => {
              const older = history[activeHistoryIndex + 1];
              if (older) onSelectHistoryScan(older.scanId);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-none border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-30"
            title="Previous scan"
            aria-label="Previous scan"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            disabled={layoutLocked || activeHistoryIndex <= 0}
            onClick={() => {
              const newer = history[activeHistoryIndex - 1];
              if (newer) onSelectHistoryScan(newer.scanId);
            }}
            className="inline-flex h-8 w-8 items-center justify-center rounded-none border border-zinc-800 bg-zinc-950 text-zinc-300 hover:bg-zinc-800 hover:text-white disabled:opacity-30"
            title="Next scan"
            aria-label="Next scan"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>

      <LocalGridMapToolbar
        siteId={site.id}
        editorialEntityRowCount={editorialEntityRowCount}
        layoutLocked={layoutLocked}
        scanning={scanning}
        keyword={activeScan?.keyword ?? keyword}
        onKeywordChange={onKeywordChange}
        scanSize={scanSize}
        onScanSizeChange={onScanSizeChange}
        shape={shape}
        onShapeChange={onShapeChange}
        distance={distance}
        onDistanceChange={onDistanceChange}
        distanceMeasure={distanceMeasure}
        onDistanceMeasureChange={onDistanceMeasureChange}
        plannedPinCount={previewNodes.length}
        view={aggregatedView}
        onRunScan={onRunScan}
        onImportCsvFile={onImportCsvFile}
        onExportCsv={onExportCsv}
        onDeleteActiveScan={onDeleteActiveScan}
        onScrollToReport={onToggleReportDrawer}
        generatingBulkCsv={generatingBulkCsv}
        onGenerateBulkCsv={onGenerateBulkCsv}
        editMode={editMode}
        onToggleEditMode={onToggleEditMode}
      />

      <div ref={mapShellRef} className="local-grid-leaflet-shell">
        <LocalGridMapCanvas
          evaluatedPins={editMode ? [] : (aggregatedView?.evaluatedPins ?? [])}
          previewNodes={previewNodes}
          scanning={scanning}
          selectedPointId={selectedPointId}
          recenterSignal={recenterSignal}
          onSelectPin={onSelectPin}
          onDragPin={layoutLocked ? undefined : onDragPin}
        />

        {editMode ? (
          <LocalGridEditPanel
            site={site}
            activeBusiness={activeBusiness}
            keyword={activeScan?.keyword ?? keyword}
            onKeywordChange={onKeywordChange}
            scanSize={scanSize}
            onScanSizeChange={onScanSizeChange}
            shape={shape}
            onShapeChange={onShapeChange}
            distance={distance}
            onDistanceChange={onDistanceChange}
            distanceMeasure={distanceMeasure}
            onDistanceMeasureChange={onDistanceMeasureChange}
            plannedPinCount={previewNodes.length}
            scanning={scanning}
            onRunScan={() => {
              onCloseEditMode?.();
              onRunScan();
            }}
            onSave={() => onSaveEdit?.()}
            onClose={() => onCloseEditMode?.()}
            onCenterOnBusiness={() => onCenterOnAddress()}
            resolvingBusiness={resolvingBusiness}
          />
        ) : (
          <LocalGridOverlayCards
            activeBusiness={activeBusiness}
            distanceMeasure={distanceMeasure}
            view={aggregatedView}
            selectedPin={selectedPin}
            onCloseSelectedPin={onCloseSelectedPin}
            onSelectBusiness={onSelectBusiness}
          />
        )}

        {reportDrawerOpen && aggregatedView && activeScan ? (
          <div className="pointer-events-auto absolute inset-0 z-30 flex flex-col bg-black/95 text-white">
            <div className="flex h-12 shrink-0 items-center justify-between border-b border-white/10 px-4">
              <span className="text-base font-bold text-white">
                Local Grid Data Report ({activeScan.keyword})
              </span>
              <button
                type="button"
                onClick={onCloseReportDrawer}
                className="inline-flex h-8 items-center gap-1.5 bg-zinc-800 px-3 text-base text-white hover:bg-zinc-700"
              >
                <X className="h-4 w-4" aria-hidden />
                <span>Back to Map</span>
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <LocalGridDataReportTables
                view={aggregatedView}
                keyword={activeScan.keyword}
                scanDateLabel={activeScan.scanDateLabel}
                scanSize={activeScan.scanSize}
                distance={activeScan.distance}
                distanceMeasure={activeScan.distanceMeasure}
                onSelectBusiness={(biz) => {
                  onSelectBusiness(biz);
                  onCloseReportDrawer();
                }}
                onFocusPin={(pid) => {
                  onSelectPin(pid);
                  onCloseReportDrawer();
                }}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
