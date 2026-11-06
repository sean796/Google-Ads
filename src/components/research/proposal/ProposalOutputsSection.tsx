import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, FileText } from "lucide-react";
import { Button, TextButton, Tabs, TabsContent, TabsList, TabsTrigger, Tooltip, TooltipContent, TooltipTrigger } from "@/ui";
import { buildProposalReportMarkdown, downloadLocalAnalysisBulkCsv } from "@/lib/local-analysis-csv-export";
import type { LocalStrategyReportSectionIndex } from "@/lib/local-strategy-research/local-strategy-report-system-prompt";
import type { CSVRow } from "@/lib/bulk/bulk-csv-parser";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_ANALYZE_DONE, NOTIFY_CLIENT_MEETING_SCRIPT_IS_NOT_READY_YET, NOTIFY_COULD_NOT_COPY, NOTIFY_DOWNLOADED_CLIENT_MEETING_SCRIPT_MD, NOTIFY_DOWNLOADED_STRATEGY_MD, NOTIFY_ENTER_A_SEED_SITE_URL_FIRST, NOTIFY_ENTER_A_SEED_SITE_URL_HTTPS_EXAMPLE_COM, NOTIFY_ENTITY_SAP_CSV_IS_NOT_READY_YET, NOTIFY_GENERATE_A_PROPOSAL_FIRST, NOTIFY_GRID_CSV_DOWNLOADED, NOTIFY_GRID_IMPORT_DONE, NOTIFY_LOCAL_ANALYSIS_DID_NOT_RETURN_COMPETITOR, NOTIFY_NO_NEW_COMPETITORS_FROM_GRID, NOTIFY_POSTS_CSV_IS_NOT_READY_YET, NOTIFY_PROPOSAL_COPIED, NOTIFY_PROPOSAL_INCOMPLETE_BLOG_ROWS_SAVED, NOTIFY_PROPOSAL_INCOMPLETE_SAP_AND_BLOG_ROWS_SA, NOTIFY_PROPOSAL_INCOMPLETE_SAP_ROWS_SAVED, NOTIFY_RUN_ANALYZE_FIRST_OR_IMPORT_A_GRID_CSV, NOTIFY_SELECT_AT_LEAST_ONE_COMPETITOR, NOTIFY_SELECT_A_CONNECTED_SITE_WITH_A_URL, NOTIFY_STRATEGY_MARKDOWN_IS_NOT_READY_YET, notifyAddedXCompetitorSFromGridCsv, notifyFileTooLargeMaxXMb, notifyGridCsvSapScanX, notifyGridSkipX, notifyGridXXNoWebsite, notifyGridXXX, notifyGscX2, notifyPresenterTalkScriptFailedX, notifyResearchXX, notifySiteAuditSkippedX, notifySiteAuditSkippedX2, notifyUpdatedXCompetitorSFromGridCsvWer } from "@/lib/notify-messages";
import { LOCAL_STRATEGY_SECTION_INDICES, localStrategySectionLabel, safeDomainForFilename } from "@/components/research/proposal/proposal-research-helpers";

function downloadProposalClientMeetingScript(talkScriptMd: string | null, reportDownloadSlug: string): void {
  const md = talkScriptMd?.trim();
  if (!md) {
    notify.error(NOTIFY_CLIENT_MEETING_SCRIPT_IS_NOT_READY_YET);
    return;
  }
  const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `proposal-client-meeting-script-${reportDownloadSlug}-${Date.now()}.md`;
  a.click();
  URL.revokeObjectURL(url);
  notify.success(NOTIFY_DOWNLOADED_CLIENT_MEETING_SCRIPT_MD);
}

export type ProposalBlueprintSectionsPanelProps = {
  phase: "idle" | "semrush" | "report";
  proposalSubphase: "competitor" | "local" | "sap" | "parallel" | null;
  localPipelineStep: number; combinedMd: string | null; talkScriptMd: string | null;
  localStrategySectionDrafts: Partial<Record<LocalStrategyReportSectionIndex, { markdown: string; requestBodyJson?: string }>>;
  reportDownloadSlug: string;
};

