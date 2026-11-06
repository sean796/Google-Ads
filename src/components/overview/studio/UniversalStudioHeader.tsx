import React, { useMemo, type ReactNode } from "react";
import { ExternalLink, FileDown } from "lucide-react";

import {
  STUDIO_EDITOR_MODE_OPTIONS,
  type StudioEditorModeId,
} from "@/components/keyword-research/bulk/studio-editor-modes";
import { DetailsDockPortal } from "@/components/pulse-assist/details-dock";
import type { BulkDetailsDownloadable } from "@/components/shared/bulk-details-tile-sections-helpers";
import { cn } from "@/lib/utils";
import { Button, SelectField } from "@/ui";

export interface UniversalStudioHeaderProps {
  /** Studio mode ID (prompt, vertical-benchmarks, csv, press-release). */
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
  /** Per-row prompt log (all model calls); button beside the URL box is disabled until present. */
  promptLogFile?: BulkDetailsDownloadable | null;

  /** Row 2 left zone: filters, selects, image options, schedule, etc. */
  filters?: ReactNode;
  /** Row 2 right zone: action buttons (Sync, Auto SEO, Generate, Publish, etc.). */
  actions?: ReactNode;

  /** Active operation in-flight indicator. */
  busy?: boolean;

  /** Details body content (shown in the right sidebar Details tab) (checklist, artifacts, inventory). */
  drawerContent?: ReactNode;
  /** ARIA panel identifier for the collapsible drawer. */
  detailsPanelId?: string;

  /** Container class overrides. */
  className?: string;
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
  promptLogFile = null,
  filters,
  actions,
  busy = false,
  drawerContent,
  detailsPanelId = "universal-studio-details-panel",
  className,
}: UniversalStudioHeaderProps) {
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
        "relative z-30 flex w-full shrink-0 flex-col border-b bg-black font-sans text-white transition-colors",
        busy ? "animate-meta-opt-breathe border-semantic-data/40" : "border-white/10",
        className,
      )}
      aria-label="Studio header"
    >
      {/* BAND 1: Studio Dropdown + External Live URL New Tab Link */}
      <div className="flex h-11 w-full min-w-0 shrink-0 items-center justify-between border-b border-white/10 bg-black px-3 overflow-x-auto scrollbar-none">
        {/* Left: Studio Select + Vertical Separator + Live URL Link Out (Locked min/max to prevent CLS) */}
        <div className="flex min-w-0 shrink-0 items-center gap-2">
          {studioEditorMode && onStudioEditorModeChange ? (
            <div className="flex w-[15rem] min-w-[15rem] max-w-[15rem] shrink-0 items-center">
              <SelectField placeholder="Studio module mode" tone="data" width="full" value={studioEditorMode} onValueChange={(v) => onStudioEditorModeChange(v as StudioEditorModeId)} disabled={bulkWorkspaceBusy} options={STUDIO_EDITOR_MODE_OPTIONS.map((opt) => ({ value: opt.id, label: opt.label }))} />
            </div>
          ) : (
            <div className="inline-flex h-8 w-[14.5rem] min-w-[14.5rem] max-w-[14.5rem] shrink-0 items-center rounded-none border border-white/10 bg-ui-field px-2.5 text-xs font-semibold text-white">
              Visual Document Studio
            </div>
          )}

          <div className="h-5 w-px shrink-0 bg-white/15" aria-hidden="true" />

          {/* External Live URL New Tab Link - Fixed min/max width prevents layout jump */}
          {titleUrlOptimizing ? (
            <div
              className="inline-flex h-8 w-[20rem] min-w-[20rem] max-w-[20rem] shrink-0 flex-col justify-center gap-1 rounded-none border border-primary/35 bg-ui-field px-2.5 animate-meta-opt-breathe"
              role="status"
              aria-live="polite"
              aria-label="Optimizing title and URL"
            >
              <div className="h-2 w-4/5 max-w-full rounded-none bg-ui-field-hover" />
              <div className="h-1.5 w-3/5 max-w-full rounded-none bg-ui-field-hover/80" />
            </div>
          ) : externalHref ? (
            <a
              href={externalHref}
              target="_blank"
              rel="noopener noreferrer"
              className="group inline-flex h-8 w-[20rem] min-w-[20rem] max-w-[20rem] shrink-0 items-center justify-between rounded-none border border-white/10 bg-ui-field px-2.5 text-xs text-foreground transition-colors hover:border-white/20 hover:bg-ui-field-hover hover:text-white"
              title={`Open live URL in new tab: ${externalHref}`}
            >
              <span className="min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-base text-foreground group-hover:text-white mr-2 text-left">
                {displayPath || externalHref}
              </span>
              <ExternalLink
                className="h-3.5 w-3.5 shrink-0 text-muted-foreground transition-colors group-hover:text-primary"
                aria-hidden
              />
            </a>
          ) : (
            <div
              className="inline-flex h-8 w-[20rem] min-w-[20rem] max-w-[20rem] shrink-0 items-center justify-between rounded-none border border-white/5 bg-ui-field/40 px-2.5 text-xs text-muted-foreground"
              title="No active page or site URL"
            >
              <span className="font-mono text-base">No active URL</span>
              <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-40" aria-hidden />
            </div>
          )}
          <Button
            size="icon" icon={FileDown}
            disabled={!promptLogFile}
            onClick={() => promptLogFile && triggerBlobDownload(promptLogFile)}
            title={promptLogFile ? "Download prompt log (every model call for this row)" : "Prompt log available after generation"}
            aria-label="Download prompt log"
          ></Button>
        </div>
      </div>

      {/* BAND 2: Filters on Left, Actions / Buttons on Right (Fixed height, flush, square) */}
      <div className="flex h-10 min-h-10 w-full min-w-0 shrink-0 items-center justify-between border-b border-white/10 bg-ui-field/95 px-3">
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

      <DetailsDockPortal id={detailsPanelId}>{drawerContent}</DetailsDockPortal>
    </header>
  );
}
