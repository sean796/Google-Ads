import { useCallback, useEffect, useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button, TextButton, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip, TooltipContent, TooltipTrigger } from "@/ui";
import { downloadLocalAnalysisBulkCsv } from "@/lib/local-analysis-csv-export";
import type { LocalStrategyReportSectionIndex } from "@/lib/local-strategy-research/local-strategy-report-system-prompt";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ANALYZE_DONE, NOTIFY_COULD_NOT_COPY, NOTIFY_ENTER_A_SEED_SITE_URL_FIRST, NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM, NOTIFY_ENTITY_SAP_CSV_READY, NOTIFY_GENERATE_A_REPORT_FIRST, NOTIFY_GRID_CSV_DOWNLOADED, NOTIFY_GRID_IMPORT_DONE, NOTIFY_LOCAL_BLUEPRINT_READY, NOTIFY_MARKDOWN_COPIED, NOTIFY_NO_NEW_COMPETITORS_FROM_GRID, NOTIFY_NO_SAP_SCHEDULE_CSV_YET, NOTIFY_RUN_ANALYZE_FIRST, NOTIFY_RUN_ANALYZE_FIRST_OR_IMPORT_A_GRID_CSV, NOTIFY_SAP_CSV_SKIPPED, NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR, NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL, notifyAddedXCompetitorSFromGridCsv, notifyAddedXCompetitorSFromGridCsvUpdat, notifyDataforseoXX, notifyDfsSkipX, notifyDfsXXNoWebsite, notifyDfsXXX, notifyDownloadedXSapRowS, notifyFileTooLargeMaxXMb, notifyGridCsvSapScanX, notifyGscX2, notifyUpdatedXCompetitorSFromGridCsvWer } from "@/lib/notify-messages";
import { LOCAL_STRATEGY_SECTION_INDICES, localStrategySectionLabel, safeDomainForFilename } from "@/components/research/local/use-local-strategy-grid-csv-import";

export type LocalStrategyBlueprintSectionsPanelProps = {
  phase: "idle" | "semrush" | "report"; reportPipelineStep: number;
  localStrategySectionDrafts: Partial<Record<LocalStrategyReportSectionIndex, { markdown: string; requestBodyJson?: string }>>;
  reportDownloadSlug: string;
};

