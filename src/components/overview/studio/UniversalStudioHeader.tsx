import React, { useMemo, type ReactNode } from "react";
import { ChevronDown, Download, ExternalLink, FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  isResearchStudioMode,
  STUDIO_EDITOR_MODE_OPTIONS,
  type StudioEditorModeId,
} from "@/components/keyword-research/bulk/studio-editor-modes";
import {
  DETAILS_DRAWER_PANEL,
  DETAILS_DRAWER_SHELL,
} from "@/components/integrations/wordpress/bulk-details-drawer-styles";
import {
  META_FIELD_COUNT,
  META_FIELD_END_RAIL,
  META_FIELD_END_RAIL_BTN,
  META_FIELD_END_RAIL_CELL,
} from "@/components/overview/MetaOptimizerPageRowDetails";
import { CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS } from "@/components/overview/overview-tab/overview-tab-content-constants";
import type { BulkDetailsDownloadable } from "@/components/shared/bulk-details-tile-sections";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_CSV_DOWNLOADED } from "@/lib/notify-messages";
import { cn } from "@/lib/utils";

export interface UniversalStudioHeaderProps {
  /** Studio mode ID (prompt, blog-import, csv, press-release, research-proposal). */
  studioEditorMode?: StudioEditorModeId;
  /** Studio mode change handler. */
  onStudioEditorModeChange?: (mode: StudioEditorModeId) => void;
  /** Overall workspace busy state (disables mode select, etc.). */
  bulkWorkspaceBusy?: boolean;

  /** Active row / page canonical URL. */
  activeUrl?: string | null;
  /** Public URL for live viewing in new tab. */
  publicUrl?: string | null;
  /** Human-friendly URL label or path hint. */
  urlDisplayLabel?: string | null;
  /** Title + URL agents running: show breathing URL placeholder instead of raw path. */
  titleUrlOptimizing?: boolean;
  /** Fallback site origin / URL when no specific row is selected. */
  siteUrl?: string | null;

  /** Row 2 left zone: filters, selects, image options, schedule, etc. */
  filters?: ReactNode;
  /** Row 2 right zone: action buttons (Sync, Auto SEO, Generate, Publish, etc.). */
  actions?: ReactNode;

  /** Active operation in-flight indicator. */
  busy?: boolean;
  /** Current step description or status label. */
  activeHeadlineText?: string;
  /** Current step number. */
  displayStepCurrent?: number;
  /** Total step count. */
  totalStepCount?: number;
  /** List of ready generated artifacts/files available for download. */
  allReadyFiles?: BulkDetailsDownloadable[];
  /** Custom handler for downloading all ready files. */
  onDownloadAll?: () => void;

  /** Controlled state for the detailed drawer. */
  drawerOpen: boolean;
  /** Drawer toggle handler. */
  onToggleDrawer: () => void;
  /** Detailed drawer body content (checklist, artifacts, inventory). */
  drawerContent?: ReactNode;
  /** ARIA panel identifier for the collapsible drawer. */
  detailsPanelId?: string;
  /** Title attribute for the end rail count. */
  endRailTitle?: string;

  /** Container class overrides. */
  className?: string;
  /** Drawer container class overrides. */
  detailsDrawerClassName?: string;
}

