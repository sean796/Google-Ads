import React, { useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  BULK_HEADER_FIELD,
  BULK_HEADER_RUN_BTN,
  BULK_HEADER_TOOL_BTN,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type { EmcpSiteCatalog } from "@/lib/emcp/neo-emcp-api";
import { cn } from "@/lib/utils";

export interface NeoEmcpToolCatalogPanelProps {
  catalog: EmcpSiteCatalog | null;
  searchQuery: string;
  isBusy: boolean;
  onExecuteManualTool: (params: {
    tool: string;
    operation: string;
    argumentsJson: string;
  }) => Promise<void>;
  lastManualResult: unknown;
}

export const NeoEmcpToolCatalogPanel: React.FC<NeoEmcpToolCatalogPanelProps> = ({
  catalog,
  searchQuery,
  isBusy,
  onExecuteManualTool,
  lastManualResult,
}) => {
  const [selectedTool, setSelectedTool] = useState<string>("neo-pulse/read");
  const [selectedOperation, setSelectedOperation] = useState<string>("get-business-details");
  const [argumentsJson, setArgumentsJson] = useState<string>("{}");

  const q = searchQuery.trim().toLowerCase();
  const tools = (catalog?.tools ?? []).filter((t) => {
    if (!q) return true;
    return (
      t.name.toLowerCase().includes(q) ||
      (t.description ?? "").toLowerCase().includes(q)
    );
  });

  const neoPulseReadOps = Object.entries(catalog?.neoPulseRead?.operations ?? {});
  const neoPulseWriteOps = Object.entries(catalog?.neoPulseWrite?.operations ?? {});
  const neoToolsReadOps = Object.entries(catalog?.neoToolsRead?.operations ?? {});
  const neoToolsWriteOps = Object.entries(catalog?.neoToolsWrite?.operations ?? {});

  const selectDispatcherOp = (tool: string, op: string, defaultArgs: Record<string, unknown> = {}) => {
    setSelectedTool(tool);
    setSelectedOperation(op);
    setArgumentsJson(JSON.stringify(defaultArgs, null, 2));
  };

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <div className="flex flex-col gap-3 bg-zinc-900 p-4 lg:col-span-5">
        <h3 className="text-base font-semibold uppercase tracking-wider text-primary">
          Direct Tool & Dispatcher Runner
        </h3>
        <Input
          type="text"
          value={selectedTool}
          onChange={(e) => setSelectedTool(e.target.value)}
          placeholder="Tool name (e.g. neo-pulse/read or emcp-tools-list-pages)"
          aria-label="Tool name"
          className={cn(BULK_HEADER_FIELD, "w-full font-mono")}
        />
        <Input
          type="text"
          value={selectedOperation}
          onChange={(e) => setSelectedOperation(e.target.value)}
          placeholder="Dispatcher operation (e.g. get-business-details, or empty)"
          aria-label="Dispatcher operation"
          className={cn(BULK_HEADER_FIELD, "w-full font-mono")}
        />
        <Textarea
          value={argumentsJson}
          onChange={(e) => setArgumentsJson(e.target.value)}
          placeholder="JSON arguments (e.g. { &quot;dry_run&quot;: true })"
          aria-label="JSON arguments"
          rows={6}
          className="rounded-none border-0 bg-black font-mono text-base text-foreground focus-visible:ring-2 focus-visible:ring-primary"
        />
        <div className="flex items-center gap-2">
          <Button
            type="button"
            disabled={isBusy || !selectedTool.trim()}
            onClick={() =>
              void onExecuteManualTool({
                tool: selectedTool.trim(),
                operation: selectedOperation.trim(),
                argumentsJson,
              })
            }
            className={BULK_HEADER_RUN_BTN}
          >
            <Play className="h-4 w-4" />
            Execute Tool Call
          </Button>
          <Button
            type="button"
            disabled={isBusy}
            onClick={() => selectDispatcherOp("neo-pulse/read", "", {})}
            className={BULK_HEADER_TOOL_BTN}
          >
            Load Catalog
          </Button>
        </div>

        {lastManualResult !== null && lastManualResult !== undefined ? (
          <pre className="max-h-96 overflow-auto bg-black p-3 font-mono text-base text-zinc-200">
            {JSON.stringify(lastManualResult, null, 2)}
          </pre>
        ) : null}
      </div>

      <div className="flex flex-col gap-4 lg:col-span-7">
        <div className="flex flex-col gap-2 bg-zinc-900 p-4">
          <h3 className="text-base font-semibold uppercase tracking-wider text-primary">
            Neo Pulse & Neo Tools Abilities API Dispatchers
          </h3>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {neoPulseReadOps.map(([op, meta]) => (
              <button
                key={`npr_${op}`}
                type="button"
                onClick={() => selectDispatcherOp("neo-pulse/read", op)}
                className="flex flex-col gap-1 bg-black p-3 text-left transition-colors hover:bg-zinc-950"
              >
                <span className="font-mono text-base font-semibold text-primary">
                  neo-pulse/read : {op}
                </span>
                <span className="text-base text-muted-foreground">{meta.description}</span>
              </button>
            ))}
            {neoPulseWriteOps.map(([op, meta]) => (
              <button
                key={`npw_${op}`}
                type="button"
                onClick={() => selectDispatcherOp("neo-pulse/write", op, { dry_run: true })}
                className="flex flex-col gap-1 bg-black p-3 text-left transition-colors hover:bg-zinc-950"
              >
                <span className="font-mono text-base font-semibold text-amber-400">
                  neo-pulse/write : {op}
                </span>
                <span className="text-base text-muted-foreground">{meta.description}</span>
              </button>
            ))}
            {neoToolsReadOps.map(([op, meta]) => (
              <button
                key={`ntr_${op}`}
                type="button"
                onClick={() => selectDispatcherOp("neo-tools/read", op)}
                className="flex flex-col gap-1 bg-black p-3 text-left transition-colors hover:bg-zinc-950"
              >
                <span className="font-mono text-base font-semibold text-primary">
                  neo-tools/read : {op}
                </span>
                <span className="text-base text-muted-foreground">{meta.description}</span>
              </button>
            ))}
            {neoToolsWriteOps.map(([op, meta]) => (
              <button
                key={`ntw_${op}`}
                type="button"
                onClick={() => selectDispatcherOp("neo-tools/write", op, { dry_run: true })}
                className="flex flex-col gap-1 bg-black p-3 text-left transition-colors hover:bg-zinc-950"
              >
                <span className="font-mono text-base font-semibold text-amber-400">
                  neo-tools/write : {op}
                </span>
                <span className="text-base text-muted-foreground">{meta.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 bg-zinc-900 p-4">
          <h3 className="text-base font-semibold uppercase tracking-wider text-muted-foreground">
            Full EMCP 3.20.0 Pro Library ({tools.length} tools)
          </h3>
          <div className="grid max-h-[32rem] grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
            {tools.map((t) => (
              <button
                key={t.name}
                type="button"
                onClick={() => selectDispatcherOp(t.name, "", {})}
                className="flex flex-col gap-1 bg-black p-3 text-left transition-colors hover:bg-zinc-950"
              >
                <span className="font-mono text-base font-semibold text-white">{t.name}</span>
                <span className="line-clamp-2 text-base text-muted-foreground">
                  {t.description || "EMCP WordPress & Elementor tool"}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
