import React from "react";
import { Cpu, Play, RefreshCw, ShieldCheck, Terminal, Undo2, Wrench } from "lucide-react";
import { UnifiedWorkspaceChrome } from "@/components/shared/UnifiedWorkspaceChrome";
import { WorkspacePill } from "@/components/shared/WorkspacePill";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  BULK_HEADER_FIELD,
  BULK_HEADER_RUN_BTN,
  BULK_HEADER_SELECT_TRIGGER,
  BULK_HEADER_TOOL_BTN,
  BULK_TOOLBAR_GROUP_DIVIDER,
} from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import type { MetaBulkMicroSnapshot } from "@/components/overview/OverviewBulkMicroProgress";
import type { WordPressSite } from "@/components/integrations/types";
import { cn } from "@/lib/utils";

export type NeoEmcpModeId = "command" | "audit" | "catalog" | "history";

export interface NeoEmcpWorkspaceHeaderProps {
  mode: NeoEmcpModeId;
  onModeChange: (mode: NeoEmcpModeId) => void;
  sites: WordPressSite[];
  selectedSiteId: string;
  onSelectSiteId: (siteId: string) => void;
  customSiteUrl: string;
  onCustomSiteUrlChange: (url: string) => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  dryRunOnly: boolean;
  onDryRunOnlyChange: (dryRun: boolean) => void;
  toolCount: number;
  findingCount: number;
  isBusy: boolean;
  onSyncCatalog: () => void;
  onRunAuditAndFix: () => void;
  progressSnapshot: MetaBulkMicroSnapshot | null;
  detailsPanel: React.ReactNode;
}

export const NeoEmcpWorkspaceHeader: React.FC<NeoEmcpWorkspaceHeaderProps> = ({
  mode,
  onModeChange,
  sites,
  selectedSiteId,
  onSelectSiteId,
  customSiteUrl,
  onCustomSiteUrlChange,
  searchQuery,
  onSearchQueryChange,
  dryRunOnly,
  onDryRunOnlyChange,
  toolCount,
  findingCount,
  isBusy,
  onSyncCatalog,
  onRunAuditAndFix,
  progressSnapshot,
  detailsPanel,
}) => {
  const titleRowMenu = (
    <div className="flex items-center gap-1.5">
      <WorkspacePill
        label="Command Studio"
        icon={Terminal}
        active={mode === "command"}
        square
        onClick={() => onModeChange("command")}
      />
      <WorkspacePill
        label="Schema & SEO Audit"
        icon={ShieldCheck}
        active={mode === "audit"}
        square
        onClick={() => onModeChange("audit")}
      />
      <WorkspacePill
        label="Tool Library"
        icon={Wrench}
        active={mode === "catalog"}
        square
        onClick={() => onModeChange("catalog")}
      />
      <WorkspacePill
        label="Undo History"
        icon={Undo2}
        active={mode === "history"}
        square
        onClick={() => onModeChange("history")}
      />
    </div>
  );

  const titleRowEnd = (
    <div className="flex items-center gap-2 text-base tabular-nums text-muted-foreground">
      <span className="bg-black px-2.5 py-1 text-foreground">
        Tools <strong className="text-primary">{toolCount}</strong>
      </span>
      <span className="bg-black px-2.5 py-1 text-foreground">
        Audit <strong className={findingCount > 0 ? "text-amber-400" : "text-primary"}>{findingCount}</strong>
      </span>
    </div>
  );

  const toolbar = (
    <>
      <Select value={selectedSiteId} onValueChange={onSelectSiteId}>
        <SelectTrigger
          aria-label="Target WordPress property"
          className={cn(BULK_HEADER_SELECT_TRIGGER, "min-w-[14rem]")}
        >
          <SelectValue placeholder="Target WordPress property" />
        </SelectTrigger>
        <SelectContent className="rounded-none border-white/10 bg-zinc-900 text-foreground">
          {sites.map((site) => (
            <SelectItem key={site.id} value={site.id} className="text-base">
              {site.name || site.siteUrl}
            </SelectItem>
          ))}
          <SelectItem value="__custom__" className="text-base">
            Custom WordPress site URL
          </SelectItem>
        </SelectContent>
      </Select>

      {selectedSiteId === "__custom__" ? (
        <Input
          type="url"
          value={customSiteUrl}
          onChange={(e) => onCustomSiteUrlChange(e.target.value)}
          placeholder="WordPress site URL (https://...)"
          aria-label="WordPress site URL"
          className={cn(BULK_HEADER_FIELD, "w-64")}
        />
      ) : null}

      <div className={BULK_TOOLBAR_GROUP_DIVIDER} aria-hidden />

      <Input
        type="search"
        value={searchQuery}
        onChange={(e) => onSearchQueryChange(e.target.value)}
        placeholder="Filter tools or operations"
        aria-label="Filter tools or operations"
        className={cn(BULK_HEADER_FIELD, "w-56")}
      />

      <WorkspacePill
        label={dryRunOnly ? "Mode: Dry Run Preview" : "Mode: Live Commit"}
        active={dryRunOnly}
        square
        onClick={() => onDryRunOnlyChange(!dryRunOnly)}
      />

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <Button
          type="button"
          onClick={onSyncCatalog}
          disabled={isBusy}
          className={BULK_HEADER_TOOL_BTN}
        >
          <RefreshCw className={cn("mr-1.5 h-4 w-4", isBusy && "animate-spin")} />
          Sync MCP
        </Button>
        <Button
          type="button"
          onClick={onRunAuditAndFix}
          disabled={isBusy}
          className={BULK_HEADER_RUN_BTN}
        >
          <Play className="h-4 w-4" />
          {dryRunOnly ? "Audit & Preview Fixes" : "Audit & Apply Fixes"}
        </Button>
      </div>
    </>
  );

  return (
    <UnifiedWorkspaceChrome
      icon={Cpu}
      iconClassName="text-primary [&_svg]:!text-primary"
      title="Neo EMCP"
      titleRowMenu={titleRowMenu}
      titleRowEnd={titleRowEnd}
      toolbar={toolbar}
      workspaceBusy={isBusy}
      progressBand="full"
      progressSnapshot={progressSnapshot}
      canOpenDetails
      isProcessing={isBusy}
      detailsPanelId="neo-emcp-details-drawer"
      detailsPanel={detailsPanel}
    />
  );
};
