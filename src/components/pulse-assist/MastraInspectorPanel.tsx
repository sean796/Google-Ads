import React, { useState, useSyncExternalStore } from "react";
import { ChevronDown, Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { OverviewDocRevisionsSection } from "@/components/pulse-assist/OverviewDocRevisionsSection";
import { OverviewDocSerpMetaCard } from "@/components/overview/studio/OverviewDocSerpMetaCard";
import { usePulseAssistContext } from "@/contexts/pulse-assist-context";
import {
  getStudioDocMetaInspectorBridge,
  subscribeStudioDocMetaInspectorBridge,
} from "@/lib/overview/studio-doc-meta-bridge";
import { cn } from "@/lib/utils";

function triggerDownloadText(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType || "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function MastraInspectorPanel() {
  const { overview } = usePulseAssistContext();
  const [briefOpen, setBriefOpen] = useState<boolean>(true);

  const docMetaBridge = useSyncExternalStore(
    subscribeStudioDocMetaInspectorBridge,
    getStudioDocMetaInspectorBridge,
    getStudioDocMetaInspectorBridge,
  );

  const seoResearchVal = docMetaBridge?.row.seoResearch ?? "";

  if (!docMetaBridge) {
    return (
      <div className="flex min-h-0 flex-1 flex-col justify-center bg-zinc-950 px-5 py-8 text-center text-base text-muted-foreground">
        Select an article or page in the Content Optimizer to inspect and edit its SEO Title, Meta Description, Focus Keyword, URL Slug, and Research Brief.
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto bg-zinc-950 px-5 py-5 text-base text-white">
      {/* 1. WordPress-Style Document SEO & Meta Inspector */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-white">Page SEO & Meta</span>
          <span className="bg-zinc-900 px-2 py-0.5 text-base text-cyan-400">
            {overview.sitemapSource?.toUpperCase() || "DOC"}
          </span>
        </div>
        <OverviewDocSerpMetaCard
          row={docMetaBridge.row}
          rowIndex={docMetaBridge.rowIndex}
          busy={docMetaBridge.busy}
          onUpdateRow={docMetaBridge.onUpdateRow}
          onAiKeyword={docMetaBridge.onAiKeyword}
          onAiUrl={docMetaBridge.onAiUrl}
          onAiTitle={docMetaBridge.onAiTitle}
          onAiMeta={docMetaBridge.onAiMeta}
          onAiAllMeta={docMetaBridge.onAiAllMeta}
          onResearchRow={docMetaBridge.onResearchRow}
          onSetDateToday={docMetaBridge.onSetDateToday}
          onCommitDateModifier={docMetaBridge.onCommitDateModifier}
        />
      </div>

      {/* 2. SEO Research Brief Inspector (Editable + Downloadable) */}
      <div className="flex flex-col gap-2.5 border-t border-white/10 pt-4">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setBriefOpen((prev) => !prev)}
            className="flex min-w-0 flex-1 items-center gap-2 text-left font-semibold text-white hover:text-primary"
          >
            <FileText className="h-4 w-4 shrink-0 text-cyan-400" aria-hidden />
            <span>SEO Research Brief</span>
            <span className="ml-auto tabular-nums text-sky-400">
              {seoResearchVal.length.toLocaleString()} chars
            </span>
            <ChevronDown
              className={cn("h-4 w-4 shrink-0 transition-transform", briefOpen && "rotate-180")}
              aria-hidden
            />
          </button>
          {seoResearchVal.trim() ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 shrink-0 rounded-none border-0 bg-zinc-900 px-2 text-base text-cyan-400 hover:bg-zinc-800 hover:text-white"
              onClick={() =>
                triggerDownloadText(
                  `seo-research-brief-${docMetaBridge.row.postId || "row"}.json`,
                  seoResearchVal,
                  "application/json;charset=utf-8",
                )
              }
              title="Download SEO Research Brief JSON"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
            </Button>
          ) : null}
        </div>

        {briefOpen ? (
          <Textarea
            value={seoResearchVal}
            onChange={(e) =>
              docMetaBridge.onUpdateRow(docMetaBridge.rowIndex, {
                seoResearch: e.target.value,
              })
            }
            rows={10}
            placeholder="No research brief on this row yet. Click Research above to pull DataForSEO + GSC + Semrush data."
            aria-label="SEO Research Brief"
            className="min-h-[14rem] w-full resize-y rounded-none border-0 bg-zinc-900 px-3 py-2.5 font-mono text-base leading-relaxed text-zinc-200 placeholder:font-sans placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-primary"
          />
        ) : null}
      </div>

      <OverviewDocRevisionsSection pageUrl={docMetaBridge.row.url} />
    </div>
  );
}