export function ProposalBlueprintSectionsPanel({ phase, proposalSubphase, localPipelineStep, combinedMd, talkScriptMd, localStrategySectionDrafts, reportDownloadSlug }: ProposalBlueprintSectionsPanelProps) {
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

  const downloadClientMeetingScriptOnly = () => downloadProposalClientMeetingScript(talkScriptMd, reportDownloadSlug);

  const showBlueprintSectionsPanel = useMemo(() => {
    const duringLocalBlueprint =
      (phase === "report" && proposalSubphase === "parallel" && localPipelineStep >= 2) ||
      (phase === "report" && proposalSubphase === "local" && localPipelineStep >= 2);
    const afterRunWithMarkdown =
      phase === "idle" && Boolean(combinedMd?.trim() || talkScriptMd?.trim());
    return duringLocalBlueprint || afterRunWithMarkdown;
  }, [phase, proposalSubphase, localPipelineStep, combinedMd, talkScriptMd]);
  return (
    <>
  {showBlueprintSectionsPanel ? (
    <div
      className="mt-2 rounded-md border border-border/50 bg-muted/25 px-2 py-1.5 text-left text-base leading-snug text-muted-foreground"
      aria-label="Local blueprint section drafts from OpenRouter, then client meeting Script"
    >
      <div className="font-semibold text-foreground/90">Blueprint sections</div>
      <ul className="mt-1.5 list-none space-y-1.5 pl-0">
        {LOCAL_STRATEGY_SECTION_INDICES.map((section) => {
          const draft = localStrategySectionDrafts[section];
          const hasMd = Boolean(draft?.markdown?.trim());
          const hasJson = Boolean(draft?.requestBodyJson);
          return (
            <li
              key={section}
              className="flex flex-col gap-1 border-b border-border/40 pb-1.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2"
            >
              <span className="min-w-0 shrink text-base text-foreground/85">
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
        <li className="flex flex-col gap-1 border-b-0 pb-0 pt-0 sm:flex-row sm:flex-wrap sm:items-center sm:gap-2">
          <span className="min-w-0 shrink text-base font-semibold text-foreground/90">Script</span>
          <span className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              disabled={!talkScriptMd?.trim()}
              title={
                talkScriptMd?.trim()
                  ? "Download client meeting script (Markdown)"
                  : "Generated after blueprint sections finish"
              }
              onClick={() => void downloadClientMeetingScriptOnly()}
            >
              <Download className="mr-1 h-3.5 w-3.5 shrink-0" />
              .md
            </Button>
            <span
              className="inline-flex min-h-7 min-w-[5.5rem] items-center text-base font-semibold text-foreground"
              title="No POST JSON for this artifact"
            >
              -
            </span>
          </span>
        </li>
      </ul>
    </div>
  ) : null}
    </>
  );
}

export type ProposalOutputsSectionProps = {
  combinedMd: string | null; lastPostsBulkRows: CSVRow[] | null;
  lastSapScheduleRows: CSVRow[] | null; talkScriptMd: string | null;
  proposalPackageDisabled: boolean; reportDownloadSlug: string;
  onDownloadProposalPackage: () => void; onDownloadEntitySapCsv: () => void;
};

export function ProposalOutputsSection({ combinedMd, lastPostsBulkRows, lastSapScheduleRows, talkScriptMd, proposalPackageDisabled, reportDownloadSlug, onDownloadProposalPackage, onDownloadEntitySapCsv }: ProposalOutputsSectionProps) {
  const downloadProposalPackage = onDownloadProposalPackage;
  const downloadEntitySapCsv = onDownloadEntitySapCsv;
  const downloadStrategyMarkdownOnly = useCallback(() => {
    const md = buildProposalReportMarkdown(combinedMd ?? "").trim();
    if (!md) {
      notify.error(NOTIFY_STRATEGY_MARKDOWN_IS_NOT_READY_YET);
      return;
    }
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proposal-strategy-${reportDownloadSlug}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    notify.success(NOTIFY_DOWNLOADED_STRATEGY_MD);
  }, [combinedMd, reportDownloadSlug]);

  const downloadPostsCsvOnly = useCallback(() => {
    if (!lastPostsBulkRows?.length) {
      notify.error(NOTIFY_POSTS_CSV_IS_NOT_READY_YET);
      return;
    }
    downloadLocalAnalysisBulkCsv(lastPostsBulkRows, `proposal-posts-${reportDownloadSlug}`, { skipNotify: false });
  }, [lastPostsBulkRows, reportDownloadSlug]);

  const downloadClientMeetingScriptOnly = () => downloadProposalClientMeetingScript(talkScriptMd, reportDownloadSlug);

  const blueprintArtifacts = useMemo(() => {
    if (!combinedMd?.trim() && !lastPostsBulkRows?.length && !lastSapScheduleRows?.length) return [];
    return [{ id: "proposal", label: "Proposal", kind: "md" as const }];
  }, [combinedMd, lastPostsBulkRows, lastSapScheduleRows]);

  const [blueprintOutputTab, setBlueprintOutputTab] = useState("0");

  useEffect(() => {
    setBlueprintOutputTab("0");
  }, [blueprintArtifacts.length, combinedMd, lastPostsBulkRows, lastSapScheduleRows]);
  return (
    <>
  {combinedMd?.trim() || lastPostsBulkRows?.length || lastSapScheduleRows?.length ? (
    <div className="neo-pulse-zone-tile--analysis mt-2 space-y-2 px-2 py-2 sm:px-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="min-h-[1rem] text-base font-semibold uppercase leading-normal tracking-wide text-muted-foreground">
            Outputs
          </div>
          <p className="mt-1 max-w-prose text-base leading-snug text-muted-foreground">
            Strategy package plus a separate client meeting script (glossary, talking points, and key bullets per
            section) for the specialist.
          </p>
        </div>
        <Button
          type="button"
          title="Download strategy .md, CSVs when present, and client meeting script when generated"
          disabled={proposalPackageDisabled}
          onClick={downloadProposalPackage}
        >
          <FileText className="mr-1 h-3 w-3 shrink-0" />
          Full package
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border border-border/50 bg-muted/25">
        <table className="w-full min-w-[420px] border-collapse text-left text-base">
          <thead>
            <tr className="border-b border-border/50 bg-black/20">
              <th className="px-2 py-1.5 font-semibold text-foreground">Section ID</th>
              <th className="px-2 py-1.5 font-semibold text-foreground">Contents</th>
              <th className="px-2 py-1.5 font-semibold text-foreground">Download</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border/40">
              <td className="max-w-[140px] break-words px-2 py-1.5 text-foreground" title="proposal-strategy">
                proposal-strategy
              </td>
              <td className="max-w-[min(40vw,320px)] px-2 py-1.5 text-foreground">Written strategy (.md)</td>
              <td className="whitespace-nowrap px-2 py-1.5">
                <Button
                  type="button"
                  title="Strategy Markdown only"
                  disabled={!combinedMd?.trim()}
                  onClick={downloadStrategyMarkdownOnly}
                >
                  <Download className="mr-1 h-3 w-3 shrink-0" />
                  .md
                </Button>
              </td>
            </tr>
            <tr className="border-b border-border/40">
              <td className="max-w-[140px] break-words px-2 py-1.5 text-foreground" title="proposal-posts">
                proposal-posts
              </td>
              <td className="max-w-[min(40vw,320px)] px-2 py-1.5 text-foreground">Content posts (CSV)</td>
              <td className="whitespace-nowrap px-2 py-1.5">
                <Button
                  type="button"
                  disabled={!lastPostsBulkRows?.length}
                  onClick={downloadPostsCsvOnly}
                >
                  <Download className="mr-1 h-3 w-3 shrink-0" />
                  CSV
                </Button>
              </td>
            </tr>
            <tr
              className={
                talkScriptMd?.trim()
                  ? "border-b border-border/40"
                  : "border-b border-border/40 last:border-b-0"
              }
            >
              <td className="max-w-[140px] break-words px-2 py-1.5 text-foreground" title="proposal-sap">
                proposal-sap
              </td>
              <td className="max-w-[min(40vw,320px)] px-2 py-1.5 text-foreground">Entity SAP schedule (CSV)</td>
              <td className="whitespace-nowrap px-2 py-1.5">
                <Button
                  type="button"
                  disabled={!lastSapScheduleRows?.length}
                  onClick={downloadEntitySapCsv}
                >
                  <Download className="mr-1 h-3 w-3 shrink-0" />
                  CSV
                </Button>
              </td>
            </tr>
            {talkScriptMd?.trim() ? (
              <tr className="border-b border-border/40 last:border-b-0">
                <td
                  className="max-w-[140px] break-words px-2 py-1.5 text-foreground"
                  title="proposal-client-meeting-script"
                >
                  proposal-client-meeting-script
                </td>
                <td className="max-w-[min(40vw,320px)] px-2 py-1.5 text-foreground">
                  Client meeting script for specialist (.md)
                </td>
                <td className="whitespace-nowrap px-2 py-1.5">
                  <Button
                    type="button"
                    title="Plain language, glossary, talking points, key bullets per section"
                    onClick={downloadClientMeetingScriptOnly}
                  >
                    <Download className="mr-1 h-3 w-3 shrink-0" />
                    .md
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
        Outputs
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
                    aria-label={`Proposal: ${a.label}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      downloadProposalPackage();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        e.stopPropagation();
                        downloadProposalPackage();
                      }
                    }}
                  >
                    <FileText className="h-3.5 w-3.5" aria-hidden />
                  </span>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-xs text-base">
                  Download package
                </TooltipContent>
              </Tooltip>
            </TabsTrigger>
          ))}
        </TabsList>
        {blueprintArtifacts.map((a, i) => (
          <TabsContent key={a.id} value={String(i)} className="mt-0 min-h-0 data-[state=inactive]:hidden" />
        ))}
      </Tabs>
    </div>
  ) : null}

  {combinedMd?.trim() ? (
  <div className="neo-pulse-zone-tile--analysis mt-2 space-y-2 px-2 py-2 sm:px-3">
    <div className="min-h-[1rem] text-base font-semibold uppercase leading-normal tracking-wide text-muted-foreground">
      Proposal preview
    </div>
    <div className="h-[min(50vh,28rem)] min-h-0 min-w-0 overflow-y-auto overflow-x-auto rounded-md border border-border/50 bg-black/20">
      <pre className="whitespace-pre-wrap break-words p-3 text-base leading-relaxed text-foreground">
        {combinedMd}
      </pre>
    </div>
  </div>
) : null}
    </>
  );
}
