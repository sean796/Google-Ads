import React from "react";
import { Wrench } from "lucide-react";
import { Separator } from "@/ui";

import { cn } from "@/lib/utils";

export type OverviewContentFixSectionSliceProgress = {
  sectionIndex: number;
  sectionLabel: string;
  beforeHtml: string;
  afterHtml: string;
};

const FIX_PREVIEW_CODE = cn(
  "w-full min-w-0 rounded-md border border-white/20 bg-black/60 p-3 text-base leading-relaxed",
  "whitespace-pre-wrap break-words text-semantic-analysis-foreground/95 [overflow-wrap:anywhere]",
);

export interface OverviewContentFixPreviewPanelProps {
  slices: OverviewContentFixSectionSliceProgress[];
}

export function OverviewContentFixPreviewPanel({ slices }: OverviewContentFixPreviewPanelProps) {
  if (slices.length === 0) return null;

  return (
    <div
      className="mt-3 space-y-0 rounded-lg border border-white/10 bg-black/55 p-3 sm:p-4"
      aria-label="Agree and fix sectional preview"
    >
      <div className="flex items-start gap-2 pb-3">
        <Wrench className="mt-0.5 h-4 w-4 shrink-0 text-primary/90" aria-hidden />
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold uppercase tracking-[0.14em] text-white/85">
            Fix preview by section
          </h3>
          <p className="mt-1 text-base text-white/65">
            After HTML for each revised slice before upload stitches the full body.
          </p>
        </div>
      </div>

      {slices.map((s, si) => (
        <React.Fragment key={`fix-slice-${s.sectionIndex}-${si}`}>
          {si > 0 ? <Separator className="my-4 bg-white/15" decorative /> : null}

          <div className="space-y-3">
            <p className="text-base font-semibold text-white">
              <span className="text-white/65">{s.sectionIndex + 1}. </span>
              {s.sectionLabel || `Section ${s.sectionIndex + 1}`}
            </p>

            <details className="rounded-md bg-ui-field/55 open:pb-2" open={s.beforeHtml !== s.afterHtml}>
              <summary className="cursor-pointer select-none text-base font-medium text-white/90">
                Before (original slice)
              </summary>
              <pre className={cn(FIX_PREVIEW_CODE, "mt-2 max-h-80 overflow-auto")} tabIndex={0}>
                <code className="text-inherit">{s.beforeHtml.trim()}</code>
              </pre>
            </details>

            <details className="rounded-md bg-ui-field/55 open:pb-2" open={s.beforeHtml !== s.afterHtml}>
              <summary className="cursor-pointer select-none text-base font-medium text-primary/95">
                After (revised slice)
              </summary>
              <pre className={cn(FIX_PREVIEW_CODE, "mt-2 max-h-80 overflow-auto")} tabIndex={0}>
                <code className="text-inherit">{s.afterHtml.trim()}</code>
              </pre>
            </details>

            {s.beforeHtml.trim() === s.afterHtml.trim() ? (
              <p className="text-base text-white/55">No text change detected for this slice.</p>
            ) : null}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}
