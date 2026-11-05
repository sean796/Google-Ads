import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useManagerSeedWorkspace } from "@/contexts/manager-seed-workspace-context";
import { useUrlOptimizerRun } from "@/hooks/research/use-url-optimizer-run";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_SELECT_SITE_URL, NOTIFY_UPLOAD_A_GSC_PAGES_CSV_FIRST } from "@/lib/notify-messages";
import { parseUrlOptimizerInputCsv } from "@/lib/url-optimizer/parse-url-optimizer-input-csv";
import type { UrlOptimizerInputRow } from "@/lib/url-optimizer/types";
import { buildUrlOptimizerExportCsv } from "@/lib/url-optimizer/url-optimizer-export-csv";
import { buildUrlOptimizerMicroSnapshot } from "@/lib/url-optimizer/url-optimizer-header-progress";
import type { SitemapUrlOptimizerWorkspaceBindings } from "@/components/research/sitemap-optimizer/sitemap-url-optimizer-workspace-bindings";
import { WorkspaceEmptyRowStripes } from "@/components/shared/WorkspaceEmptyRowStripes";
import { cn } from "@/lib/utils";
import { FileInput } from "@/ui";

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export type SitemapUrlOptimizerPanelProps = {
  urlOptimizerWorkspace?: boolean;
  onUrlOptimizerWorkspaceBindings?: (bindings: SitemapUrlOptimizerWorkspaceBindings) => void;
};

export function SitemapUrlOptimizerPanel({
  urlOptimizerWorkspace = false,
  onUrlOptimizerWorkspaceBindings,
}: SitemapUrlOptimizerPanelProps) {
  const { connectedSite: site } = useManagerSeedWorkspace();
  const { progress, result, error, running, run, cancel } = useUrlOptimizerRun();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvUpload, setCsvUpload] = useState<UrlOptimizerInputRow[] | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleGscFile = useCallback(async (file: File) => {
    const text = await file.text();
    const parsed = parseUrlOptimizerInputCsv(text);
    if (parsed.error || !parsed.rows.length) {
      notify.error(parsed.error ?? "No page rows in GSC CSV.", { duration: 12000 });
      setCsvUpload(null);
      setFileName(null);
      return;
    }
    setCsvUpload(parsed.rows);
    setFileName(file.name);
  }, []);

  const handleRun = useCallback(async () => {
    if (!site) {
      notify.error(NOTIFY_SELECT_SITE_URL);
      return;
    }
    if (!csvUpload?.length) {
      notify.error(NOTIFY_UPLOAD_A_GSC_PAGES_CSV_FIRST);
      return;
    }
    await run({ site, inputRows: csvUpload });
  }, [site, csvUpload, run]);

  const handleDownload = useCallback(() => {
    if (!result?.rows.length) return;
    const csv = buildUrlOptimizerExportCsv(result.rows);
    triggerDownload("url-optimizer-export.csv", csv, "text/csv;charset=utf-8");
  }, [result]);

  const handleClearCsv = useCallback(() => {
    setCsvUpload(null);
    setFileName(null);
  }, []);

  const canOpenDetails = useMemo(
    () =>
      running ||
      Boolean(fileName) ||
      Boolean(error) ||
      Boolean(result) ||
      Boolean(site),
    [running, fileName, error, result, site],
  );

  const progressSnapshot = useMemo(
    () => buildUrlOptimizerMicroSnapshot(progress, running),
    [progress, running],
  );

  const bindings = useMemo<SitemapUrlOptimizerWorkspaceBindings>(
    () => ({
      running,
      progressSnapshot,
      canOpenDetails,
      onUploadClick: () => fileInputRef.current?.click(),
      toolbarProps: {
        running,
        hasSite: Boolean(site),
        hasCsv: Boolean(csvUpload?.length),
        fileName,
        rowCount: csvUpload?.length ?? 0,
        hasResult: Boolean(result?.rows.length),
        resultRowCount: result?.rows.length ?? 0,
        onUploadClick: () => fileInputRef.current?.click(),
        onClearCsv: handleClearCsv,
        onOptimize: () => void handleRun(),
        onCancel: cancel,
        onDownload: handleDownload,
      },
      detailsProps: {
        running,
        progress,
        siteName: site?.name ?? null,
        fileName,
        rowCount: csvUpload?.length ?? 0,
        error,
        result,
      },
    }),
    [
      running,
      progressSnapshot,
      canOpenDetails,
      site,
      csvUpload,
      fileName,
      result,
      progress,
      error,
      handleClearCsv,
      handleRun,
      cancel,
      handleDownload,
    ],
  );

  useEffect(() => {
    if (!urlOptimizerWorkspace || !onUrlOptimizerWorkspaceBindings) return;
    onUrlOptimizerWorkspaceBindings(bindings);
  }, [urlOptimizerWorkspace, onUrlOptimizerWorkspaceBindings, bindings]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <FileInput
        ref={fileInputRef}
        accept=".csv,text/csv"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void handleGscFile(file);
          e.target.value = "";
        }}
      />

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-4 pb-3">
        {!site ? (
          <p className="text-base text-muted-foreground">{NOTIFY_SELECT_SITE_URL}</p>
        ) : result ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-auto rounded-md border border-border">
              <table className="w-full min-w-[960px] text-left text-base">
                <thead className="sticky top-0 bg-muted/80 uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-base font-medium">Old URL</th>
                    <th className="px-3 py-2 text-base font-medium">New URL</th>
                    <th className="px-3 py-2 text-base font-medium">Keyword</th>
                    <th className="px-3 py-2 text-right text-base font-medium">Impr.</th>
                    <th className="px-3 py-2 text-right text-base font-medium">Pos.</th>
                    <th className="px-3 py-2 text-base font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {result.rows.map((row) => (
                    <tr
                      key={row.page}
                      className={cn(
                        "border-t border-border/60",
                        row.status === "optimized" && "bg-primary/5",
                        row.status === "unresolved" && "bg-destructive/5",
                      )}
                    >
                      <td className="max-w-xs break-words px-3 py-2" title={row.page}>
                        {row.page}
                      </td>
                      <td className="max-w-xs break-words px-3 py-2" title={row.proposedUrl ?? ""}>
                        {row.proposedUrl ?? "—"}
                      </td>
                      <td className="max-w-[10rem] break-words px-3 py-2" title={row.proposedKeyword ?? ""}>
                        {row.proposedKeyword ?? "—"}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.impressions}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{row.position.toFixed(1)}</td>
                      <td className="px-3 py-2 capitalize">{row.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <WorkspaceEmptyRowStripes />
        )}
      </div>
    </div>
  );
}