function triggerBlobDownload(file: BulkDetailsDownloadable) {
  const blob = new Blob([file.content], { type: file.mimeType || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = file.name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function UniversalStudioHeader({
  studioEditorMode,
  onStudioEditorModeChange,
  bulkWorkspaceBusy = false,
  activeUrl,
  publicUrl,
  urlDisplayLabel,
  titleUrlOptimizing = false,
  siteUrl,
  filters,
  actions,
  busy = false,
  activeHeadlineText = "",
  displayStepCurrent = 0,
  totalStepCount = 0,
  allReadyFiles = [],
  onDownloadAll,
  drawerOpen,
  onToggleDrawer,
  drawerContent,
  detailsPanelId = "universal-studio-details-panel",
  endRailTitle = "Sections & SEO artifacts",
  className,
  detailsDrawerClassName,
}: UniversalStudioHeaderProps) {
  const displayTotal = Math.max(totalStepCount, 0);
  const displayCompleted =
    displayTotal > 0 ? Math.min(displayStepCurrent, displayTotal) : 0;

  const handleDownloadAllFiles = () => {
    if (onDownloadAll) {
      onDownloadAll();
      return;
    }
    allReadyFiles.forEach((f, idx) => {
      setTimeout(() => triggerBlobDownload(f), idx * 200);
    });
    notify.success(NOTIFY_CSV_DOWNLOADED);
  };

  // Determine external URL for new tab viewing
  const externalHref = useMemo(() => {
    const raw = publicUrl?.trim() || activeUrl?.trim() || siteUrl?.trim() || "";
    if (!raw) return null;
    return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  }, [publicUrl, activeUrl, siteUrl]);

  const displayPath = useMemo(() => {
    if (urlDisplayLabel?.trim()) return urlDisplayLabel.trim();
    if (publicUrl?.trim()) {
      try {
        const u = new URL(publicUrl.trim());
        return u.pathname || publicUrl.trim();
      } catch {
        return publicUrl.trim();
      }
    }
    if (activeUrl?.trim()) {
      try {
        const u = new URL(activeUrl.trim());
        return u.pathname || activeUrl.trim();
      } catch {
        return activeUrl.trim();
      }
    }
    if (siteUrl?.trim()) return siteUrl.trim();
    return null;
  }, [urlDisplayLabel, publicUrl, activeUrl, siteUrl]);

  return (
    <header
      className={cn(
        "relative z-30 flex w-full shrink-0 flex-col border-b bg-zinc-950 font-sans text-white transition-colors",
        busy ? "animate-meta-opt-breathe border-semantic-data/40" : "border-white/10",
        className,
      )}
      aria-label="Studio header"
    >
      {/* BAND 1: Studio Dropdown + External Live URL New Tab Link */}
      <div className="flex h-11 w-full min-w-0 shrink-0 items-center justify-between border-b border-white/10 bg-zinc-950 px-3 overflow-x-auto scrollbar-none">
        {/* Left: Studio Select + Vertical Separator + Live URL Link Out (Locked min/max to prevent CLS) */}
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          {studioEditorMode && onStudioEditorModeChange ? (
            <Select
              value={studioEditorMode}
              onValueChange={(val) => onStudioEditorModeChange(val as StudioEditorModeId)}
              disabled={bulkWorkspaceBusy}
            >
              <SelectTrigger
                aria-label="Studio module mode"
                className="h-8 w-[14.5rem] min-w-[14.5rem] max-w-[14.5rem] shrink-0 rounded-none border border-white/10 bg-zinc-900 px-2.5 text-xs font-semibold text-white hover:bg-zinc-800 focus-visible:ring-1 focus-visible:ring-primary [&>span]:truncate [&>span]:w-full text-left justify-between"
              >
                <SelectValue placeholder="Studio mode" />
              </SelectTrigger>
              <SelectContent className="rounded-none border border-white/10 bg-zinc-900 text-xs text-white">
                {STUDIO_EDITOR_MODE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.id} value={opt.id} className="rounded-none text-xs">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="inline-flex h-8 w-[14.5rem] min-w-[14.5rem] max-w-[14.5rem] shrink-0 items-center rounded-none border border-white/10 bg-zinc-900 px-2.5 text-xs font-semibold text-white">
              Visual Document Studio
            </div>
          )}

          <div className="h-5 w-px shrink-0 bg-white/15" aria-hidden="true" />

          {/* External Live URL New Tab Link - Fixed min/max width prevents layout jump */}
          {titleUrlOptimizing ? (
            <div
              className="inline-flex h-8 w-[20rem] min-w-[20rem] max-w-[20rem] shrink-0 flex-col justify-center gap-1 rounded-none border border-primary/35 bg-zinc-900 px-2.5 animate-meta-opt-breathe"
              role="status"
              aria-live="polite"
              aria-label="Optimizing title and URL"
            >
              <div className="h-2 w-4/5 max-w-full rounded-none bg-zinc-800" />
              <div className="h-1.5 w-3/5 max-w-full rounded-none bg-zinc-800/80" />
            </div>
          ) : externalHref ? (
            <a
              href={externalHref}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex h-8 w-[20rem] min-w-[20rem] max-w-[20rem] shrink-0 items-center justify-between rounded-none border border-white/10 bg-zinc-900 px-2.5 text-xs text-zinc-300 transition-colors hover:border-white/20 hover:bg-zinc-800 hover:text-white"
              title={`Open live URL in new tab: ${externalHref}`}
            >
              <span className="truncate font-mono text-[11px] text-zinc-300 group-hover:text-white mr-2 text-left">
                {displayPath || externalHref}
              </span>
              <ExternalLink
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                aria-hidden
              />
            </a>
          ) : (
            <div
              className="inline-flex h-8 w-[20rem] min-w-[20rem] max-w-[20rem] shrink-0 items-center justify-between rounded-none border border-white/5 bg-zinc-900/40 px-2.5 text-xs text-zinc-500"
              title="No active page or site URL"
            >
              <span className="font-mono text-[11px]">No active URL</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
            </div>
          )}
        </div>
      </div>

      {/* BAND 2: Filters on Left, Actions / Buttons on Right (Fixed height, flush, square) */}
      <div className="flex h-10 min-h-10 w-full min-w-0 shrink-0 items-center justify-between border-b border-white/10 bg-zinc-900/95 px-3">
        {/* Row 2 Left Zone: Module Filters & Controls */}
        <div id="universal-studio-band-2-filters" className="flex min-w-0 flex-1 items-center gap-1.5">
          {filters ? filters : null}
        </div>

        {/* Row 2 Right Zone: Action Buttons */}
        {actions ? (
          <div className="flex shrink-0 items-center gap-1.5">
            {actions}
          </div>
        ) : null}
      </div>

      {/* BAND 3: The Detailed Drawer / Generated Files Band (Its own dedicated row underneath Band 2!) */}
      <div className="relative flex h-10 min-h-10 w-full shrink-0 items-center justify-between border-b border-white/10 bg-zinc-950 px-3">
        {/* Left: Detailed Drawer Toggle */}
        <button
          type="button"
          onClick={onToggleDrawer}
          aria-expanded={drawerOpen}
          aria-controls={detailsPanelId}
          className="flex h-8 w-[10.5rem] min-w-[10.5rem] max-w-[10.5rem] shrink-0 items-center gap-2 border-0 bg-transparent p-0 text-left text-xs font-semibold text-white hover:text-primary transition-colors"
        >
          <FileDown className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span>Detailed Drawer</span>
        </button>

        {/* Center: Active Headline / Status Message */}
        <div className="flex min-w-0 flex-1 items-center justify-center px-4">
          {activeHeadlineText ? (
            <span
              className={cn(
                "truncate text-xs font-normal",
                busy ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-muted-foreground",
              )}
              role="status"
              aria-live="polite"
              title={activeHeadlineText}
            >
              {activeHeadlineText}
            </span>
          ) : null}
        </div>

        {/* Right Pinned Zone: Step Counter + End Rail + Download All + Chevron Toggle */}
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex w-[3.5rem] min-w-[3.5rem] max-w-[3.5rem] shrink-0 justify-end font-mono text-xs tabular-nums text-muted-foreground">
            {displayTotal > 0 ? (
              <>
                <span className={cn(busy ? CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS : "text-white")}>
                  {displayCompleted}
                </span>
                /{displayTotal}
              </>
            ) : (
              <span className="text-muted-foreground">0/0</span>
            )}
          </span>

          <div className={cn(META_FIELD_END_RAIL, "shrink-0 rounded-none border-white/10 bg-zinc-900")}>
            <span
              className={cn(
                META_FIELD_COUNT,
                META_FIELD_END_RAIL_CELL,
                "min-w-[1.75rem] font-mono font-semibold tabular-nums",
              )}
              title={endRailTitle}
            >
              {displayTotal > 0 ? displayTotal : "0"}
            </span>
            {allReadyFiles.length > 0 || onDownloadAll ? (
              <button
                type="button"
                className={cn(META_FIELD_END_RAIL_BTN, "hover:text-primary")}
                title="Download all files"
                aria-label="Download all files"
                onClick={handleDownloadAllFiles}
              >
                <Download className="h-3.5 w-3.5 shrink-0" />
              </button>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onToggleDrawer}
            aria-expanded={drawerOpen}
            aria-controls={detailsPanelId}
            aria-label={drawerOpen ? "Close detailed drawer" : "Open detailed drawer"}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-none border border-white/10 bg-zinc-900 text-white hover:bg-zinc-800 hover:text-primary transition-colors"
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform duration-200",
                drawerOpen && "rotate-180",
              )}
              aria-hidden
            />
          </button>
        </div>

        {/* DETAILED DRAWER: Structured Runs, Steps, Artifact Downloads, and Inventory (Overlay from Band 3) */}
        <div
          id={detailsPanelId}
          className={cn(
            DETAILS_DRAWER_SHELL,
            DETAILS_DRAWER_PANEL,
            detailsDrawerClassName,
            !drawerOpen && "hidden",
          )}
          aria-hidden={!drawerOpen}
        >
          {drawerContent}
        </div>
      </div>
    </header>
  );
}
