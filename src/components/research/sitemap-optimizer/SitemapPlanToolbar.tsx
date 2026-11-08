import { useRef } from "react";
import { CheckCircle2, Copy, Download, Square, Upload, X } from "lucide-react";
import { Button, FileInput } from "@/ui";
import type { SitemapOptimizerCollectionOption } from "@/lib/sitemap-optimizer/collection-options";
import {
  SITEMAP_OPTIMIZER_REDIRECT_MAP_TEMPLATE_LABEL,
  SITEMAP_OPTIMIZER_UPLOAD_GSC_CSV_LABEL,
  SITEMAP_OPTIMIZER_UPLOAD_RANK_MATH_LABEL,
  sitemapOptimizerAnalyzeButtonLabel,
} from "@/lib/sitemap-optimizer/sitemap-optimizer-toolbar-copy";
import type { SitemapOptimizerCollectionKey } from "@/lib/sitemap-optimizer/types";

export type SitemapPlanToolbarProps = {
  busy: boolean;
  workspaceBusy: boolean;
  showToolbarOptions: boolean;
  showSetupToolbar: boolean;
  showResultToolbar: boolean;
  showAnalyzeAction: boolean;
  showGscCsvUpload: boolean;
  showRedirectCsvUpload: boolean;
  inPublishWorkspace: boolean;
  isGridHarness: boolean;
  isGridFlow: boolean;
  isRedirectMapHarness: boolean;
  hasResult: boolean;
  siteReady: boolean;
  workspaceMode: string;
  siteConnected: boolean;
  approving: boolean;
  rankMathImportRunning: boolean;
  mergeGroupCount: number;
  collectionOptions: SitemapOptimizerCollectionOption[];
  selected: Set<SitemapOptimizerCollectionKey>;
  selectCollection: (key: SitemapOptimizerCollectionKey) => void;
  gscFileName: string | null;
  gscUploadRowCount: number | null | undefined;
  resultRowCount: number;
  resultContentSheetCount: number;
  onDownloadRedirectMapTemplate: () => void;
  onGscFile: (file: File) => void | Promise<void>;
  onRedirectCsvFile: (file: File) => void | Promise<void>;
  onClearGscUpload: () => void;
  onAnalyze: () => void | Promise<void>;
  onCancel: () => void;
  onBackToMergePlan: () => void;
  onApprovePlan: () => void;
  onDownloadRedirects: () => void;
  onExportContentSheetCsv: () => void;
  onCopyReport: () => void | Promise<void>;
};

export function SitemapPlanToolbar(props: SitemapPlanToolbarProps) {
  const rankMathFileRef = useRef<HTMLInputElement>(null);
  const gscFileRef = useRef<HTMLInputElement>(null);
  const analyzeLabel = sitemapOptimizerAnalyzeButtonLabel({
    isGridHarness: props.isGridHarness,
    hasResult: props.hasResult,
  });

  return (
    <>
      <FileInput
        ref={gscFileRef}
                accept=".csv,text/csv"
        disabled={props.busy}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void props.onGscFile(file);
          e.target.value = "";
        }}
      />
      <FileInput
        ref={rankMathFileRef}
                accept=".csv,text/csv"
        disabled={props.busy || props.workspaceMode === "temp" || !props.siteConnected}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void props.onRedirectCsvFile(file);
          e.target.value = "";
        }}
      />
      {props.showToolbarOptions ? (
        <>
          {props.showGscCsvUpload ? (
            <Button
              variant="tool"
              icon={Upload}
              disabled={props.busy}
              aria-label="Upload GSC CSV"
              title="Upload GSC CSV"
              onClick={() => gscFileRef.current?.click()}
            >
              {SITEMAP_OPTIMIZER_UPLOAD_GSC_CSV_LABEL}
            </Button>
          ) : null}
          {props.showRedirectCsvUpload ? (
            <Button
              variant="tool"
              icon={Upload}
              disabled={props.busy || props.rankMathImportRunning}
              aria-label="Upload NEO Pulse redirect plan"
              title="Upload NEO Pulse redirect plan"
              onClick={() => rankMathFileRef.current?.click()}
            >
              {SITEMAP_OPTIMIZER_UPLOAD_RANK_MATH_LABEL}
            </Button>
          ) : null}
          {!props.busy && !props.inPublishWorkspace ? (
            <Button
              variant="tool"
              title="Download redirect map template"
              onClick={props.onDownloadRedirectMapTemplate}
            >
              {SITEMAP_OPTIMIZER_REDIRECT_MAP_TEMPLATE_LABEL}
            </Button>
          ) : null}
          {props.showAnalyzeAction ? (
            <Button
              variant="tool"
              disabled={
                props.isGridHarness
                  ? !props.gscUploadRowCount
                  : props.workspaceMode === "temp" || !props.siteConnected
              }
              aria-label={props.isGridHarness ? "Analyze grid" : analyzeLabel}
              onClick={() => void props.onAnalyze()}
            >
              {analyzeLabel}
            </Button>
          ) : null}
        </>
      ) : null}
      {props.showSetupToolbar && props.gscFileName ? (
        <span className="shrink-0 whitespace-nowrap text-base text-muted-foreground">
          {props.gscFileName} ({props.gscUploadRowCount ?? 0} rows
          {props.isRedirectMapHarness ? " Â· redirect map" : ""})
        </span>
      ) : null}
      {props.showSetupToolbar && props.gscUploadRowCount ? (
        <Button
          variant="tool"
          size="icon"
          icon={X}
          disabled={props.busy}
          aria-label="Clear uploaded file"
          title="Clear uploaded file"
          onClick={props.onClearGscUpload}
        />
      ) : null}
      <Button
        variant="danger"
        size="icon"
        icon={Square}
        reserved={!props.busy}
        aria-label="Cancel"
        title="Cancel"
        onClick={props.onCancel}
      />
      {props.inPublishWorkspace && !props.busy ? (
        <Button variant="tool" onClick={props.onBackToMergePlan}>
          Back to merge plan
        </Button>
      ) : null}
      {props.showResultToolbar && !props.isGridFlow && props.mergeGroupCount > 0 && props.siteReady ? (
        <Button
          variant="run"
          icon={CheckCircle2}
          disabled={props.approving}
          aria-label="Approve plan"
          title="Approve plan"
          onClick={props.onApprovePlan}
        >
          Plan
        </Button>
      ) : null}
      {props.showResultToolbar ? (
        <>
          {props.resultRowCount > 0 ? (
            <Button
              variant="tool"
              icon={Download}
              disabled={props.approving}
              aria-label="Download redirects"
              title="Download redirects"
              onClick={props.onDownloadRedirects}
            >
              Redirects
            </Button>
          ) : null}
          {props.resultContentSheetCount > 0 ? (
            <Button
              variant="tool"
              disabled={props.approving}
              aria-label="Export content sheet"
              title="Export content sheet"
              onClick={props.onExportContentSheetCsv}
            >
              Content sheet
            </Button>
          ) : null}
        </>
      ) : null}
      {props.showResultToolbar && !props.isGridFlow ? (
        <Button
          variant="tool"
          icon={Copy}
          aria-label="Copy report"
          title="Copy report"
          onClick={() => void props.onCopyReport()}
        >
          Report
        </Button>
      ) : null}
    </>
  );
}
