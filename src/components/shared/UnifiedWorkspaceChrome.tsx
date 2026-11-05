import React, { type CSSProperties, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { BULK_TOOLBAR_GROUP_DIVIDER } from "@/components/keyword-research/bulk/bulk-workspace-header-styles";
import {
  MetaBulkMicroProgress,
  type MetaBulkMicroSnapshot,
} from "@/components/overview/OverviewBulkMicroProgress";
import type { MetaBulkActionKey, BulkProgressSlice } from "@/components/overview/overview-tab-constants";
import { cn } from "@/lib/utils";
import { DetailsDockPortal } from "@/components/pulse-assist/details-dock";

/** Fixed chrome height so workspace tabs do not shift layout. */
export const UNIFIED_TITLE_BAND_CLASS =
  "flex h-12 shrink-0 items-center bg-ui-field px-3 sm:px-3.5";
export const UNIFIED_TOOLBAR_CLASS =
  "flex h-11 w-full min-w-0 shrink-0 min-h-11 flex-nowrap items-center justify-start gap-1.5 overflow-x-auto bg-black px-3 sm:px-3.5";
export const UNIFIED_PROGRESS_BAND_CLASS =
  "relative z-20 flex h-11 w-full shrink-0 items-center overflow-visible bg-ui-field px-3 sm:px-3.5";

type UnifiedWorkspaceChromeBaseProps = {
  icon: LucideIcon;
  /** Optional override for title-band icon color (default: white). */
  iconClassName?: string;
  title: string;
  /** Fixed-width wrapper for icon + title (e.g. generator section label reserve). */
  titleLeadingSlot?: {
    className?: string;
    style?: CSSProperties;
    /** Invisible longest label in a grid sizes the slot to real text width. */
    reserveLabel?: string;
  };
  /** Mode menu immediately right of the title (e.g. Content | Multi-site). */
  titleRowMenu?: ReactNode;
  titleRowEnd?: ReactNode;
  toolbar: ReactNode;
  workspaceBusy: boolean;
  /** Omit the black toolbar band when controls live in the body grid. */
  hideToolbar?: boolean;
  /** Square outer frame and controls (default: true). */
  squareFrame?: boolean;
};

type UnifiedWorkspaceChromeFullProgressProps = UnifiedWorkspaceChromeBaseProps & {
  /** Default: full progress bar; Details content goes to the right sidebar. */
  progressBand?: "full";
  /** Optional leading slot in the progress band (e.g. grid pagination). */
  progressLeading?: ReactNode;
  progressSnapshot: MetaBulkMicroSnapshot | null;
  /** Optional per-action progress slices for the embedded micro progress bar. */
  bulkActionProgress?: Partial<Record<MetaBulkActionKey, BulkProgressSlice>>;
  /** Hide the idle progress track (no bar when list still has empty rows). */
  hideIdleProgressTrack?: boolean;
  canOpenDetails: boolean;
  isProcessing: boolean;
  detailsPanelId: string;
  detailsPanel: ReactNode;
};

type UnifiedWorkspaceChromeEmptyProgressProps = UnifiedWorkspaceChromeBaseProps & {
  /** Empty third grey band (no progress bar, no Details). */
  progressBand: "empty";
};

export type UnifiedWorkspaceChromeProps =
  | UnifiedWorkspaceChromeFullProgressProps
  | UnifiedWorkspaceChromeEmptyProgressProps;

export function UnifiedWorkspaceChrome(props: UnifiedWorkspaceChromeProps) {
  const {
    icon: Icon,
    iconClassName,
    title,
    titleLeadingSlot,
    titleRowMenu,
    titleRowEnd,
    toolbar,
    workspaceBusy,
    squareFrame = true,
    hideToolbar = false,
  } = props;

  const titleIconClassName = iconClassName ?? "text-white [&_svg]:!text-white";

  const progressBand = props.progressBand ?? "full";
  const isEmptyProgressBand = progressBand === "empty";
  const isProcessing =
    !isEmptyProgressBand && "isProcessing" in props ? props.isProcessing : false;
  /** Blue neon frame (Content Optimizer parity) while run is active. */
  const chromeBusyGlow = workspaceBusy || isProcessing;

  return (
    <div className="w-full max-w-full shrink-0 font-sans text-base font-normal">
      <div
        data-unified-workspace-chrome-frame
        className={cn(
          "relative flex w-full max-w-full flex-col overflow-visible border [&_button]:text-base [&_button]:font-normal [&_h2]:font-normal",
          squareFrame ? "rounded-none [&_button]:rounded-none [&_input]:rounded-none" : "rounded-lg",
          chromeBusyGlow
            ? "z-20 animate-meta-opt-breathe border-semantic-data/40"
            : "border-white/[0.08]",
        )}
      >
        <div className={UNIFIED_TITLE_BAND_CLASS}>
          <div className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <div
              className={cn(
                "flex min-w-0 shrink-0 items-center",
                titleLeadingSlot?.reserveLabel ? "gap-[10px]" : "gap-2",
              )}
            >
              <div
                className={cn(
                  titleLeadingSlot?.reserveLabel
                    ? "inline-grid shrink-0"
                    : "flex items-center gap-2",
                  titleLeadingSlot?.className,
                )}
                style={titleLeadingSlot?.reserveLabel ? undefined : titleLeadingSlot?.style}
              >
                {titleLeadingSlot?.reserveLabel ? (
                  <div
                    className="col-start-1 row-start-1 flex items-center gap-2 invisible pointer-events-none"
                    aria-hidden
                  >
                    <span className="inline-flex h-5 w-5 shrink-0" />
                    <span className="whitespace-nowrap text-base font-normal">
                      {titleLeadingSlot.reserveLabel}
                    </span>
                  </div>
                ) : null}
                <div
                  className={cn(
                    "flex min-w-0 items-center gap-2",
                    titleLeadingSlot?.reserveLabel && "col-start-1 row-start-1",
                  )}
                >
                  <span
                    className={cn("inline-flex shrink-0 [&_svg]:h-5 [&_svg]:w-5", titleIconClassName)}
                    aria-hidden
                  >
                    <Icon className="h-5 w-5 shrink-0" />
                  </span>
                  <h2 className="min-w-0 flex-1 break-words text-base font-normal text-white">{title}</h2>
                </div>
              </div>
              {titleRowMenu ? (
                <>
                  <div className={BULK_TOOLBAR_GROUP_DIVIDER} aria-hidden />
                  {titleRowMenu}
                </>
              ) : null}
            </div>
            {titleRowEnd ? (
              <div className="ml-auto flex shrink-0 items-center justify-end gap-2 overflow-hidden">
                {titleRowEnd}
              </div>
            ) : null}
          </div>
        </div>

        {hideToolbar ? null : (
          <nav className={UNIFIED_TOOLBAR_CLASS} aria-label={`${title} tools`}>
            {toolbar}
          </nav>
        )}

        <div className={UNIFIED_PROGRESS_BAND_CLASS} aria-hidden={isEmptyProgressBand}>
          {isEmptyProgressBand ? null : (
            <>
              <div className="flex w-full min-w-0 flex-1 items-center justify-start gap-2.5 overflow-visible">
                {props.progressLeading ? (
                  <div className="flex shrink-0 items-center justify-start">{props.progressLeading}</div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <MetaBulkMicroProgress
                    variant="embedded"
                    snapshot={props.progressSnapshot}
                    bulkActionProgress={props.bulkActionProgress}
                    hideIdleTrack={props.hideIdleProgressTrack === true}
                  />
                </div>
              </div>

              <DetailsDockPortal id={props.detailsPanelId}>{props.detailsPanel}</DetailsDockPortal>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
