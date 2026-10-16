import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Play, Undo2 } from "lucide-react";
import { useWordPressSites } from "@/hooks/use-wordpress-sites";
import { useActiveWordPressSite } from "@/contexts/active-wordpress-site-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  BULK_HEADER_FIELD,
  BULK_HEADER_RUN_BTN,
  BULK_HEADER_TOOL_BTN,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type { MetaBulkMicroSnapshot } from "@/components/overview/OverviewBulkMicroProgress";
import {
  NeoEmcpWorkspaceHeader,
  type NeoEmcpModeId,
} from "@/components/neo-emcp/NeoEmcpWorkspaceHeader";
import { NeoEmcpAuditPanel } from "@/components/neo-emcp/NeoEmcpAuditPanel";
import { NeoEmcpToolCatalogPanel } from "@/components/neo-emcp/NeoEmcpToolCatalogPanel";
import {
  executeEmcpTool,
  fetchEmcpSiteCatalog,
  type EmcpAuditFinding,
  type EmcpAuditReport,
  type EmcpBatchStepResult,
  type EmcpHistoryEntry,
  type EmcpSiteCatalog,
  type EmcpSiteCredentials,
} from "@/lib/emcp/neo-emcp-api";
import type { EmcpPlannedStep } from "@/lib/emcp/neo-emcp-mastra-agents";
import {
  neoEmcpAuditAndFixWorkflow,
  neoEmcpCommandWorkflow,
} from "@/lib/emcp/neo-emcp-mastra-workflows";

export interface NeoEmcpTabContentProps {
  apiKey?: string;
}

