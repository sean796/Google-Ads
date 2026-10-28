import React from "react";
import { Calendar, Copy, KeyRound, Search, Sparkles, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

const FLAT_WELL_INPUT =
  "rounded-none border-0 bg-zinc-900 text-base text-white placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary";

const SIDEBAR_ICON_BTN =
  "h-10 w-10 shrink-0 rounded-none border-0 bg-zinc-900 text-muted-foreground hover:bg-zinc-800 hover:text-primary disabled:opacity-45";

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
      <div className="flex flex-col gap-1 bg-zinc-900 p-4">
        <span className="truncate text-base text-primary">{row.url}</span>
        <span className="truncate font-semibold text-white">
          {titleVal || "SEO Title will appear here"}
        </span>
        <p className="line-clamp-2 text-base leading-relaxed text-zinc-300">
          {metaVal || "Meta description will appear here."}
        </p>
      </div>

      {/* Quick Actions: Research + All Meta */}
      <div className="grid grid-cols-2 gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => void onResearchRow(rowIndex)}
          className={cn(
            "h-10 w-full justify-center rounded-none border-0 bg-zinc-900 px-3 text-base font-medium text-white hover:bg-zinc-800",
            row.seoResearch?.trim() && "text-primary",
            row.status === "research-faq" && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
          )}
          title="Run DataForSEO + GSC Research Brief"
        >
          <Search className="mr-2 h-4 w-4 text-cyan-400" aria-hidden />
          {row.seoResearch?.trim() ? "Brief Ready" : "Research"}
        </Button>

        <Button
          type="button"
          variant="ghost"
          disabled={busy}
          onClick={() => void onAiAllMeta(rowIndex)}
          className="h-10 w-full justify-center rounded-none border-0 bg-primary px-3 text-base font-semibold text-black hover:bg-primary/90"
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
        <Input
          value={row.focusKeyword ?? ""}
          onChange={(e) =>
            onUpdateRow(rowIndex, patchRowForNewFocusKeyword(row, e.target.value))
          }
          placeholder="Focus keyword"
          aria-label="Focus keyword"
          className={cn(
            FLAT_WELL_INPUT,
            "h-10 flex-1 px-3",
            row.status === "ai-focus-kw" && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={() => void onAiKeyword(rowIndex)}
          title="Derive Focus Keyword"
          aria-label="Derive Focus Keyword"
          className={SIDEBAR_ICON_BTN}
        >
          <KeyRound className="h-4 w-4 text-primary" aria-hidden />
        </Button>
      </div>

      {/* SEO Title */}
      <div
        className={cn(
          "flex items-center gap-1.5",
          row.status === "ai-title" && CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
        )}
      >
        <Input
          value={titleVal}
          onChange={(e) =>
            onUpdateRow(rowIndex, { title: e.target.value, aiTitle: e.target.value })
          }
          placeholder="SEO Title (50-60 chars)"
          aria-label="SEO Title"
          className={cn(
            FLAT_WELL_INPUT,
            "h-10 flex-1 px-3 font-medium",
            row.status === "ai-title" && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
          )}
        />
        <span className="flex h-10 min-w-[4.25rem] shrink-0 items-center justify-center bg-zinc-900 px-2 text-base tabular-nums text-sky-400">
          {titleVal.length}/60
        </span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={() => void onAiTitle(rowIndex)}
          title="Rewrite Title via Mastra"
          aria-label="Rewrite Title via Mastra"
          className={SIDEBAR_ICON_BTN}
        >
          <Wand2 className="h-4 w-4 text-primary" aria-hidden />
        </Button>
      </div>

      {/* Meta Description */}
      <div
        className={cn(
          "flex flex-col gap-1.5",
          row.status === "ai-meta" && CONTENT_OPTIMIZER_ACTIVE_ROW_HIGHLIGHT_CLASS,
        )}
      >
        <Textarea
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
          className={cn(
            FLAT_WELL_INPUT,
            "min-h-[5.25rem] w-full resize-y px-3 py-2.5 leading-relaxed",
            row.status === "ai-meta" && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
          )}
        />
        <div className="flex items-center justify-between gap-2">
          <span className="flex h-9 items-center bg-zinc-900 px-3 text-base tabular-nums text-sky-400">
            {metaVal.length}/150 chars
          </span>
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => void onAiMeta(rowIndex)}
            title="Rewrite Meta Description via Mastra"
            className="h-9 rounded-none border-0 bg-zinc-900 px-3 text-base text-white hover:bg-zinc-800"
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
        <Input
          value={slugPath}
          onChange={(e) => onUpdateRow(rowIndex, { aiSuggestedPath: e.target.value })}
          placeholder="URL slug"
          aria-label="URL path slug"
          className={cn(
            FLAT_WELL_INPUT,
            "h-10 flex-1 px-3 font-mono text-cyan-400",
            row.status === "ai-url" && CONTENT_OPTIMIZER_ACTIVE_ROW_TEXT_CLASS,
          )}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={() => void onAiUrl(rowIndex)}
          title="Optimize URL Slug"
          aria-label="Optimize URL Slug"
          className={SIDEBAR_ICON_BTN}
        >
          <Wand2 className="h-4 w-4 text-primary" aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={copyUrl}
          title="Copy full URL"
          aria-label="Copy full URL"
          className={SIDEBAR_ICON_BTN}
        >
          <Copy className="h-4 w-4" aria-hidden />
        </Button>
      </div>

      {/* Date Modifier */}
      <div className="flex items-center gap-1.5">
        <Input
          value={row.dateModifier ?? ""}
          onChange={(e) => onUpdateRow(rowIndex, { dateModifier: e.target.value })}
          onBlur={() => onCommitDateModifier(rowIndex)}
          placeholder="YYYY-MM-DD"
          aria-label="Date modifier"
          className={cn(FLAT_WELL_INPUT, "h-10 flex-1 px-3 tabular-nums")}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={busy}
          onClick={() => onSetDateToday(rowIndex)}
          title="Set date to today"
          aria-label="Set date to today"
          className={SIDEBAR_ICON_BTN}
        >
          <Calendar className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </section>
  );
}
