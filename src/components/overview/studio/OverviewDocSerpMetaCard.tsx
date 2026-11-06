import React from "react";
import { Calendar, Copy, KeyRound, Search, Sparkles, Wand2 } from "lucide-react";
import type { OverviewRow } from "@/components/overview/overview-meta-row-types";
import { patchRowForNewFocusKeyword } from "@/components/overview/overview-meta-row-patches";
import {
  CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
  CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
} from "@/components/overview/overview-tab/overview-tab-content-constants";
import { notify } from "@/lib/app-notifications";
import { NOTIFY_URL_COPIED_TO_CLIPBOARD } from "@/lib/notify-messages";
import { overviewRowUrlPathLabel } from "@/lib/overview/overview-tab-display";
import { cn } from "@/lib/utils";
import { Button, Field, TextareaField } from "@/ui";

export interface OverviewDocSerpMetaCardProps {
  row: OverviewRow;
  rowIndex: number;
  busy: boolean;
  onUpdateRow: (index: number, patch: Partial<OverviewRow>) => void;
  onAiKeyword: (index: number) => void | Promise<unknown>;
  onAiUrl: (index: number) => void | Promise<unknown>;
  onAiTitle: (index: number) => void | Promise<unknown>;
  onAiMeta: (index: number) => void | Promise<unknown>;
  onAiAllMeta: (index: number) => void | Promise<unknown>;
  onResearchRow: (index: number) => void | Promise<unknown>;
  onSetDateToday: (index: number) => void;
  onCommitDateModifier: (index: number) => void;
}