export const NeoEmcpTabContent: React.FC<NeoEmcpTabContentProps> = ({ apiKey }) => {
  const { sites } = useWordPressSites();
  const { activeWordPressSiteId, setActiveWordPressSiteId } = useActiveWordPressSite();

  const enabledSites = useMemo(
    () => sites.filter((s) => s.enabled !== false),
    [sites],
  );

  const [selectedSiteId, setSelectedSiteId] = useState<string>(() => {
    if (activeWordPressSiteId && enabledSites.some((s) => s.id === activeWordPressSiteId)) {
      return activeWordPressSiteId;
    }
    return enabledSites[0]?.id ?? "__custom__";
  });

  const [customSiteUrl, setCustomSiteUrl] = useState<string>("https://blindswebsitet.wpenginepowered.com");
  const [customUsername, setCustomUsername] = useState<string>("sean@neodigital.ca");
  const [customAppPassword, setCustomAppPassword] = useState<string>("");

  const [mode, setMode] = useState<NeoEmcpModeId>("command");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dryRunOnly, setDryRunOnly] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("Ready");
  const [stepLogs, setStepLogs] = useState<string[]>([]);

  const [catalog, setCatalog] = useState<EmcpSiteCatalog | null>(null);
  const [findings, setFindings] = useState<EmcpAuditFinding[]>([]);
  const [businessDetails, setBusinessDetails] = useState<Record<string, unknown> | null>(null);
  const [locations, setLocations] = useState<Array<Record<string, unknown>>>([]);
  const [planSummary, setPlanSummary] = useState<string>("");
  const [plannedSteps, setPlannedSteps] = useState<EmcpPlannedStep[]>([]);
  const [dryRunResults, setDryRunResults] = useState<EmcpBatchStepResult[]>([]);
  const [committedResults, setCommittedResults] = useState<EmcpBatchStepResult[]>([]);
  const [historyEntries, setHistoryEntries] = useState<EmcpHistoryEntry[]>([]);
  const [lastManualResult, setLastManualResult] = useState<unknown>(null);

  const [commandPrompt, setCommandPrompt] = useState<string>("");
  const [commandResults, setCommandResults] = useState<EmcpBatchStepResult[]>([]);

  useEffect(() => {
    if (selectedSiteId !== "__custom__") {
      setActiveWordPressSiteId(selectedSiteId);
    }
  }, [selectedSiteId, setActiveWordPressSiteId]);

  const resolveCreds = useCallback((): EmcpSiteCredentials | null => {
    if (selectedSiteId === "__custom__") {
      if (!customSiteUrl.trim() || !customUsername.trim() || !customAppPassword.trim()) {
        return null;
      }
      return {
        siteUrl: customSiteUrl.trim(),
        username: customUsername.trim(),
        appPassword: customAppPassword.trim(),
      };
    }
    const site = enabledSites.find((s) => s.id === selectedSiteId);
    if (!site || !site.siteUrl || !site.username || !site.appPassword) {
      return null;
    }
    return {
      siteUrl: site.siteUrl,
      username: site.username,
      appPassword: site.appPassword,
    };
  }, [selectedSiteId, customSiteUrl, customUsername, customAppPassword, enabledSites]);

  const appendLog = useCallback((line: string) => {
    setStepLogs((prev) => [...prev.slice(-49), line]);
    setStatusMessage(line);
  }, []);

  const handleSyncCatalog = useCallback(async () => {
    const creds = resolveCreds();
    if (!creds) {
      appendLog("Select a connected WordPress property or enter custom Application Password credentials.");
      return;
    }
    setIsBusy(true);
    appendLog(`Syncing MCP catalog from ${creds.siteUrl}...`);
    try {
      const cat = await fetchEmcpSiteCatalog(creds);
      setCatalog(cat);
      appendLog(`Loaded ${cat.toolCount} MCP tools from ${cat.mcpUrl}.`);
    } catch (err) {
      appendLog(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  }, [resolveCreds, appendLog]);

  const handleScanAuditOnly = useCallback(async () => {
    const creds = resolveCreds();
    if (!creds) {
      appendLog("Select a connected WordPress property or enter custom Application Password credentials.");
      return;
    }
    setIsBusy(true);
    appendLog("Running neo-pulse/read (audit, get-business-details, list-locations)...");
    try {
      const [auditRes, bizRes, locRes] = await Promise.all([
        executeEmcpTool<EmcpAuditReport>({
          ...creds,
          tool: "neo-pulse/read",
          operation: "audit",
        }),
        executeEmcpTool<Record<string, unknown>>({
          ...creds,
          tool: "neo-pulse/read",
          operation: "get-business-details",
        }),
        executeEmcpTool<{ locations?: Array<Record<string, unknown>> }>({
          ...creds,
          tool: "neo-pulse/read",
          operation: "list-locations",
        }),
      ]);
      setFindings(auditRes.data?.findings ?? []);
      setBusinessDetails(bizRes.data ?? null);
      setLocations(Array.isArray(locRes.data?.locations) ? locRes.data.locations : []);
      appendLog(`Audit complete: ${auditRes.data?.finding_count ?? 0} findings.`);
    } catch (err) {
      appendLog(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  }, [resolveCreds, appendLog]);

  const handleRunAuditWorkflow = useCallback(
    async (forceCommit = false) => {
      const creds = resolveCreds();
      if (!creds) {
        appendLog("Select a connected WordPress property or enter custom Application Password credentials.");
        return;
      }
      setIsBusy(true);
      try {
        const { output } = await neoEmcpAuditAndFixWorkflow.run(
          {
            siteId: selectedSiteId !== "__custom__" ? selectedSiteId : undefined,
            siteUrl: creds.siteUrl,
            username: creds.username,
            appPassword: creds.appPassword,
            dryRunOnly: forceCommit ? false : dryRunOnly,
          },
          {
            apiKey,
            siteId: selectedSiteId !== "__custom__" ? selectedSiteId : undefined,
            onStepProgress: (ev) => {
              appendLog(`[${ev.phase.toUpperCase()}] ${ev.title}`);
            },
          },
        );
        setPlanSummary(output.planSummary);
        setDryRunResults(output.dryRunResults);
        setCommittedResults(output.committedResults);
        await handleScanAuditOnly();
      } catch (err) {
        appendLog(err instanceof Error ? err.message : String(err));
      } finally {
        setIsBusy(false);
      }
    },
    [resolveCreds, selectedSiteId, dryRunOnly, apiKey, appendLog, handleScanAuditOnly],
  );

  const handleRunCommandWorkflow = useCallback(async () => {
    const creds = resolveCreds();
    if (!creds || !commandPrompt.trim()) {
      appendLog("Enter a command instruction and select a connected WordPress site.");
      return;
    }
    setIsBusy(true);
    try {
      const { output } = await neoEmcpCommandWorkflow.run(
        {
          siteId: selectedSiteId !== "__custom__" ? selectedSiteId : undefined,
          siteUrl: creds.siteUrl,
          username: creds.username,
          appPassword: creds.appPassword,
          dryRunOnly,
          instruction: commandPrompt.trim(),
        },
        {
          apiKey,
          siteId: selectedSiteId !== "__custom__" ? selectedSiteId : undefined,
          onStepProgress: (ev) => {
            appendLog(`[${ev.phase.toUpperCase()}] ${ev.title}`);
          },
        },
      );
      setPlanSummary(output.summary);
      setPlannedSteps(output.plannedSteps);
      setCommandResults(output.results);
      appendLog(`Completed ${output.results.length} Neo EMCP steps.`);
    } catch (err) {
      appendLog(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  }, [resolveCreds, commandPrompt, selectedSiteId, dryRunOnly, apiKey, appendLog]);

  const handleLoadHistory = useCallback(async () => {
    const creds = resolveCreds();
    if (!creds) return;
    setIsBusy(true);
    try {
      const res = await executeEmcpTool<{ history?: EmcpHistoryEntry[] }>({
        ...creds,
        tool: "neo-pulse/read",
        operation: "list-history",
      });
      setHistoryEntries(Array.isArray(res.data?.history) ? res.data.history : []);
      appendLog(`Loaded ${res.data?.history?.length ?? 0} MCP undo history entries.`);
    } catch (err) {
      appendLog(err instanceof Error ? err.message : String(err));
    } finally {
      setIsBusy(false);
    }
  }, [resolveCreds, appendLog]);

  const handleUndoWrite = useCallback(
    async (id: string) => {
      const creds = resolveCreds();
      if (!creds) return;
      setIsBusy(true);
      try {
        await executeEmcpTool({
          ...creds,
          tool: "neo-pulse/write",
          operation: "undo",
          arguments: { id },
        });
        appendLog(`Restored snapshot ${id}.`);
        await handleLoadHistory();
      } catch (err) {
        appendLog(err instanceof Error ? err.message : String(err));
      } finally {
        setIsBusy(false);
      }
    },
    [resolveCreds, appendLog, handleLoadHistory],
  );

  const handleExecuteManualTool = useCallback(
    async (params: { tool: string; operation: string; argumentsJson: string }) => {
      const creds = resolveCreds();
      if (!creds) {
        appendLog("Select a connected WordPress property or enter custom Application Password credentials.");
        return;
      }
      setIsBusy(true);
      try {
        const parsedArgs = params.argumentsJson.trim()
          ? (JSON.parse(params.argumentsJson) as Record<string, unknown>)
          : {};
        const res = await executeEmcpTool({
          ...creds,
          tool: params.tool,
          operation: params.operation || undefined,
          arguments: parsedArgs,
        });
        setLastManualResult(res.data);
        appendLog(`Executed ${res.tool} ${res.operation} (${res.durationMs}ms).`);
      } catch (err) {
        appendLog(err instanceof Error ? err.message : String(err));
      } finally {
        setIsBusy(false);
      }
    },
    [resolveCreds, appendLog],
  );

  const progressSnapshot: MetaBulkMicroSnapshot = useMemo(
    () => ({
      active: isBusy,
      done: isBusy ? 0 : 1,
      total: 1,
      label: statusMessage,
    }),
    [isBusy, statusMessage],
  );

  const detailsPanel = (
    <div className="flex flex-col gap-2 p-3 font-mono text-base text-zinc-200">
      <div className="text-base font-semibold text-primary">Neo EMCP Mastra Step Log</div>
      {stepLogs.length === 0 ? (
        <div className="text-base text-muted-foreground">No steps run yet.</div>
      ) : (
        stepLogs.map((line, i) => (
          <div key={i} className="text-base text-zinc-300">
            {line}
          </div>
        ))
      )}
    </div>
  );

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-background text-base">
      <NeoEmcpWorkspaceHeader
        mode={mode}
        onModeChange={(next) => {
          setMode(next);
          if (next === "history") void handleLoadHistory();
        }}
        sites={enabledSites}
        selectedSiteId={selectedSiteId}
        onSelectSiteId={setSelectedSiteId}
        customSiteUrl={customSiteUrl}
        onCustomSiteUrlChange={setCustomSiteUrl}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        dryRunOnly={dryRunOnly}
        onDryRunOnlyChange={setDryRunOnly}
        toolCount={catalog?.toolCount ?? 0}
        findingCount={findings.length}
        isBusy={isBusy}
        onSyncCatalog={() => void handleSyncCatalog()}
        onRunAuditAndFix={() => {
          setMode("audit");
          void handleRunAuditWorkflow(false);
        }}
        progressSnapshot={progressSnapshot}
        detailsPanel={detailsPanel}
      />

      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {selectedSiteId === "__custom__" ? (
          <div className="grid grid-cols-1 gap-2 bg-zinc-900 p-3 md:grid-cols-3">
            <Input
              type="url"
              value={customSiteUrl}
              onChange={(e) => setCustomSiteUrl(e.target.value)}
              placeholder="Site URL (https://blindswebsitet.wpenginepowered.com)"
              aria-label="Site URL"
              className={BULK_HEADER_FIELD}
            />
            <Input
              type="text"
              value={customUsername}
              onChange={(e) => setCustomUsername(e.target.value)}
              placeholder="WordPress username or email"
              aria-label="WordPress username"
              className={BULK_HEADER_FIELD}
            />
            <Input
              type="password"
              value={customAppPassword}
              onChange={(e) => setCustomAppPassword(e.target.value)}
              placeholder="WordPress Application Password"
              aria-label="WordPress Application Password"
              className={BULK_HEADER_FIELD}
            />
          </div>
        ) : null}

        {mode === "command" ? (
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 bg-zinc-900 p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-base font-semibold uppercase tracking-wider text-primary">
                  Mastra Multi-Tool Command Studio
                </span>
                <span className="font-mono text-base text-muted-foreground">
                  Agent: emcp.ops.command-planner
                </span>
              </div>
              <Textarea
                value={commandPrompt}
                onChange={(e) => setCommandPrompt(e.target.value)}
                placeholder="Describe any WordPress, Elementor, Neo Tools, or Neo Pulse SEO/schema operation (e.g. Audit business details, set Pages default schema to off, and list all showroom locations)..."
                aria-label="Neo EMCP Command Prompt"
                rows={4}
                className="rounded-none border-0 bg-black text-base text-foreground focus-visible:ring-2 focus-visible:ring-primary"
              />
              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  onClick={() => void handleRunCommandWorkflow()}
                  disabled={isBusy || !commandPrompt.trim()}
                  className={BULK_HEADER_RUN_BTN}
                >
                  <Play className="h-4 w-4" />
                  {dryRunOnly ? "Plan & Run Dry-Run Preview" : "Plan & Execute Live"}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setMode("audit");
                    void handleScanAuditOnly();
                  }}
                  disabled={isBusy}
                  className={BULK_HEADER_TOOL_BTN}
                >
                  Open 8-Point Schema Audit
                </Button>
              </div>
            </div>

            {commandResults.length > 0 ? (
              <div className="flex flex-col gap-2 bg-zinc-900 p-4">
                <h3 className="text-base font-semibold uppercase tracking-wider text-primary">
                  Command Execution Results ({commandResults.length})
                </h3>
                {planSummary ? (
                  <p className="text-base text-muted-foreground">{planSummary}</p>
                ) : null}
                {commandResults.map((res) => (
                  <div key={res.id} className="flex flex-col gap-1 bg-black p-3">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-base text-primary">
                        {res.tool} {res.operation ? `-> ${res.operation}` : ""}
                      </span>
                      <span className="font-mono text-base tabular-nums text-muted-foreground">
                        {res.durationMs}ms
                      </span>
                    </div>
                    <pre className="overflow-x-auto bg-zinc-950 p-2 font-mono text-base text-zinc-200">
                      {JSON.stringify(res.data ?? res.error, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}

        {mode === "audit" ? (
          <NeoEmcpAuditPanel
            findings={findings}
            businessDetails={businessDetails}
            locations={locations}
            planSummary={planSummary}
            plannedSteps={plannedSteps}
            dryRunResults={dryRunResults}
            committedResults={committedResults}
            isBusy={isBusy}
            onRunAuditOnly={() => void handleScanAuditOnly()}
            onRunDoctorPlanAndPreview={() => void handleRunAuditWorkflow(false)}
            onCommitPlannedFixes={() => void handleRunAuditWorkflow(true)}
          />
        ) : null}

        {mode === "catalog" ? (
          <NeoEmcpToolCatalogPanel
            catalog={catalog}
            searchQuery={searchQuery}
            isBusy={isBusy}
            onExecuteManualTool={handleExecuteManualTool}
            lastManualResult={lastManualResult}
          />
        ) : null}

        {mode === "history" ? (
          <div className="flex flex-col gap-3 bg-zinc-900 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold uppercase tracking-wider text-primary">
                Neo Pulse MCP Write History (`neo_pulse_wp_mcp_history`)
              </h3>
              <Button
                type="button"
                onClick={() => void handleLoadHistory()}
                disabled={isBusy}
                className={BULK_HEADER_TOOL_BTN}
              >
                Refresh History
              </Button>
            </div>
            {historyEntries.length === 0 ? (
              <p className="text-base text-muted-foreground">
                No MCP write snapshots recorded yet on this site.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2">
                {historyEntries.map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-3 bg-black p-3"
                  >
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-base font-semibold text-primary">
                          {entry.operation}
                        </span>
                        <span className="font-mono text-base text-muted-foreground">
                          {entry.id}
                        </span>
                        <span className="text-base tabular-nums text-muted-foreground">
                          {entry.date}
                        </span>
                      </div>
                      <span className="text-base text-white">{entry.summary}</span>
                    </div>
                    <Button
                      type="button"
                      disabled={isBusy || entry.undone}
                      onClick={() => void handleUndoWrite(entry.id)}
                      className={BULK_HEADER_TOOL_BTN}
                    >
                      <Undo2 className="mr-1.5 h-4 w-4" />
                      {entry.undone ? "Undone" : "Undo Write"}
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
};
