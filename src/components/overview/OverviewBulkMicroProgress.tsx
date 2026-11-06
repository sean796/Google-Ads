import React from "react";
import { cn } from "@/lib/utils";
import type { BulkOptimizationState } from "@/hooks/content-optimization/use-optimization-state";
import {
  type MetaBulkActionKey,
  type BulkProgressSlice,
  type MetaPipelineStepUi,
} from "@/components/overview/overview-tab-constants";
import { pickActiveBulkProgressSlice } from "@/lib/overview/overview-bulk-inline-status";
import { WorkspaceDetailsPipelineStepRow } from "@/components/shared/WorkspaceDetailsPipelineSteps";
import { overviewGridCountLabelMinCh } from "@/components/overview/overview-grid-pagination-helpers";
import {
  resolveBulkPostTicker,
  shouldShowBulkInlineStatus,
  type MetaBulkMicroSnapshot,
} from "@/components/overview/overview-bulk-micro-progress-helpers";


export function BulkPostProgressLeading({
  batchState,
  className,
}: {
  batchState: BulkOptimizationState;
  className?: string;
}) {
  const ticker = resolveBulkPostTicker(batchState);
  if (!ticker) return null;
  const countMinCh = overviewGridCountLabelMinCh(ticker.total);

  return (
    <div
      className={cn(
        "flex min-h-11 flex-wrap items-center justify-start gap-2 rounded-none border border-border bg-ui-field px-3 py-2",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-label={`Processing post ${ticker.current} of ${ticker.total}`}
    >
      <span
        className="inline-block shrink-0 text-left text-base tabular-nums text-muted-foreground"
        style={{ minWidth: `${countMinCh}ch` }}
      >
        <span className="text-foreground">{ticker.current}</span>/
        <span className="text-foreground">{ticker.total}</span>
      </span>
    </div>
  );
}


function BulkInlineStatusRow({ message }: { message: string }) {
  return (
    <div
      className="flex min-w-0 items-center gap-2 text-base text-muted-foreground"
      role="status"
      aria-live="polite"
    >
      
      <span className="min-w-0 break-words" title={message}>
        {message}
      </span>
    </div>
  );
}

function PipelineStepRow({ step, index }: { step: MetaPipelineStepUi; index: number }) {
  return <WorkspaceDetailsPipelineStepRow step={step} stripeIndex={index} />;
}

/** Slim bar centered in slot; padding above/below the track. */
export const META_BULK_PROGRESS_SLOT_MIN_H = "h-8";

function HarnessNeonProgressBar({
  pct,
  indeterminate,
  ariaLabel,
  variant = "default",
}: {
  pct: number;
  indeterminate?: boolean;
  ariaLabel?: string;
  variant?: "default" | "header";
}) {
  if (variant === "header") {
    if (indeterminate) {
      return (
        <div
          className="neo-pulse-overview-header-progress-track w-full"
          aria-label={ariaLabel}
          aria-busy="true"
        >
          <div className="neo-pulse-overview-header-progress-indeterminate" aria-hidden />
        </div>
      );
    }
    const v = Math.min(100, Math.max(0, pct));
    return (
      <div className="neo-pulse-overview-header-progress-track w-full">
        <div
          className="neo-pulse-overview-header-progress-fill"
          style={{ width: `${v}%` }}
          role="progressbar"
          aria-valuenow={v}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={ariaLabel}
        />
      </div>
    );
  }

  if (indeterminate) {
    return (
      <div
        className="neo-pulse-competitor-progress-track h-2 w-full rounded-full"
        aria-label={ariaLabel}
        aria-busy="true"
      >
        <div className="neo-pulse-competitor-progress-indeterminate" aria-hidden />
      </div>
    );
  }
  const v = Math.min(100, Math.max(0, pct));
  return (
    <div className="neo-pulse-competitor-progress-track h-2 w-full rounded-full">
      <div
        className="neo-pulse-competitor-progress-fill h-full rounded-full transition-[width] duration-300 ease-out"
        style={{ width: `${v}%` }}
        role="progressbar"
        aria-valuenow={v}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={ariaLabel}
      />
    </div>
  );
}

function EmbeddedMicroProgressRow({
  title,
  pagesDone,
  pagesTotal,
  pct,
  idle = false,
  progressPct,
}: {
  title?: string;
  pagesDone: number;
  pagesTotal: number;
  pct: number;
  idle?: boolean;
  /** Harness batch step % (0–100); overrides page ratio when set. */
  progressPct?: number;
}) {
  const barAriaLabel = pagesTotal > 0 ? `${pagesDone} of ${pagesTotal} pages` : undefined;
  const allPagesDone = pagesTotal > 0 && pagesDone >= pagesTotal;
  /** Multi-post batch: bar = finished posts only (0% until first completes). */
  const fillPct = allPagesDone
    ? 100
    : typeof progressPct === "number" && Number.isFinite(progressPct)
      ? progressPct
      : pagesTotal > 1
        ? pct
        : pagesTotal > 0
          ? pct
          : 0;
  const inProgress = !idle && (pagesTotal === 0 || pagesDone < pagesTotal);
  /** Determinate 0→100 when total is known (same as Content Optimizer batch bar). */
  const indeterminate =
    inProgress &&
    typeof progressPct !== "number" &&
    pagesTotal === 0 &&
    fillPct <= 0;

  return (
    <div
      className={cn("flex w-full items-center", META_BULK_PROGRESS_SLOT_MIN_H)}
      role={idle ? undefined : "status"}
      aria-live={idle ? undefined : "polite"}
      title={title}
      aria-label={barAriaLabel}
    >
      {idle ? (
        <div
          className="neo-pulse-overview-header-progress-track w-full opacity-40"
          aria-hidden
        />
      ) : (
        <HarnessNeonProgressBar
          variant="header"
          pct={fillPct}
          indeterminate={indeterminate}
          ariaLabel={barAriaLabel}
        />
      )}
    </div>
  );
}

export function MetaBulkMicroProgress({
  snapshot,
  bulkActionProgress,
  idleMessage = "Idle - run a bulk action to see steps",
  headerLabel = "Progress",
  variant = "default",
  hideIdleTrack = false,
}: {
  snapshot: MetaBulkMicroSnapshot | null;
  bulkActionProgress?: Partial<Record<MetaBulkActionKey, BulkProgressSlice>>;
  idleMessage?: string;
  headerLabel?: string;
  /** Flat layout inside OverviewMetaWorkspaceBar; fixed height, no nested card. */
  variant?: "default" | "embedded";
  /** When true and idle, render no track (keep slot height). */
  hideIdleTrack?: boolean;
}) {
  const embedded = variant === "embedded";

  if (!snapshot) {
    if (embedded) {
      if (hideIdleTrack) {
        return <div className={cn("w-full", META_BULK_PROGRESS_SLOT_MIN_H)} aria-hidden />;
      }
      return (
        <EmbeddedMicroProgressRow
          idle
          title={idleMessage}
          pagesDone={0}
          pagesTotal={0}
          pct={0}
        />
      );
    }
    return (
      <div className="flex min-h-[2.25rem] flex-col justify-center gap-1.5 rounded-lg border border-white/[0.06] bg-black/45 px-2.5 py-2 shadow-none">
        <span className="text-base font-medium uppercase tracking-wide text-muted-foreground">
          {headerLabel}
        </span>
        <div className="flex h-1 gap-px">
          {Array.from({ length: 12 }).map((_, i) => (
            <span key={i} className="h-full min-w-[2px] flex-1 rounded-sm bg-muted/50" />
          ))}
        </div>
        <span className="text-base text-muted-foreground">{idleMessage}</span>
      </div>
    );
  }

  const pagesDone = Math.min(snapshot.completed, snapshot.total);
  const pagesTotal = snapshot.total;
  const pct = pagesTotal > 0 ? Math.min(100, (pagesDone / pagesTotal) * 100) : 0;
  const active = bulkActionProgress ? pickActiveBulkProgressSlice(bulkActionProgress) : null;
  const pipelineSteps = active?.slice.pipelineSteps ?? [];
  const inlineStatus =
    pipelineSteps.length > 0
      ? undefined
      : shouldShowBulkInlineStatus(snapshot.label, snapshot.statusMessage)
        ? snapshot.statusMessage?.trim()
        : undefined;
  const showHarnessChecklist = !embedded && pipelineSteps.length > 0;

  const barAriaLabel =
    pagesTotal > 0 ? `${pagesDone} of ${pagesTotal} pages` : undefined;
  const embeddedTitleFull = [snapshot.label, inlineStatus].filter(Boolean).join(" · ");

  if (embedded) {
    return (
      <EmbeddedMicroProgressRow
        title={embeddedTitleFull || undefined}
        pagesDone={pagesDone}
        pagesTotal={pagesTotal}
        pct={pct}
        progressPct={snapshot.progressPct}
      />
    );
  }

  return (
    <div
      className={cn(
        "flex min-w-0 flex-col justify-center gap-1.5",
        "min-h-[2.25rem] gap-1.5 rounded-lg border border-white/[0.06] bg-black/50 px-2.5 py-2 shadow-none",
      )}
    >
      <div className="flex min-h-0 items-center justify-between gap-2">
        <span
          className="flex min-w-0 items-center gap-2 text-base font-medium leading-tight text-foreground"
          title={inlineStatus ? snapshot.label : embeddedTitleFull}
        >
          {!inlineStatus && pagesTotal > 0 && pagesDone < pagesTotal ? (
            null
          ) : null}
          <span className="min-w-0 break-words">{snapshot.label}</span>
        </span>
        <span
          className="shrink-0 text-base tabular-nums text-muted-foreground"
          aria-label={barAriaLabel}
        >
          {pagesTotal > 0 ? `${pagesDone} / ${pagesTotal}` : ""}
        </span>
      </div>

      {inlineStatus ? <BulkInlineStatusRow message={inlineStatus} /> : null}

      <HarnessNeonProgressBar
        pct={snapshot.progressPct ?? pct}
        indeterminate={false}
        ariaLabel={barAriaLabel}
      />

      {showHarnessChecklist ? (
        <ul className="max-h-40 space-y-1 overflow-y-auto">
          {pipelineSteps.map((step, index) => (
            <PipelineStepRow key={step.id} step={step} index={index} />
          ))}
        </ul>
      ) : null}
    </div>
  );
}
