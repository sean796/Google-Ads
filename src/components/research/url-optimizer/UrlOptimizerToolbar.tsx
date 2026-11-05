import { Download, Sparkles, Square, Upload, X } from "lucide-react";
import { Button, FilterRow, FilterRowDivider } from "@/ui";

export type UrlOptimizerToolbarProps = {
  running: boolean;
  hasSite: boolean;
  hasCsv: boolean;
  fileName: string | null;
  rowCount: number;
  hasResult: boolean;
  resultRowCount: number;
  onUploadClick: () => void;
  onClearCsv: () => void;
  onOptimize: () => void;
  onCancel: () => void;
  onDownload: () => void;
};

export function UrlOptimizerToolbar({
  running,
  hasSite,
  hasCsv,
  fileName,
  rowCount,
  hasResult,
  resultRowCount,
  onUploadClick,
  onClearCsv,
  onOptimize,
  onCancel,
  onDownload,
}: UrlOptimizerToolbarProps) {
  return (
    <>
      <FilterRow aria-label="GSC CSV">
        <Button
          variant="tool"
          icon={Upload}
          disabled={running}
          aria-label="Upload GSC CSV"
          title="Upload GSC CSV"
          onClick={onUploadClick}
        >
          GSC CSV
        </Button>
        {fileName ? (
          <span className="whitespace-nowrap text-base text-muted-foreground" title={fileName}>
            {fileName} ({rowCount})
          </span>
        ) : null}
        <Button
          variant="tool"
          size="icon"
          icon={X}
          reserved={!hasCsv}
          disabled={running}
          aria-label="Clear uploaded CSV"
          title="Clear uploaded CSV"
          onClick={onClearCsv}
        />
      </FilterRow>

      <FilterRowDivider />
      <Button
        variant="tool"
        icon={Download}
        reserved={!hasResult}
        disabled={running}
        aria-label={`Download results (${resultRowCount})`}
        title={`Download results (${resultRowCount})`}
        onClick={onDownload}
      >
        ({resultRowCount})
      </Button>

      <FilterRow align="end" aria-label="Optimize URLs">
        <Button
          variant="danger"
          size="icon"
          icon={Square}
          reserved={!running}
          aria-label="Cancel"
          title="Cancel"
          onClick={onCancel}
        />
        <Button
          variant="run"
          size="icon"
          icon={Sparkles}
          disabled={running || !hasSite || !hasCsv}
          aria-label="Optimize URLs"
          title="Optimize URLs"
          onClick={onOptimize}
        />
      </FilterRow>
    </>
  );
}