export function OverviewDocSerpMetaCard({
  row,
  rowIndex,
  busy,
  onUpdateRow,
  onAiKeyword,
  onAiUrl,
  onAiTitle,
  onAiMeta,
  onAiAllMeta,
  onResearchRow,
  onSetDateToday,
  onCommitDateModifier,
}: OverviewDocSerpMetaCardProps) {
  const titleVal = row.aiTitle?.trim() ? row.aiTitle : row.title || "";
  const metaVal = row.aiMeta?.trim() ? row.aiMeta : row.metaDescription || "";
  const slugPath = row.aiSuggestedPath?.trim() || overviewRowUrlPathLabel(row.url);

  const copyUrl = () => {
    if (!row.url) return;
    void navigator.clipboard.writeText(row.url);
    notify.success(NOTIFY_URL_COPIED_TO_CLIPBOARD);
  };

  return (
    <section
      aria-label="Document Title and Metadata"
      className="flex w-full flex-col gap-3.5 text-base text-white"
    >
      {/* SERP Live Preview Snippet */}
      <div className="flex flex-col gap-1 bg-ui-field p-4">
        <span className="break-words text-base text-primary">{row.url}</span>
        <span className="break-words font-semibold text-white">
          {titleVal || "SEO Title will appear here"}
        </span>
        <p className="text-base leading-relaxed text-foreground">
          {metaVal || "Meta description will appear here."}
        </p>
      </div>

      {/* Quick Actions: Research + All Meta */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="quiet"
          type="button"
          disabled={busy}
          onClick={() => void onResearchRow(rowIndex)}
          title="Run DataForSEO + GSC Research Brief"
        >
          <Search className="mr-2 h-4 w-4 text-semantic-analysis-foreground" aria-hidden />
          {row.seoResearch?.trim() ? "Brief Ready" : "Research"}
        </Button>

        <Button
          variant="quiet"
          type="button"
          disabled={busy}
          onClick={() => void onAiAllMeta(rowIndex)}
          title="Optimize both Title and Meta Description"
        >
          <Sparkles className="mr-2 h-4 w-4" aria-hidden />
          All Meta
        </Button>
      </div>

      {/* Focus Keyword */}
      <div
        className={cn(
          "flex items-center gap-1.5",
          row.status === "ai-focus-kw" && CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
        )}
      >
        <Field
          value={row.focusKeyword ?? ""}
          onChange={(e) =>
            onUpdateRow(rowIndex, patchRowForNewFocusKeyword(row, e.target.value))
          }
          placeholder="Focus keyword"
          aria-label="Focus keyword"
        />
        <Button
          size="icon" icon={KeyRound}
          variant="quiet"
          type="button"
          disabled={busy}
          onClick={() => void onAiKeyword(rowIndex)}
          title="Derive Focus Keyword"
          aria-label="Derive Focus Keyword"
        ></Button>
      </div>

      {/* SEO Title */}
      <div
        className={cn(
          "flex items-center gap-1.5",
          row.status === "ai-title" && CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
        )}
      >
        <Field
          value={titleVal}
          onChange={(e) =>
            onUpdateRow(rowIndex, { title: e.target.value, aiTitle: e.target.value })
          }
          placeholder="SEO Title (50-60 chars)"
          aria-label="SEO Title"
        />
        <span className="flex h-10 min-w-[4.25rem] shrink-0 items-center justify-center bg-ui-field px-2 text-base tabular-nums text-semantic-analysis-foreground">
          {titleVal.length}/60
        </span>
        <Button
          size="icon" icon={Wand2}
          variant="quiet"
          type="button"
          disabled={busy}
          onClick={() => void onAiTitle(rowIndex)}
          title="Rewrite Title via Pulse Engine"
          aria-label="Rewrite Title via Pulse Engine"
        ></Button>
      </div>

      {/* Meta Description */}
      <div
        className={cn(
          "flex flex-col gap-1.5",
          row.status === "ai-meta" && CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
        )}
      >
        <TextareaField
          value={metaVal}
          onChange={(e) =>
            onUpdateRow(rowIndex, {
              metaDescription: e.target.value,
              aiMeta: e.target.value,
            })
          }
          rows={3}
          placeholder="Meta Description (130-150 chars)"
          aria-label="SERP Meta Description"
        />
        <div className="flex items-center justify-between gap-2">
          <span className="flex h-9 items-center bg-ui-field px-3 text-base tabular-nums text-semantic-analysis-foreground">
            {metaVal.length}/150 chars
          </span>
          <Button
            variant="quiet"
            type="button"
            disabled={busy}
            onClick={() => void onAiMeta(rowIndex)}
            title="Rewrite Meta Description via Pulse Engine"
          >
            <Wand2 className="mr-1.5 h-4 w-4 text-primary" aria-hidden />
            Write Meta
          </Button>
        </div>
      </div>

      {/* URL Slug */}
      <div
        className={cn(
          "flex items-center gap-1.5",
          row.status === "ai-url" && CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
        )}
      >
        <Field
          value={slugPath}
          onChange={(e) => onUpdateRow(rowIndex, { aiSuggestedPath: e.target.value })}
          placeholder="URL slug"
          aria-label="URL path slug"
        />
        <Button
          size="icon" icon={Wand2}
          variant="quiet"
          type="button"
          disabled={busy}
          onClick={() => void onAiUrl(rowIndex)}
          title="Optimize URL Slug"
          aria-label="Optimize URL Slug"
        ></Button>
        <Button
          size="icon" icon={Copy}
          variant="quiet"
          type="button"
          onClick={copyUrl}
          title="Copy full URL"
          aria-label="Copy full URL"
        ></Button>
      </div>

      {/* Date Modifier */}
      <div className="flex items-center gap-1.5">
        <Field
          value={row.dateModifier ?? ""}
          onChange={(e) => onUpdateRow(rowIndex, { dateModifier: e.target.value })}
          onBlur={() => onCommitDateModifier(rowIndex)}
          placeholder="YYYY-MM-DD"
          aria-label="Date modifier"
        />
        <Button
          size="icon" icon={Calendar}
          variant="quiet"
          type="button"
          disabled={busy}
          onClick={() => onSetDateToday(rowIndex)}
          title="Set date to today"
          aria-label="Set date to today"
        ></Button>
      </div>
    </section>
  );
}