export function LocalStrategyBlueprintSectionsPanel({ phase, reportPipelineStep, localStrategySectionDrafts, reportDownloadSlug }: LocalStrategyBlueprintSectionsPanelProps) {
  const downloadLocalStrategySectionMarkdown = useCallback(
    (section: LocalStrategyReportSectionIndex) => {
      const md = localStrategySectionDrafts[section]?.markdown?.trim();
      if (!md) return;
      const slug = safeDomainForFilename(reportDownloadSlug || "report");
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `local-strategy-blueprint-section-${section}-${slug}-${Date.now()}.md`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [localStrategySectionDrafts, reportDownloadSlug],
  );

  const downloadLocalStrategySectionPostJson = useCallback(
    (section: LocalStrategyReportSectionIndex) => {
      const raw = localStrategySectionDrafts[section]?.requestBodyJson;
      if (!raw) return;
      const blob = new Blob([raw], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `openrouter-local-strategy-section-${section}-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    [localStrategySectionDrafts],
  );
  return (
    <>
  {phase === "report" && reportPipelineStep >= 2 ? (
    <div
      className="mt-2 rounded-md border border-border/50 bg-muted/25 px-2 py-1.5 text-left text-base leading-snug text-muted-foreground"
      aria-label="Local blueprint section drafts from OpenRouter (11 sequential passes)"
    >
      <div className="font-mono font-semibold text-foreground/90">Blueprint sections</div>
      <p className="mt-0.5 max-w-prose text-base leading-snug text-foreground">
        Eleven sequential writer passes; each row enables .md and POST .json when that section returns.
      </p>
      <ul className="mt-1.5 list-none space-y-1.5 pl-0">
        {LOCAL_STRATEGY_SECTION_INDICES.map((section) => {
          const draft = localStrategySectionDrafts[section];
          const hasMd = Boolean(draft?.markdown?.trim());
          const hasJson = Boolean(draft?.requestBodyJson);
          return (
            <li
              key={section}
              className="flex flex-col gap-1 border-b border-border/40 pb-1.5 last:border-b-0 last:pb-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"
            >
              <span className="min-w-0 shrink font-mono text-base text-foreground/85">
                <span className="text-muted-foreground">S{section}</span> {localStrategySectionLabel(section)}
              </span>
              <span className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  disabled={!hasMd}
                  title={hasMd ? "Download this section as Markdown" : "Waiting for this section…"}
                  onClick={() => downloadLocalStrategySectionMarkdown(section)}
                >
                  <Download className="mr-1 h-3.5 w-3.5 shrink-0" />
                  .md
                </Button>
                <TextButton
                  type="button"
                  disabled={!hasJson}
                  title={hasJson ? "Download exact OpenRouter POST JSON for this section" : "Payload not ready yet"}
                  onClick={() => downloadLocalStrategySectionPostJson(section)}
                >
                  POST .json
                </TextButton>
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  ) : null}
    </>
  );
}

export type LocalStrategyOutputsSectionProps = {
  reportMd: string | null; lastSapScheduleRows: CSVRow[] | null;
  onDownloadReport: () => void;
};

export function LocalStrategyOutputsSection({ reportMd, lastSapScheduleRows, onDownloadReport }: LocalStrategyOutputsSectionProps) {
  const downloadReport = onDownloadReport;
  const downloadSapScheduleArtifact = useCallback(() => {
    if (!lastSapScheduleRows?.length) {
      notify.error(NOTIFY_NO_SAP_SCHEDULE_CSV_YET);
      return;
    }
    downloadLocalAnalysisBulkCsv(lastSapScheduleRows, "local-strategy-sap-schedule-3mo-15pm", { skipNotify: true });
    notify.success(notifyDownloadedXSapRowS(lastSapScheduleRows.length));
  }, [lastSapScheduleRows]);

  const blueprintArtifacts = useMemo(() => {
    const o: { id: string; label: string; kind: "md" | "csv" }[] = [];
    if (reportMd?.trim()) o.push({ id: "blueprint", label: "Local blueprint", kind: "md" });
    if (lastSapScheduleRows?.length) o.push({ id: "sap", label: "SAP schedule (3 mo)", kind: "csv" });
    return o;
  }, [reportMd, lastSapScheduleRows]);

  const [blueprintOutputTab, setBlueprintOutputTab] = useState("0");

  useEffect(() => {
    setBlueprintOutputTab("0");
  }, [blueprintArtifacts.length, reportMd, lastSapScheduleRows]);
  return (
    <>
  {reportMd?.trim() || lastSapScheduleRows?.length ? (
    <div className="neo-pulse-zone-tile--analysis mt-2 space-y-2 px-2 py-2 sm:px-3">
      <div className="min-h-[1rem] text-base font-semibold uppercase leading-normal tracking-wide text-muted-foreground">
        Report sections (inventory)
      </div>
      <div className="overflow-x-auto rounded-md border border-border/50 bg-muted/25">
        <table className="w-full min-w-[420px] border-collapse text-left text-base">
          <thead>
            <tr className="border-b border-border/50 bg-black/20">
              <th className="px-2 py-1.5 font-semibold text-foreground">Section ID</th>
              <th className="px-2 py-1.5 font-semibold text-foreground">H2 title</th>
              <th className="px-2 py-1.5 font-semibold text-foreground">Actions</th>
            </tr>
          </thead>
          <tbody>
            {reportMd?.trim() ? (
              <tr className="border-b border-border/40 last:border-b-0">
                <td className="max-w-[140px] break-words px-2 py-1.5 font-mono text-foreground" title="local-blueprint">
                  local-blueprint
                </td>
                <td className="max-w-[min(40vw,280px)] px-2 py-1.5 text-foreground">Local SEO blueprint</td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  <Button
                    type="button"
                    title="Download blueprint Markdown"
                    onClick={downloadReport}
                  >
                    <Download className="mr-1 h-3 w-3 shrink-0" />
                    .md
                  </Button>
                </td>
              </tr>
            ) : null}
            {lastSapScheduleRows?.length ? (
              <tr className="border-b border-border/40 last:border-b-0">
                <td className="max-w-[140px] break-words px-2 py-1.5 font-mono text-foreground" title="sap-schedule">
                  sap-schedule
                </td>
                <td className="max-w-[min(40vw,280px)] px-2 py-1.5 text-foreground">
                  SAP entity schedule (3 months, 45 rows)
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  <Button
                    type="button"
                    title="Download SAP schedule CSV"
                    onClick={downloadSapScheduleArtifact}
                  >
                    <Download className="mr-1 h-3 w-3 shrink-0" />
                    .csv
                  </Button>
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  ) : null}

  {blueprintArtifacts.length > 0 ? (
    <div className="neo-pulse-zone-tile--analysis mt-2 space-y-3 px-2 py-2 sm:px-3">
      <div className="min-h-[1rem] text-base font-semibold uppercase leading-normal tracking-wide text-muted-foreground">
        Blueprint outputs
      </div>
      <Tabs value={blueprintOutputTab} onValueChange={setBlueprintOutputTab} className="flex min-h-0 flex-col gap-2">
        <TabsList className="inline-flex h-auto min-h-9 w-full flex-wrap justify-start gap-1 rounded-md border border-[hsl(var(--semantic-analysis)/0.48)] bg-black/30 p-0.5">
          {blueprintArtifacts.map((a, i) => (
            <TabsTrigger
              key={a.id}
              value={String(i)}
              className="inline-flex max-w-[min(100%,18rem)] shrink-0 items-center gap-1.5 px-2 py-1.5 text-left text-base font-semibold normal-case leading-snug tracking-normal data-[state=active]:rounded-sm data-[state=active]:bg-[hsl(var(--semantic-analysis)/0.18)] data-[state=active]:text-primary"
            >
              <span className="min-w-0 break-words" title={a.label}>
                {a.label}
              </span>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span
                    className="inline-flex shrink-0 cursor-pointer rounded-sm p-0.5 text-muted-foreground hover:bg-black/40 hover:text-primary"
                    role="button"
                    tabIndex={0}
                    aria-label={`Download ${a.label}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (a.kind === "md") downloadReport();
                      else downloadSapScheduleArtifact();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        if (a.kind === "md") downloadReport();
                        else downloadSapScheduleArtifact();
                      }
                    }}
                  >
                    <Download className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-base">
                  Download {a.label}
                </TooltipContent>
              </Tooltip>
            </TabsTrigger>
          ))}
        </TabsList>
        {blueprintArtifacts.map((a, i) => (
          <TabsContent key={a.id} value={String(i)} className="mt-0 min-h-0 data-[state=inactive]:hidden">
            <p className="text-base leading-normal text-muted-foreground">Preview below.</p>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  ) : null}

  {reportMd?.trim() ? (
    <div className="neo-pulse-zone-tile--analysis mt-2 space-y-2 px-2 py-2 sm:px-3">
      <div className="min-h-[1rem] text-base font-semibold uppercase leading-normal tracking-wide text-muted-foreground">
        Stitched report preview
      </div>
      <div className="h-[min(50vh,28rem)] min-h-0 min-w-0 overflow-y-auto overflow-x-auto rounded-md border border-border/50 bg-black/20">
        <pre className="whitespace-pre-wrap break-words p-3 font-mono text-base leading-relaxed text-foreground">
          {reportMd}
        </pre>
      </div>
    </div>
  ) : null}
    </>
  );
}
