import { CheckCircle2, Circle, ExternalLink, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  BenchmarkInventoryHostedLink,
  BenchmarkPipelineProgress,
  BenchmarkPipelineStep,
} from "@/lib/vertical-benchmark/vertical-benchmark-pipeline-types";

type PipelineBodyProps = {
  progress: BenchmarkPipelineProgress | null;
  title: string;
  className?: string;
  inventoryLinks?: BenchmarkInventoryHostedLink[];
  /** Hide outer card chrome when embedded in Details drawer. */
  embedded?: boolean;
};

function pickMicroStep(steps: BenchmarkPipelineStep[]): BenchmarkPipelineStep | null {
  return (
    steps.find((s) => s.status === "active") ??
    steps.find((s) => s.status === "error") ??
    steps.find((s) => s.status === "waiting") ??
    null
  );
}

export function VerticalBenchmarkPipelineBody({
  progress,
  title,
  className,
  inventoryLinks: inventoryLinksProp,
  embedded = false,
}: PipelineBodyProps) {
  if (!progress && !(inventoryLinksProp?.length ?? 0)) return null;

  const links =
    progress?.inventoryLinks?.length ? progress.inventoryLinks
    : inventoryLinksProp?.length ? inventoryLinksProp
    : [];

  const pct = progress ? Math.min(100, Math.max(0, Math.round(progress.percent))) : 100;
  const micro = progress ? pickMicroStep(progress.steps) : null;
  const macroMessage = progress?.message.trim() ?? "";
  const busy = progress?.busy ?? false;
  const showProgressChrome = !embedded;
  /** Step row supersedes phase message (same site, duplicate copy). */
  const showMacroMessage = Boolean(macroMessage) && !micro;

  return (
    <div
      className={cn(
        embedded ? "space-y-2 p-3 sm:p-4" : "shrink-0 space-y-2 rounded-lg bg-black/25 p-3 sm:p-4",
        className,
      )}
      role="status"
      aria-live="polite"
      aria-busy={busy}
    >
      {showProgressChrome ? (
        <div className="flex items-center justify-between gap-2 text-base">
          <span className="font-semibold uppercase tracking-[0.14em] text-muted-foreground">{title}</span>
          {progress ? <span className="tabular-nums text-muted-foreground">{pct}%</span> : null}
        </div>
      ) : null}

      {showMacroMessage ? (
        <p className="text-base text-foreground">{macroMessage}</p>
      ) : null}

      {progress && showProgressChrome ? (
        <div className="space-y-1.5">
          <div className="neo-pulse-competitor-progress-track rounded-sm">
            {progress.indeterminate ? (
              <div className="neo-pulse-competitor-progress-indeterminate h-2" aria-hidden />
            ) : (
              <div
                className="neo-pulse-competitor-progress-fill h-2 rounded-sm transition-[width] duration-300 ease-out"
                style={{ width: `${pct}%` }}
                role="progressbar"
                aria-valuenow={pct}
                aria-valuemin={0}
                aria-valuemax={100}
              />
            )}
          </div>
        </div>
      ) : null}

      {micro ? (
        <div
          className="flex min-h-9 items-center gap-2 rounded-md bg-black/20 px-2 py-1.5 text-base"
          aria-label="Current step"
        >
          {micro.status === "active" ? (
            null
          ) : micro.status === "error" ? (
            <XCircle className="h-4 w-4 shrink-0 text-destructive" aria-hidden />
          ) : micro.status === "done" ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          ) : (
            <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" aria-hidden />
          )}
          <span className="min-w-0 flex-1 break-words font-medium text-foreground">
            {micro.label}
            {micro.detail && (micro.status === "active" || micro.status === "error") ?
              <span className="font-normal text-muted-foreground"> {micro.detail}</span>
            : null}
          </span>
        </div>
      ) : null}

      {links.length > 0 ? (
        <div className="space-y-1.5 rounded-md bg-black/20 px-2 py-2">
          <p className="text-base font-medium text-foreground">Site inventory JSON</p>
          <ul className="space-y-1">
            {links.map((link) => (
              <li key={link.siteId} className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-base">
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary underline-offset-2 hover:underline"
                >
                  {link.filename}
                </a>
                <span className="text-muted-foreground">
                  {link.siteName} ({link.rowCount} URLs)
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

type Props = {
  progress: BenchmarkPipelineProgress | null;
  title: string;
  className?: string;
  /** Persists after run completes when progress is cleared. */
  inventoryLinks?: BenchmarkInventoryHostedLink[];
};

export function VerticalBenchmarkPipelinePanel({
  progress,
  title,
  className,
  inventoryLinks,
}: Props) {
  return (
    <VerticalBenchmarkPipelineBody
      progress={progress}
      title={title}
      className={className}
      inventoryLinks={inventoryLinks}
    />
  );
}
