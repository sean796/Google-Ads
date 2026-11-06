import { getStoredSites } from "@/components/integrations/storage";
import type { BulkHarnessSectionUi } from '@/hooks/use-bulk-auto-generate';
import type { CSVRow } from '@/lib/bulk-auto-generate';
import { BulkHarnessSectionsPanel } from './BulkHarnessSectionsPanel';
import { cn } from '@/lib/utils';

interface ProgressAndStatsDisplayProps {
  isProcessing: boolean;
  currentRow: number;
  totalRows: number;
  status: string;
  stats: {
    total: number;
    completed: number;
    error: number;
  };
  fileManager: {
    getAllFiles: () => Array<{ fileName: string; status: string }>;
  };
  selectedWordPressSites: Set<string>;
  harnessSections?: BulkHarnessSectionUi[];
  /** Fixed blueprint total for harness progress; when null, UI falls back to live array length. */
  harnessPlannedSectionCount?: number | null;
  /** Active bulk rows (shows title + keyword for current row). */
  displayRows?: CSVRow[];
  /** Optional line above progress (e.g. sitemap trash phase). */
  phaseLabel?: string;
  hideStats?: boolean;
  compactHarness?: boolean;
  /** Show row-level bulk bar even when harness sections are present. */
  showBulkBarWithHarness?: boolean;
}

export function ProgressAndStatsDisplay({
  isProcessing,
  currentRow,
  totalRows,
  status,
  stats,
  fileManager,
  selectedWordPressSites,
  harnessSections = [],
  harnessPlannedSectionCount = null,
  displayRows,
  phaseLabel,
  hideStats = false,
  compactHarness = false,
  showBulkBarWithHarness = false,
}: ProgressAndStatsDisplayProps) {
  const rowTotal = Math.max(totalRows, 1);
  const activeRow = displayRows?.[currentRow];
  const rowProgressPct =
    rowTotal > 0 ? Math.round(((currentRow + (isProcessing ? 0.5 : 0)) / rowTotal) * 100) : 0;
  const clampedRowPct = Math.min(100, Math.max(0, isProcessing ? rowProgressPct : rowTotal > 0 ? 100 : 0));
  const showBulkBar = isProcessing && rowTotal > 0 && (harnessSections.length === 0 || showBulkBarWithHarness);

  return (
    <>
      {phaseLabel ? (
        <p className="text-base text-foreground">{phaseLabel}</p>
      ) : null}

      {activeRow ? (
        <div className="rounded-lg bg-black/25 px-3 py-3 sm:px-4">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-base font-medium text-muted-foreground">
              Row {currentRow + 1} of {rowTotal}
            </span>
            <span className="text-base font-semibold leading-snug text-foreground">
              {activeRow.title?.trim() || activeRow.keyword?.trim() || "Untitled"}
            </span>
          </div>
          {(activeRow.keyword_focus?.trim() || activeRow.keyword?.trim()) ? (
            <p className="mt-1 text-base text-muted-foreground">
              Keyword: {activeRow.keyword_focus?.trim() || activeRow.keyword?.trim()}
            </p>
          ) : null}
        </div>
      ) : null}

      {showBulkBar && (
        <div className="space-y-2 rounded-lg bg-black/25 p-3 sm:p-4">
          <div className="text-base font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            Bulk progress
          </div>
          <div className="flex items-center justify-between text-base">
            {!activeRow ? (
              <span>
                Row {currentRow + 1} of {rowTotal}
              </span>
            ) : (
              <span className="text-muted-foreground">Harness</span>
            )}
            <span className="max-w-[min(100%,28rem)] break-words text-right text-muted-foreground">
              {status}
            </span>
          </div>
          <div className="neo-pulse-competitor-progress-track">
            <div
              className="neo-pulse-competitor-progress-fill transition-[width] duration-300 ease-out"
              style={{ width: `${clampedRowPct}%` }}
              role="progressbar"
              aria-valuenow={clampedRowPct}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      )}

      {(isProcessing || harnessSections.length > 0) && (
        <BulkHarnessSectionsPanel
          harnessSections={harnessSections}
          harnessPlannedSectionCount={harnessPlannedSectionCount}
          currentRow={currentRow}
          totalRows={rowTotal}
          isProcessing={isProcessing}
          compact={compactHarness}
        />
      )}

      {!hideStats && stats.total > 0 && (
        <div className={cn('flex flex-wrap gap-4 text-base', harnessSections.length > 0 && 'pt-1')}>
          <div>
            <span className="text-muted-foreground">Total Files: </span>
            <span className="font-medium">{stats.total}</span>
          </div>
          <div>
            <span className="text-muted-foreground">Completed: </span>
            <span className="font-medium text-primary">{stats.completed}</span>
          </div>
          {selectedWordPressSites.size > 0 &&
            (() => {
              const allFiles = fileManager.getAllFiles();
              const wordPressFiles = allFiles.filter(
                (f) => f.fileName.startsWith('wordpress-post-') && f.status === 'completed',
              );
              const uploadedCount = wordPressFiles.length;
              const sites = getStoredSites();
              const selectedSites = sites.filter((s) => selectedWordPressSites.has(s.id));
              const siteNames = selectedSites.map((s) => s.name).join(', ');
              return uploadedCount > 0 ? (
                <div>
                  <span className="text-muted-foreground">WordPress: </span>
                  <span className="font-medium text-semantic-publish">
                    ✓ {uploadedCount} POST UPLOADED TO{' '}
                    {selectedSites.length > 1 ? `${selectedSites.length} SITES` : siteNames.toUpperCase()}!
                  </span>
                </div>
              ) : null;
            })()}
          {stats.error > 0 && (
            <div>
              <span className="text-muted-foreground">Errors: </span>
              <span className="font-medium text-ui-danger">{stats.error}</span>
            </div>
          )}
        </div>
      )}
    </>
  );
}
